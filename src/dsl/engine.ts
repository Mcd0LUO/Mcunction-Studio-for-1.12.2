import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, GreedyArgumentNode, ForwardRootNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';
import { valueSpanAt } from '../core/symbols/extractor';

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
    /** 内层命令位置上写了 1.13 的 `run` 关键字 */
    readonly trailing: boolean;
    /** 叶子节点上还有多余 token —— 参数给多了 */
    readonly extraOnLeaf: boolean;
    /** 必填 argument 尚未取值 */
    readonly missingRequired: boolean;
    /**
     * forward_root 之后第一个 token（即内层命令名）；不在 forward_root 时为 null。
     *
     * 引擎不递归校验内层命令，但至少要能确认"这里有一条命令"。
     * 空字符串表示用户刚敲完坐标还没输入命令。
     */
    readonly innerCommand: string | null;
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

    /**
     * 补全主入口。
     *
     * @param cursor 光标位置。传入时会为补全项**显式设置替换区间**：
     *               参数值候选替换已输入的前缀，下一级字面量插入在光标处。
     *               不传（单测里常见）则维持旧行为，由 VS Code 自行推算 ——
     *               那种推算对含 `:` `/` `.` 的 Minecraft 资源名并不准确。
     */
    async complete(
        commands: string[],
        lineText: string,
        cursor?: { line: number; character: number },
    ): Promise<vscode.CompletionItem[]> {
        // 空行 → 根命令列表。
        //
        // walk() 取 commands[0] 查根节点，空数组时拿到 undefined 就直接返回 []，
        // 于是 `complete([], '')` 静默给空结果。补全 provider 目前在更外层
        // （Base.provideRootCompletions）自行处理空行，UI 上看不出问题 ——
        // 但引擎本身应当自洽：调用方传空行就该拿到根命令。
        if (commands.length === 0 || commands[0] === '') {
            const roots = this.getRootItems();
            return cursor ? this.withRanges(roots, cursor, lineText, 'value') : roots;
        }

        const result = this.walk(commands);
        if (!result.root) { return []; }

        const { node, ancestors, consumedRealToken } = result;
        const items = await this.suggest(node, ancestors, commands, lineText, consumedRealToken, cursor);

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
                innerCommand: null,
            };
        }

        const { node, consumedRealToken, forwardRootAt } = result;
        const leftovers = result.leftovers;
        const reachedLeaf = node.children.length === 0;

        // 一旦走到 forward_root，**其后所有 token 都属于内层命令**。
        // 引擎不递归展开内层命令（forward_root 是叶子），因此这些 token
        // 会被 walk 记为"未消费" —— 但它们**不是**语法错误。
        //
        // ⚠️ 这里曾漏掉这个区分，导致每一条 execute 都被报
        //    「多余的参数」+「execute 之后的内容无法解析」两个 error，
        //    连 `execute @s ~ ~ ~ say hello` 这种完全合法的写法也不例外。
        const inForwardRoot = node.kind === 'forward_root';

        // 情况一：叶子节点却还有剩余 token —— 参数给多了
        // 例：/gamemode creative @s extra（<target> 已是叶子）
        const extraOnLeaf = reachedLeaf && leftovers.length > 0 && !inForwardRoot;

        // 情况二：内层命令的位置上写了 1.13 的 `run` 关键字
        // （1.12.2 坐标之后直接就是命令）
        const innerCommand = forwardRootAt >= 0 ? (commands[forwardRootAt] ?? '') : null;
        const trailing = inForwardRoot && innerCommand === 'run';

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
            innerCommand,
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
        /** 进入 forward_root 时消费的 token 下标；未进入为 -1 */
        forwardRootAt: number;
    } {
        const root = this.roots.get(commands[0]);
        if (!root) {
            return {
                root: undefined,
                node: new RootNode(commands[0] ?? ''),
                ancestors: [],
                consumedRealToken: false,
                leftovers: commands.slice(1).map((token, i) => ({ token, index: i + 1 })),
                forwardRootAt: -1,
            };
        }

        let node: CommandNode = root;
        const ancestors: Ancestors = [];
        let cursor = 1;
        let consumedRealToken = false;
        let stuck = false;
        let forwardRootAt = -1;

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
            // 记录「内层命令从这里开始」：forward_root 之后的一切都属于内层命令，
            // 不属于本层语法，validate() 据此避免把它们误判为多余 token。
            if (node.kind === 'forward_root') { forwardRootAt = cursor; }
            cursor++;
            consumedRealToken = token !== '';
        }

        const leftovers: Leftover[] = [];
        if (stuck) {
            for (let i = cursor; i < commands.length; i++) {
                leftovers.push({ token: commands[i], index: i });
            }
        }

        return { root, node, ancestors, consumedRealToken, leftovers, forwardRootAt };
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
        cursor?: { line: number; character: number },
    ): Promise<vscode.CompletionItem[]> {
        // forward_root → 根命令列表
        if (node.kind === 'forward_root') { return this.getRootItems(); }

        // 贪婪参数 → 吃掉其后全部 token；若挂了 suggest，则对首个 token 给出候选
        if (node.kind === 'greedy') {
            const g = node as GreedyArgumentNode;
            if (g.suggest) {
                const ctx = this.mkCtx(commands, lineText);
                const result = g.suggest(ctx);
                const items = result instanceof Promise ? await result : result;
                return this.withRanges([...items], cursor, lineText, 'value');
            }
            return [{ label: g.argName, detail: '自由文本', insertText: '', kind: vscode.CompletionItemKind.Text, sortText: '￿' }];
        }

        // 若当前节点是 argument
        if (node.kind === 'argument') {
            const arg = node as ArgumentNode;

            // ① 该参数自身的候选值（如 <name> 的函数名列表）—— **替换**已输入的前缀
            const own: vscode.CompletionItem[] = [];
            if (arg.suggest) {
                const ctx = this.mkCtx(commands, lineText);
                const result = arg.suggest(ctx);
                own.push(...(result instanceof Promise ? await result : result));
            }

            if (!consumedRealToken) {
                // 尚未输入任何值。
                // 有 suggest 时父节点下的兄弟字面量优先（如 effect 的 clear），
                // 让用户更容易发现分支；随后是本参数的候选值。
                if (arg.suggest) {
                    const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
                    const sib = parent ? this.collectLiterals(parent) : [];
                    return this.withRanges([...sib, ...own], cursor, lineText, 'value');
                }
                // 无 suggest 的参数：给出子字面量，否则占位符
                const subNoSuggest = this.collectLiterals(node);
                if (subNoSuggest.length > 0) {
                    return this.withRanges(subNoSuggest, cursor, lineText, 'insert');
                }
                return [{ label: arg.argName, detail: ' ', insertText: '', kind: vscode.CompletionItemKind.TypeParameter, sortText: '￿' }];
            }

            // 已开始输入该参数的值：
            //   参数自身候选值 → 替换前缀
            //   子字面量（下一级续接，如 if/unless、maskMode）→ 插入在光标处，不替换 token
            //
            // ⚠️ 早先这里是 `if (subItems.length > 0) return subItems;` ——
            // 一旦参数有字面量子节点，就会**吞掉参数自身的候选值**：
            // 输入 `function ns` 只看到 if/unless，函数名一个都补不出来。
            const sub = this.collectLiterals(node);
            const merged = [
                ...this.withRanges(own, cursor, lineText, 'value'),
                ...this.withRanges(sub, cursor, lineText, 'insert'),
            ];

            // 参数子节点的候选也要给出 —— 例如 particle 的 `[count]` 之下
            // 并列着 normal / force 与可省略 mode 的 [player]，
            // 只收字面量的话 `particle … 5 ` 就看不到 @a。
            for (const child of node.children) {
                if (child.kind !== 'argument') { continue; }
                const c2 = child as ArgumentNode;
                if (!c2.suggest) { continue; }
                const r2 = c2.suggest(this.mkCtx(commands, lineText));
                const items2 = r2 instanceof Promise ? await r2 : r2;
                merged.push(...this.withRanges([...items2], cursor, lineText, 'insert'));
            }

            if (merged.length > 0) { return merged; }

            // 自身与字面子节点都没候选时，**向参数子节点下钻**。
            // 否则 `particle … <speed> ` 只会返回占位符 "<speed>"，
            // 而该位置真正要填的是下一级的 [count] / mode / [player]。
            const argChild = node.children.find(c => c.kind === 'argument') as ArgumentNode | undefined;
            if (argChild) {
                const inner = await this.suggest(
                    argChild, ancestors.concat(node), commands, lineText,
                    false, cursor,
                );
                // 下钻时带上子参数自身的占位符，用户才知道这一级是什么
                return [
                    {
                        label: argChild.argName, detail: ' ', insertText: '',
                        kind: vscode.CompletionItemKind.TypeParameter, sortText: '￿',
                    },
                    ...inner,
                ];
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

    /**
     * 给补全项设置显式替换区间。
     *
     * `kind` 决定语义：
     *   `'value'`  —— 参数值候选，替换光标处正在输入的整个值
     *   `'insert'` —— 下一级字面量，仅插入在光标处（零宽区间），不替换任何文本
     *
     * 为什么不交给 VS Code 推算：它按语言词法找「词」，而默认词法把
     * `:` `/` `.` `@` `#` 当分隔符 —— `function ns:` 的词范围为空、
     * `function ns:a` 的词范围只有 `a`，接受 `ns:test` 都会得到 `ns:ns:test`。
     *
     * 未传 cursor（单测场景）时原样返回，保持既有行为。
     */
    private withRanges(
        items: vscode.CompletionItem[],
        cursor: { line: number; character: number } | undefined,
        lineText: string,
        kind: 'value' | 'insert',
    ): vscode.CompletionItem[] {
        if (!cursor) { return items; }
        let range: vscode.Range;
        if (kind === 'insert') {
            range = new vscode.Range(cursor.line, cursor.character, cursor.line, cursor.character);
        } else {
            const span = valueSpanAt(lineText, cursor.character);
            range = new vscode.Range(cursor.line, span.start, cursor.line, span.end);
        }
        for (const it of items) {
            // 已显式指定区间的（如数据层传入的）不覆盖
            if (!it.range) { it.range = range; }
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

    /**
     * 选下一个节点。优先级：literal → argument → greedy → forward_root。
     *
     * ⚠️ literal 必须**先于** greedy。setblock 这类命令的尾巴是
     *   [dataValue] [oldBlockHandling] [dataTag]
     * 三者互相独立，于是 `[dataValue]` 下同时挂了
     *   literal destroy / keep / replace 与一个并列的 greedy('[dataTag]')。
     * 若 greedy 优先，`setblock 1 2 3 stone 0 destroy` 里的 destroy
     * 会被 greedy 当成 NBT 吃掉，oldBlockHandling 分支永远进不去。
     *
     * ⚠️ argument 也要**先于** greedy。fill 的 replace 分支下同时有
     *   <replaceTileName>（方块名）与并列的 greedy('[dataTag]')，
     *   `fill … replace dirt 0` 里的 dirt 必须走 argument 才认得出是方块名。
     * 真正需要 greedy 吃掉一切的位置（say <message …>、teams leave [entities...]）
     * 下面没有并列的 literal/argument，不受影响。
     */
    private matchChild(node: CommandNode, token: string): CommandNode | null {
        for (const child of node.children) {
            if (child.kind === 'literal' && (child as LiteralNode).literal === token) { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'argument') { return child; }
        }
        // 贪婪参数兜底：匹配它即视为消费任意 token
        for (const child of node.children) {
            if (child.kind === 'greedy') { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return child; }
        }
        return null;
    }
}
