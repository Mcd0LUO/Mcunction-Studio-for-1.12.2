import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';
import { CompletionContext } from './CompletionContext';
import { DataLoader } from '../core/DataLoader';

/**
 * 补全提供者基类 —— 调度层。
 * 所有数据访问委托给 CompletionContext。
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
    // VSCode 入口：命令解析 + 分发
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

        if (trimmedText.length === 0) { return this.ctx.rootCompletions(); }
        if (trimmedText.startsWith('#')) { return []; }

        const fullCommands = CommandUtils.extractCommand(trimmedText);
        const { currentCommands } = CommandUtils.findActiveCommand(fullCommands);

        if (this.ctx.hasHandler(currentCommands[0])) {
            const result = this.ctx.dispatch(currentCommands[0], currentCommands, document, position, lineText);
            return Array.isArray(result) ? result : await result;
        }
        return this.ctx.rootCompletions();
    }
}
