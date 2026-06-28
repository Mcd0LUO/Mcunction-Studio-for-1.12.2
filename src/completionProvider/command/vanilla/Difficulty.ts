import * as vscode from "vscode";
import { BaseCompletionProvider } from "../../Base";

export class DifficultyCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        return [
            this.ctx.item('peaceful', '和平','peaceful'),
            this.ctx.item('easy', '简单', 'easy'),
            this.ctx.item('normal', '普通', 'normal'),
            this.ctx.item('hard', '困难', 'hard')
        ];
}
}
