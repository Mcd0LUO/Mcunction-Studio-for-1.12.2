import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';
import { CompletionContext } from './CompletionContext';
import { DataLoader } from '../core/DataLoader';
import { CompletionEngine } from '../dsl/engine';

/**
 * 补全提供者基类 —— 调度层。
 * 全部命令由 DSL 引擎处理，此层仅负责命令解析 + 分发。
 */
export abstract class BaseCompletionProvider implements vscode.CompletionItemProvider {
    protected ctx = new CompletionContext(DataLoader.getInstance());

    /** 子类实现（保留用于兼容，实际不再通过旧管线调用） */
    protected abstract provideCommandCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
        commands: string[],
        lineText: string
    ): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    // ================================================================
    // VSCode 入口
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

        const engine = CompletionEngine.instance;
        if (engine && engine.has(currentCommands[0])) {
            if (CompletionEngine.debug) {
                console.log(`[DSL] ${currentCommands.join(' ')}`);
            }
            return engine.complete(currentCommands, lineText);
        }

        return this.provideRootCompletions(currentCommands[0]);
    }

    // ================================================================
    // 根命令补全
    // ================================================================

    private provideRootCompletions(text: string): vscode.CompletionItem[] {
        const prefix = text.trim().toLowerCase();
        const result: vscode.CompletionItem[] = [];

        const engine = CompletionEngine.instance;
        if (engine) {
            for (const item of engine.getRootItems()) {
                const label = typeof item.label === 'string' ? item.label : item.label.label;
                if (prefix === '' || label.toLowerCase().startsWith(prefix)) {
                    result.push(item);
                }
            }
        }

        result.push(...this.fastCommands);
        return result;
    }

    private fastCommands: vscode.CompletionItem[] = [
        { label: 'tag', detail: 'scoreboard players tag', insertText: new vscode.SnippetString('scoreboard players tag'), kind: vscode.CompletionItemKind.Snippet }
    ];
}
