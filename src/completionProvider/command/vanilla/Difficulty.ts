import * as vscode from "vscode";
import { BaseCompletionProvider } from "../../Base";

export class DifficultyCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'difficulty';
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        return [
            this.createCompletionItem('peaceful', '和平','peaceful'),
            this.createCompletionItem('easy', '简单', 'easy'),
            this.createCompletionItem('normal', '普通', 'normal'),
            this.createCompletionItem('hard', '困难', 'hard')
        ];
}
}
