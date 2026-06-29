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
        const ancestors: CommandNode[] = [];

        while (cursor < commands.length) {
            const next = this.matchChild(node, commands[cursor]);
            if (!next) { break; }

            // literal/forward_root/jump 最后一个 token 可消费；argument 留给 VSCode 过滤
            if (cursor === commands.length - 1 && next.kind === 'argument') { break; }

            // jump 节点：向上弹出 levels 层（从栈顶祖先开始）
            if (next.kind === 'jump') {
                const levels = (next as JumpNode).levels;
                let target = node;
                for (let l = 0; l < levels && ancestors.length > 0; l++) { target = ancestors.pop()!; }
                node = target;
                cursor++;
                continue;
            }

            ancestors.push(node);
            node = next;
            cursor++;
        }

        // jump 节点也可能作为子节点被消费后到达
        if (node.kind === 'jump') {
            const levels = (node as JumpNode).levels;
            let target = node;
            for (let l = 0; l < levels && ancestors.length > 0; l++) { target = ancestors.pop()!; }
            node = target;
        }

        const items = await this.suggestionsFor(node, commands, lineText, ancestors);
        if (CompletionEngine.debug) {
            console.log(`[DSL] ${commands.join(' ')} → ${items.length} 项`,
                items.map(i => typeof i.label === 'string' ? i.label : i.label.label));
        }
        return items;
    }

    // ================================================================
    // 内部
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

    private async suggestionsFor(node: CommandNode, commands: string[], lineText: string, ancestors: CommandNode[]): Promise<vscode.CompletionItem[]> {
        if (node.kind === 'forward_root') { return this.getRootItems(); }

        // forward_root / jump 子节点
        for (const child of node.children) {
            if (child.kind === 'forward_root') { return this.getRootItems(); }
            if (child.kind === 'jump') {
                // 向上弹 levels 层（从当前节点的父级开始），展示目标节点的兄弟
                const j = child as JumpNode;
                let target = node;
                const chain = [...ancestors];
                for (let l = 0; l < j.levels && chain.length > 0; l++) { target = chain.pop()!; }
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
