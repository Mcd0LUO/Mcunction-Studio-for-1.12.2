import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

// 🔥 新增：定义选择器项的接口（明确允许 insertText 可选）
interface SelectorItem {
    label: string;
    detail: string;
    insertText?: vscode.SnippetString | string; // 可选属性，支持字符串或代码片段
}

export class FunctionCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {
        if (commands.length === 2) {
            // 计算range
            const range = this.ctx.wordRange(document, position, commands[1].length);
            return this.ctx.functions(range);
        } 
        if (commands.length === 3) {
            return [
                this.ctx.item(
                    'if',
                    '条件判断 真',
                    'if',
                    true,
                    vscode.CompletionItemKind.Keyword

                ),
                this.ctx.item(
                    'unless',
                    '条件判断 假',
                    'unless',
                    true,
                    vscode.CompletionItemKind.Keyword

                ),
            ];
        }
        if (commands.length === 4) {
            return this.ctx.selectors(commands[3]);
        }
        return [];
    }


}