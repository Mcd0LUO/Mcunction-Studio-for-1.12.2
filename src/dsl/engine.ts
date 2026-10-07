import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, ForwardRootNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';

type Ancestors = CommandNode[];

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
        const root = this.roots.get(commands[0]);
        if (!root) { return []; }

        const { node, ancestors, consumedRealToken } = this.walk(root, commands);
        const items = await this.suggest(node, ancestors, commands, lineText, consumedRealToken);

        if (CompletionEngine.debug) {
            console.log(`[DSL] ${commands.join(' ')} → ${items.length} 项`,
                items.map(i => typeof i.label === 'string' ? i.label : i.label.label));
        }
        return items;
    }

    // ================================================================
    // Walk — 消费 token，沿树向下
    // ================================================================

    private walk(root: RootNode, commands: string[]): { node: CommandNode; ancestors: Ancestors; consumedRealToken: boolean } {
        let node: CommandNode = root;
        const ancestors: Ancestors = [];
        let cursor = 1;
        let consumedRealToken = false;

        while (cursor < commands.length) {
            const token = commands[cursor];
            const next = this.matchChild(node, token);
            if (!next) { break; }

            ancestors.push(node);
            node = next;
            cursor++;
            consumedRealToken = token !== '';
        }

        return { node, ancestors, consumedRealToken };
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
