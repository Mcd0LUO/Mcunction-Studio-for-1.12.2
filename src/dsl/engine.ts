import * as vscode from 'vscode';
import { CommandNode, LiteralNode, ArgumentNode, ForwardRootNode, JumpNode, RootNode, SuggestContext } from './nodes';
import { DataLoader } from '../core/DataLoader';
import { CompletionContext } from '../completionProvider/CompletionContext';

export class CompletionEngine {
    static instance: CompletionEngine;

    private roots: Map<string, RootNode> = new Map();
    private ctx: CompletionContext;

    constructor(loader: DataLoader) {
        this.ctx = new CompletionContext(loader);
        CompletionEngine.instance = this;
    }

    register(root: RootNode): void { this.roots.set(root.commandName, root); }
    unregister(commandName: string): void { this.roots.delete(commandName); }
    has(command: string): boolean { return this.roots.has(command); }

    getRootItems(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const [name, root] of this.roots) {
            items.push(this.ctx.item(name, root.description || '', name, true));
        }
        return items;
    }

    static debug = false;

    // ================================================================
    // 遍历入口
    // ================================================================

    async complete(commands: string[], lineText: string): Promise<vscode.CompletionItem[]> {
        const root = this.roots.get(commands[0]);
        if (!root) { return []; }
        if (commands.length === 1) { return []; }

        let node: CommandNode = root;
        let cursor = 1;
        const ancestors: CommandNode[] = [root];

        while (cursor < commands.length - 1) {
            const next = this.matchChild(node, commands[cursor]);
            if (!next) { break; }

            // jump 节点：回弹到最近的多分支祖先
            if (next.kind === 'jump') {
                node = this.jumpTarget(ancestors) ?? node;
                cursor++;
                continue;
            }

            ancestors.push(node);
            node = next;
            cursor++;
        }

        // jump 节点也可能作为子节点被消费后到达
        if (node.kind === 'jump') {
            node = this.jumpTarget(ancestors) ?? node;
        }

        const items = await this.suggestionsFor(node, commands, lineText);
        if (CompletionEngine.debug) {
            console.log(`[DSL] ${commands.join(' ')} → ${items.length} 项`,
                items.map(i => typeof i.label === 'string' ? i.label : i.label.label));
        }
        return items;
    }

    // ================================================================
    // 内部
    // ================================================================

    /** 从祖先栈中向上查找最近的多分支节点（2+ literal/forward_root/jump 子节点） */
    private jumpTarget(ancestors: CommandNode[]): CommandNode | null {
        for (let i = ancestors.length - 1; i >= 0; i--) {
            const branchCount = ancestors[i].children.filter(c =>
                c.kind === 'literal' || c.kind === 'forward_root' || c.kind === 'jump'
            ).length;
            if (branchCount >= 2) { return ancestors[i]; }
        }
        return null;
    }

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

    private async suggestionsFor(node: CommandNode, commands: string[], lineText: string): Promise<vscode.CompletionItem[]> {
        if (node.kind === 'forward_root') { return this.getRootItems(); }

        // forward_root / jump 子节点 → 转发 / 跳转
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return this.getRootItems(); }
            if (child.kind === 'jump') {
                // 收集所有字面量和forward_root兄弟节点
                const items: vscode.CompletionItem[] = [];
                for (const sib of node.children) {
                    if (sib.kind === 'literal') {
                        const lit = sib as LiteralNode;
                        items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
                    }
                    if (sib.kind === 'forward_root') {
                        items.push(this.ctx.item('run', '执行命令', 'run', true));
                    }
                }
                if (items.length > 0) { return items; }
            }
        }

        const items: vscode.CompletionItem[] = [];

        for (const child of node.children) {
            if (child.kind === 'literal') {
                const lit = child as LiteralNode;
                items.push(this.ctx.item(lit.literal, lit.description || '', lit.literal, true));
            }
        }

        for (const child of node.children) {
            if (child.kind === 'argument') {
                const arg = child as ArgumentNode;
                if (arg.suggest) {
                    const suggestCtx: SuggestContext = {
                        loader: this.ctx['loader'],
                        cc: this.ctx,
                        item: (l, d, i, tn, k) => this.ctx.item(l, d, i, tn ?? true, k),
                        commands,
                        lineText,
                    };
                    const result = arg.suggest(suggestCtx);
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
}
