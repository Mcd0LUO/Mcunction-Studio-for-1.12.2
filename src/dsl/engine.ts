import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, ForwardRootNode, JumpNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';

type Ancestors = CommandNode[];

export class CompletionEngine {
    static instance: CompletionEngine;

    private roots: Map<string, RootNode> = new Map();
    private ctx: CompletionContext;

    constructor(loader: DataLoader) {
        this.ctx = new CompletionContext(loader);
        CompletionEngine.instance = this;
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
    // Walk — 消费 token，遇到 jump 弹栈
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

            // jump 在 walk 中作为 token 消费（用户手动输入了关键字进入跳转）
            if (next.kind === 'jump') {
                node = this.doJump(node, ancestors, (next as JumpNode).levels);
                cursor++;
                consumedRealToken = token !== '';
                continue;
            }

            ancestors.push(node);
            node = next;
            cursor++;
            consumedRealToken = token !== '';

            // 只在消费了真实 token 后自动跳转（空串是占位，不跳）
            if (consumedRealToken && this.isLeafWithJump(node)) {
                node = this.doJump(node, ancestors, (node.children[0] as JumpNode).levels);
            }
        }

        return { node, ancestors, consumedRealToken };
    }

    private isLeafWithJump(node: CommandNode): boolean {
        return node.children.length >= 1
            && node.children.every(c => c.kind === 'jump' || c.kind === 'forward_root');
    }

    private collectLiterals(node: CommandNode): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
            if (child.kind === 'forward_root') {
                items.push(this.ctx.item('run', '执行命令', 'run', true, vscode.CompletionItemKind.Keyword));
            }
        }
        return items;
    }

    private doJump(node: CommandNode, ancestors: Ancestors, levels: number): CommandNode {
        let target = node;
        for (let l = 0; l < levels && ancestors.length > 0; l++) { target = ancestors.pop()!; }
        return target;
    }

    /** suggest 阶段用：返回 jump 目标节点的兄弟（literal + forward_root） */
    private jumpSiblings(node: CommandNode, ancestors: Ancestors, levels: number): vscode.CompletionItem[] {
        let target = node;
        const chain = [...ancestors];
        for (let l = 0; l < levels && chain.length > 0; l++) { target = chain.pop()!; }
        const items: vscode.CompletionItem[] = [];
        for (const sib of target.children) {
            if (sib.kind === 'literal') {
                const lit = sib as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
            if (sib.kind === 'forward_root') {
                items.push(this.ctx.item('run', '执行命令', 'run', true, vscode.CompletionItemKind.Keyword));
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
                const ctx: SuggestContext = {
                    loader: this.ctx['loader'],
                    cc: this.ctx,
                    item: (l, d, i, tn, k) => this.ctx.item(l, d, i, tn ?? true, k),
                    commands,
                    lineText,
                };
                const result = arg.suggest(ctx);
                return result instanceof Promise ? await result : result;
            }
            // 只有 jump → 触发跳转
            for (const child of node.children) {
                if (child.kind === 'jump') { return this.jumpSiblings(node, ancestors, (child as JumpNode).levels); }
            }
            // 展示子节点（literal/forward_root），无则占位符
            const subItems = this.collectLiterals(node);
            if (subItems.length > 0) { return subItems; }
            if (arg.suggest) {
                const ctx: SuggestContext = {
                    loader: this.ctx['loader'],
                    cc: this.ctx,
                    item: (l, d, i, tn, k) => this.ctx.item(l, d, i, tn ?? true, k),
                    commands,
                    lineText,
                };
                const result = arg.suggest(ctx);
                return result instanceof Promise ? await result : result;
            }
            return [{ label: arg.argName, detail: ' ', insertText: '', kind: vscode.CompletionItemKind.TypeParameter, sortText: '￿' }];
        }

        // 子节点中有 forward_root / jump → 跳转语义
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return this.getRootItems(); }
            if (child.kind === 'jump') { return this.jumpSiblings(node, ancestors, (child as JumpNode).levels); }
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
                    const ctx: SuggestContext = {
                        loader: this.ctx['loader'],
                        cc: this.ctx,
                        item: (l, d, i, tn, k) => this.ctx.item(l, d, i, tn ?? true, k),
                        commands,
                        lineText,
                    };
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

    // ================================================================
    // Match — literal 优先，arg 兜底，jump/forward 消费
    // ================================================================

    private matchChild(node: CommandNode, token: string): CommandNode | null {
        for (const child of node.children) {
            if (child.kind === 'literal' && (child as LiteralNode).literal === token) { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'argument') { return child; }
        }
        for (const child of node.children) {
            if (child.kind === 'forward_root' || child.kind === 'jump') { return child; }
        }
        return null;
    }
}
