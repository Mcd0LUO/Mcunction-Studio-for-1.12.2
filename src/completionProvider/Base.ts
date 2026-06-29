import * as vscode from 'vscode';
import { CommandRegistry } from '../core/CommandRegistry';
import { CommandUtils } from '../utils/CommandUtils';
import { CompletionContext } from './CompletionContext';
import { DataLoader } from '../core/DataLoader';
import { CompletionEngine } from '../dsl/engine';

/**
 * 补全提供者基类 —— 调度层。
 * 分发策略：DSL 优先 → CommandRegistry（旧 Provider）→ 根命令列表。
 */
export abstract class BaseCompletionProvider implements vscode.CompletionItemProvider {
    protected ctx = new CompletionContext(DataLoader.getInstance());

    /** 子类实现具体命令的补全逻辑 */
    protected abstract provideCommandCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
        commands: string[],
        lineText: string
    ): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    // ================================================================
    // VSCode 入口：命令解析 + 分发（DSL 优先，旧 Provider 回退）
    // ================================================================

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const trimmedText = textBeforeCursor.trimStart();

        if (trimmedText.length === 0) { return this.provideRootCompletions(''); }
        if (trimmedText.startsWith('#')) { return []; }

        const fullCommands = CommandUtils.extractCommand(trimmedText);
        const { currentCommands } = CommandUtils.findActiveCommand(fullCommands);

        // 1. 优先走 DSL 引擎
        const engine = CompletionEngine.instance;
        if (engine && engine.has(currentCommands[0])) {
            if (CompletionEngine.debug) {
                console.log(`[DSL] ${currentCommands.join(' ')} (入口: Base.ts)`);
            }
            return engine.complete(currentCommands, lineText);
        }

        // 2. 回退：旧的动态 import Provider 体系
        const provider = CommandRegistry.getProvider(currentCommands[0]);
        if (provider) {
            if (CompletionEngine.debug) {
                console.log(`[Legacy] ${currentCommands.join(' ')} → ${provider.constructor.name}`);
            }
            const result = provider.provideCommandCompletions(document, position, _token, _context, currentCommands, lineText);
            return Array.isArray(result) ? result : await result;
        }

        // 3. 都不匹配 → 根命令前缀过滤
        if (CompletionEngine.debug) {
            console.log(`[Root] "${currentCommands[0]}" 无匹配，回退根列表`);
        }
        return this.provideRootCompletions(currentCommands[0]);
    }

    // ================================================================
    // 根命令补全
    // ================================================================

    private provideRootCompletions(text: string): vscode.CompletionItem[] {
        const prefix = text.trim().toLowerCase();
        const seen = new Set<string>();
        const result: vscode.CompletionItem[] = [];

        // DSL 根命令
        const engine = CompletionEngine.instance;
        if (engine) {
            for (const item of engine.getRootItems()) {
                const label = typeof item.label === 'string' ? item.label : item.label.label;
                if (prefix === '' || label.toLowerCase().startsWith(prefix)) {
                    result.push(item);
                    seen.add(label);
                }
            }
        }

        // 旧 Provider 根命令（去重）
        for (const command of CommandRegistry.getRootCommands()) {
            if (seen.has(command)) { continue; }
            if (prefix === '' || command.toLowerCase().startsWith(prefix)) {
                result.push(this.ctx.item(command, '', command, true));
                seen.add(command);
            }
        }

        result.push(...this.fastCommands);
        return result;
    }

    private fastCommands: vscode.CompletionItem[] = [
        { label: 'tag', detail: 'scoreboard players tag', insertText: new vscode.SnippetString('scoreboard players tag'), kind: vscode.CompletionItemKind.Snippet }
    ];
}
