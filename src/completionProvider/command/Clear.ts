import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';
import { ItemNameMap } from "../../utils/EnumLib";


export class ClearCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'clear';

    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        
        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            const completionItems: vscode.CompletionItem[] = [];
            for (const [item, name] of Object.entries(ItemNameMap.all)) {

                completionItems.push(this.createCompletionItem(item, name, item + ' ', true, vscode.CompletionItemKind.Class));
            }
            return completionItems;

        }


        return [];
    }
}