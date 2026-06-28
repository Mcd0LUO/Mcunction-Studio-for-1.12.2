import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from "../../Base";

export class DetectCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        if (commands.length >= 2 && commands.length <= 4) {
            return this.ctx.coordinates();
        }
        if (commands.length === 5) {
            return this.ctx.blocks();
        }
        if (commands.length === 6) {
            return [
                this.ctx.item(
                    "0",
                    '数据值',
                    '0',
                    false,
                    vscode.CompletionItemKind.Value
                ),
                this.ctx.item(
                    "*",
                    '任意数据值',
                    '*',
                    false,
                    vscode.CompletionItemKind.Value
                ),
            ];
        }
        if (commands.length === 7) {
            return [];
        }
        return [];
    } 
}