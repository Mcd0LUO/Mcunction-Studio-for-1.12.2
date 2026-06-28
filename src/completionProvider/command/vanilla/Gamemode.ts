import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';

export class GamemodeCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            return [
                this.createCompletionItem("survival", "生存模式","survival", false),
                this.createCompletionItem("creative", "创造模式","creative" ,false),
                this.createCompletionItem("adventure", "冒险模式","adventure",false),
                this.createCompletionItem("spectator", "旁观模式","spectator",false),
                this.createCompletionItem("0", "生存模式","0",false),
                this.createCompletionItem("1", "创造模式","1",false),
                this.createCompletionItem("2", "冒险模式","2",false),
                this.createCompletionItem("3", "旁观模式","3",false),

            ];
        }


        return [];
    }

}
