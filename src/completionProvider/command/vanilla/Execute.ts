import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import { BaseCompletionProvider } from '../../Base';
import * as vscode from "vscode";


export class ExecuteCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        // console.log(commands);
        if (commands.length === 2) {
            return this.ctx.selectors(commands[1]);
        }
        if ( 3<= commands.length && commands.length <= 5) {
            return this.ctx.coordinates();
        }

        return [];
    }


}