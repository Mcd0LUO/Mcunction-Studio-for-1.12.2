import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';
import { NBTUtils } from "../../utils/NBTUtils";

export class SummonCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'summon';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        let result: vscode.CompletionItem[] = [];
        if (commands.length === 2) {
            return this.provideEntityTypeCompletions();
        }

        if (commands.length >= 3 && commands.length <= 5) {
            return this.provideCoordinateCompletions();
        }

        if (commands.length === 6) {
            if (commands[5] === '') {
                return [this.createCompletionItem('{}', 'NBT标签wrapper', '{${0:}}', false, vscode.CompletionItemKind.Snippet)];
            }
            return NBTUtils.provideEntityNBTCompletions(this.createCompletionItem);
            }

        return [];
    }
}
