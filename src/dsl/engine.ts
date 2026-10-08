import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, GreedyArgumentNode, ForwardRootNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';

type Ancestors = CommandNode[];

/** 未被 walk 消费的 token（含其在 commands 中的下标） */
export interface Leftover {
    readonly token: string;
    readonly index: number;
}

/** validate() 的返回值 —— 全部是纯数据，可脱离 VS Code 单测 */
export interface ValidationResult {
    /** 命令是否已注册到引擎 */
    readonly known: boolean;
    /** walk 停下的节点；known=false 时为占位根节点 */
    readonly node: CommandNode | null;
    /** 未消费的 token */
    readonly leftovers: readonly Leftover[];
    /** 是否停在叶子节点 */
    readonly reachedLeaf: boolean;
    /** forward_root（execute 末段）之后仍有 token */
    readonly trailing: boolean;
    /** 叶子节点上还有多余 token —— 参数给多了 */
    readonly extraOnLeaf: boolean;
    /** 必填 argument 尚未取值 */
    readonly missingRequired: boolean;
}

export class CompletionEngine {
    /**
     * 供补全调度层使用的当前引擎引用。
     *
     * ⚠️ 这是**受控的全局引用**，不是「构造函数顺带覆盖的静态字段」。
     * 早先的实现是 `static instance: CompletionEngine` + 构造函数里赋值，
     * 导致 `new CompletionEngine()` 会静默篡改全局：调试时多 new 一个、
     * 或单元测试里 new 一个，都会把扩展正在用的引擎换成空的、补全静默失效。
     *
     * 现在改为由装配点（extension.ts）显式调用 setCurrent()，
     * 构造本身不再产生副作用。
     */
    private static current: CompletionEngine | undefined;

    /** 显式装配：把某个引擎设为当前使用的实例 */
    static setCurrent(engine: CompletionEngine | undefined): void {
        CompletionEngine.current = engine;
    }

    static getCurrent(): CompletionEngine | undefined {
        return CompletionEngine.current;
    }

    /** @deprecated 请改用 getCurrent() —— 保留仅为兼容既有调用点 */
    static get instance(): CompletionEngine | undefined {
        return CompletionEngine.current;
    }

    private roots: Map<string, RootNode> = new Map();
    private ctx: CompletionContext;

    constructor(loader: DataLoader) {
        this.ctx = new CompletionContext(loader);
    }

    register(root: RootNode): void { this.roots.set(root.commandName, root); }
    unregister(name: string): void { this.roots.delete(name); }
    has(cmd: string): boolean { return this.roots.has(cmd); }

    /** 已注册的全部命令名（供诊断层判断「命令表是否已加载」与拼写建议） */
    commandNames(): string[] { return [...this.roots.keys()]; }

