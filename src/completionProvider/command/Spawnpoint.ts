import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';

export class SpawnpointCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'spawnpoint';


    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length >= 3 && commands.length <= 5) {
            return this.provideCoordinateCompletions();
        }
        return [];
        
    }

}