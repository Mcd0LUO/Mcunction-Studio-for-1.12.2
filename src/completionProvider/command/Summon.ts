import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';

export class SummonCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'summon';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[], full_text: string): CompletionItem[] | Promise<CompletionItem[]> {
        
        let result: vscode.CompletionItem[] = [];
        if (commands.length === 2) {
            return this.provideEntityTypeCompletions();
        }

        if (commands.length >= 3 && commands.length <= 5) {
            return this.provideCoordinateCompletions();
        }

        if (commands.length === 6) {
            return this.provideEntityNbtCompletions(commands[5]);

        }
        return [];
    }
}