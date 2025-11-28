import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';

export class GiveCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'give';


    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        
        if (commands.length === 2) {
            // console.log(commands);
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            return this.provideItemCompletions();
        }
        if (commands.length === 4) {
            return [this.createCompletionItem("<数量>", "count" , "1", true, vscode.CompletionItemKind.Value)];
        }
        if (commands.length === 5) {
            return [this.createCompletionItem("<数据值>", "data" , "0", true, vscode.CompletionItemKind.Value)];
        }

        return [];
    }


}