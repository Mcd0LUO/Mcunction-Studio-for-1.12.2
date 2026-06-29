import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, ForwardNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';

// ================================================================
// CompletionEngine — 命令树遍历 → CompletionItem[]
// ================================================================

export class CompletionEngine {
    static instance: CompletionEngine;

    private roots: Map<string, RootNode> = new Map();
    private ctx: CompletionContext;

    constructor(loader: DataLoader) {
        this.ctx = new CompletionContext(loader);
        CompletionEngine.instance = this;
    }

    /** 注册一条命令的 DSL 树 */
    register(root: RootNode): void {
        this.roots.set(root.commandName, root);
    }

    /** 移除一条命令 */
    unregister(commandName: string): void {
        this.roots.delete(commandName);
    }

    /** 检查是否有 DSL 定义的命令处理器 */
    has(command: string): boolean {
        return this.roots.has(command);
    }

    /** 获取所有根命令的补全项（用于空输入或根级别补全） */
    getRootItems(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const [name, root] of this.roots) {
            items.push(this.ctx.item(name, root.description || '', name, true));
        }
        return items;
    }

    // ================================================================
    // 遍历入口
    // ================================================================

    /**
     * 根据已解析的命令片段，遍历命令树并返回补全项。
     */
    /** 调试模式：在控制台打印每条补全请求走的分发路径 */
    static debug = false;

    async complete(commands: string[], lineText: string): Promise<vscode.CompletionItem[]> {
        const root = this.roots.get(commands[0]);
        if (!root) { return []; }

        // 只有根命令名（无空格/参数）：auto-trigger 场景，VSCode 不会弹出面板，
        // 无需提前计算子级补全。与旧管线行为一致。
        if (commands.length === 1) { return []; }

        let node: CommandNode = root;
        let cursor = 1;

        // 最后一个 token 是光标所在位置的输入（可能是 '' 或部分输入），
        // 不应消费——留给 suggestionsFor 触发当前位置的 suggest 函数，
        // VSCode 负责用该 token 过滤补全结果。
        while (cursor < commands.length - 1) {
            const next = this.matchChild(node, commands[cursor]);
            if (next) {
                node = next;
                cursor++;
            } else {
                break;
            }
        }

        const items = await this.suggestionsFor(node, commands, lineText);
        if (CompletionEngine.debug) {
            console.log(`[DSL] ${commands.join(' ')} → ${items.length} 项`, items.map(i => typeof i.label === 'string' ? i.label : i.label.label));
        }
        return items;
    }

    // ================================================================
    // 内部
    // ================================================================

    /** 在 node 的子节点中寻找匹配。literal 优先，arg 兜底，forward 消费。 */
    private matchChild(node: CommandNode, token: string): CommandNode | null {
        // 1. 优先匹配字面量
        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                if (lit.literal === token) { return lit; }
            }
        }
        // 2. 匹配参数（消费一个 token）
        for (const child of node.children) {
            if (child.kind === 'argument') {
                return child;
            }
        }
        // 3. 转发节点（如 execute 的 run）
        for (const child of node.children) {
            if (child.kind === 'forward') {
                return child;
            }
        }
        return null;
    }

    /** 收集节点的补全建议 */
    private async suggestionsFor(node: CommandNode, commands: string[], lineText: string): Promise<vscode.CompletionItem[]> {
        // 转发节点 → 返回所有根命令（排除自身，避免递归）
        if (node.kind === 'forward') {
            return this.getRootItems().filter(i => {
                const label = typeof i.label === 'string' ? i.label : i.label.label;
                return label !== commands[0];
            });
        }

        const items: vscode.CompletionItem[] = [];

        // 1. 字面量子节点（下一级关键字）
        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
        }

        // 2. 转发子节点
        for (const child of node.children) {
            if (child.kind === 'forward') {
                items.push(this.ctx.item('<命令>', '要执行的命令', '', true, vscode.CompletionItemKind.Snippet));
            }
        }

        // 3. 参数子节点（获取动态建议，只处理第一个）
        for (const child of node.children) {
            if (child.kind === 'argument') {
                const arg = child as ArgumentNode;
                if (arg.suggest) {
                    const suggestCtx: SuggestContext = {
                        loader: this.ctx['loader'],
                        cc: this.ctx,
                        item: (label, desc, insert, triggerNext, kind) =>
                            this.ctx.item(label, desc, insert, triggerNext ?? true, kind),
                        commands,
                        lineText,
                    };
                    const result = arg.suggest(suggestCtx);
                    items.push(...(result instanceof Promise ? await result : result));
                } else {
                    // 仅提示，不插入内容
                    items.push({
                        label: arg.argName,
                        detail: ' ',
                        insertText: '',
                        kind: vscode.CompletionItemKind.TypeParameter,
                        sortText: '￿',  // 排在最后
                    });
                }
                break;
            }
        }

        return items;
    }
}