    getRootItems(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const [name, root] of this.roots) {
            items.push(this.ctx.item(name, root.description || '', name, true));
        }
        return items;
    }

    static debug = false;

    // ================================================================
    // 主入口
    // ================================================================

    async complete(commands: string[], lineText: string): Promise<vscode.CompletionItem[]> {
        const result = this.walk(commands);
        if (!result.root) { return []; }

        const { node, ancestors, consumedRealToken } = result;
        const items = await this.suggest(node, ancestors, commands, lineText, consumedRealToken);

        if (CompletionEngine.debug) {
            console.log(`[DSL] ${commands.join(' ')} → ${items.length} 项`,
                items.map(i => typeof i.label === 'string' ? i.label : i.label.label));
        }
        return items;
    }

    // ================================================================
    // Validate — 校验入口（供诊断层使用）
    // ================================================================

    /**
     * 校验一行命令的语法，**不产生任何补全项**。
     *
     * 与 complete() 走同一条 walk 路径，但返回的是「错误」而非「候选」：
     * 用户敲错了参数顺序/多打了 token 时，walk 会卡在某个节点上并留下未消费的
     * token —— 这正是语法错误信号。早先这套信息被 walk 直接丢弃，
     * 导致引擎看得见错误却无处上报。
     *
     * @returns 命令不存在时 root 为 undefined（调用方应报 unknown-command）
     */
    validate(commands: readonly string[]): ValidationResult {
        const result = this.walk(commands);
        if (!result.root) {
            return {
                known: false, node: null, leftovers: [], reachedLeaf: true,
                trailing: false, extraOnLeaf: false, missingRequired: false,
            };
        }

        const { node, consumedRealToken } = result;
        const leftovers = result.leftovers;
        const reachedLeaf = node.children.length === 0;

        // 情况一：叶子节点却还有剩余 token —— 参数给多了
        // 例：/say hello extra（1.12.2 的 say 只收一个 rawtext）
        const extraOnLeaf = reachedLeaf && leftovers.length > 0;

        // 情况二：走到 forward_root 后还有 token —— execute 后又跟了东西
        const trailing = node.kind === 'forward_root' && leftovers.length > 0;

        // 情况三：argument 节点还没填值，且没有任何 suggest 可给 —— 缺必填参数
        const arg = node.kind === 'argument' ? node as ArgumentNode : null;
        const missingRequired = arg !== null
            && !consumedRealToken
            && arg.suggest === null
            && arg.argName.startsWith('<');   // optional('[x]') 用方括号，天然可省

        return {
            known: true,
            node,
            leftovers,
            reachedLeaf,
            trailing,
            extraOnLeaf,
            missingRequired,
        };
    }

    // ================================================================
    // Walk — 消费 token，沿树向下
    // ================================================================

    /**
     * 沿树消费 token。
     *
     * @returns root 为 undefined 表示命令未注册；
     *          leftovers 记录了未能消费的 token 及其在 commands 中的下标。
     */
    private walk(commands: readonly string[]): {
        root: RootNode | undefined;
        node: CommandNode;
        ancestors: Ancestors;
        consumedRealToken: boolean;
        leftovers: Leftover[];
    } {
        const root = this.roots.get(commands[0]);
        if (!root) {
            return {
                root: undefined,
                node: new RootNode(commands[0] ?? ''),
                ancestors: [],
                consumedRealToken: false,
                leftovers: commands.slice(1).map((token, i) => ({ token, index: i + 1 })),
            };
        }

        let node: CommandNode = root;
        const ancestors: Ancestors = [];
        let cursor = 1;
        let consumedRealToken = false;
        let stuck = false;

        while (cursor < commands.length) {
            // 贪婪参数：吃掉其余全部 token（含当前），此后不再有 leftovers
            if (node.kind === 'greedy') {
                consumedRealToken = true;
                cursor = commands.length;
                break;
            }

            const token = commands[cursor];
            const next = this.matchChild(node, token);
            if (!next) {
                // 不再前进：剩余 token 全部记为「未消费」，交给 validate() 判定
                stuck = true;
                break;
            }

            ancestors.push(node);
            node = next;
            cursor++;
            consumedRealToken = token !== '';
        }

        const leftovers: Leftover[] = [];
        if (stuck) {
            for (let i = cursor; i < commands.length; i++) {
                leftovers.push({ token: commands[i], index: i });
            }
        }

        return { root, node, ancestors, consumedRealToken, leftovers };
    }

    /**
     * 收集节点下的字面量子节点。
     *
     * forward_root 不在此处产出补全项：它表示「此处直接接一条命令」，
     * 补全内容由 suggest() 中的 getRootItems() 分支给出。
     * 早期版本曾在这里硬编码插入一个 `run` 关键字，但 1.12.2 的
     * execute <entity> <x> <y> <z> <command> 并没有 run —— 那是 1.13+ 的语法。
     */
    private collectLiterals(node: CommandNode): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
        }
        return items;
    }

    // ================================================================
    // Suggest — 从当前节点生成补全
    // ================================================================

    private async suggest(
        node: CommandNode,
        ancestors: Ancestors,
        commands: string[],
        lineText: string,
        consumedRealToken: boolean,
    ): Promise<vscode.CompletionItem[]> {
        // forward_root → 根命令列表
        if (node.kind === 'forward_root') { return this.getRootItems(); }

        // 贪婪参数 → 自由文本，无补全项可给
        if (node.kind === 'greedy') {
            return [{ label: (node as GreedyArgumentNode).argName, detail: '自由文本', insertText: '', kind: vscode.CompletionItemKind.Text, sortText: '￿' }];
        }

        // 若当前节点是 argument
        if (node.kind === 'argument') {
            const arg = node as ArgumentNode;
            // 未消费真实 token → 用户还没填值 → 展示 suggest
            if (!consumedRealToken && arg.suggest) {
                // argument 常与 literal 兄弟并列（如 effect 的 <target> 与 clear），
                // 只跑 suggest 会让 literal 分支永远补不出来，这里合并展示。
                const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
                const siblingItems = parent ? this.collectLiterals(parent) : [];
                if (siblingItems.length === 0) {
                    const ctx = this.mkCtx(commands, lineText);
                    const result = arg.suggest(ctx);
                    return result instanceof Promise ? await result : result;
                }
                const ctx = this.mkCtx(commands, lineText);
                const result = arg.suggest(ctx);
                const argItems = result instanceof Promise ? await result : result;
                return [...siblingItems, ...argItems];
            }
            // 展示子节点（literal/forward_root），无则占位符
            const subItems = this.collectLiterals(node);
            if (subItems.length > 0) { return subItems; }
            if (arg.suggest) {
                const ctx = this.mkCtx(commands, lineText);
                const result = arg.suggest(ctx);
                return result instanceof Promise ? await result : result;
            }
            return [{ label: arg.argName, detail: ' ', insertText: '', kind: vscode.CompletionItemKind.TypeParameter, sortText: '￿' }];
        }

        // 子节点中有 forward_root → 返回根命令列表
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return this.getRootItems(); }
        }

        const items: vscode.CompletionItem[] = [];

        // 字面量子节点
        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
        }

        // 参数子节点
        for (const child of node.children) {
            if (child.kind === 'argument') {
                const arg = child as ArgumentNode;
                if (arg.suggest) {
                    const ctx = this.mkCtx(commands, lineText);
                    const result = arg.suggest(ctx);
                    items.push(...(result instanceof Promise ? await result : result));
                } else {
                    items.push({
                        label: arg.argName, detail: ' ',
                        insertText: '', kind: vscode.CompletionItemKind.TypeParameter,
                        sortText: '￿',
                    });
                }
                break;
            }
            if (child.kind === 'greedy') {
                // 自由文本：无候选，仅作占位提示，排序置后
                items.push({
                    label: (child as GreedyArgumentNode).argName,
                    detail: '自由文本',
                    insertText: '',
                    kind: vscode.CompletionItemKind.Text,
                    sortText: '￿',
                });
                break;
            }
        }

        return items;
    }

    /** 构造 SuggestContext（集中一处，避免字段重复与 loader 的下标穿透） */
    private mkCtx(commands: string[], lineText: string): SuggestContext {
        return {
            loader: this.ctx.dataLoader,
            cc: this.ctx,
            item: (l, d, i, tn, k) => this.ctx.item(l, d, i, tn ?? true, k),
            commands,
            lineText,
        };
    }

    // ================================================================
    // Match — literal 优先，argument 兜底，forward_root 消费
    // ================================================================

    private matchChild(node: CommandNode, token: string): CommandNode | null {
        // 贪婪参数兜底：匹配它即视为消费任意 token
        for (const child of node.children) {
            if (child.kind === 'greedy') { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'literal' && (child as LiteralNode).literal === token) { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'argument') { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return child; }
        }
        return null;
    }
}
