import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';

export class GamemodeCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        if (commands.length === 2) {
            return this.ctx.selectors(commands[1]);
        }
        if (commands.length === 3) {
            return [
                this.ctx.item("survival", "生存模式","survival", false),
                this.ctx.item("creative", "创造模式","creative" ,false),
                this.ctx.item("adventure", "冒险模式","adventure",false),
                this.ctx.item("spectator", "旁观模式","spectator",false),
                this.ctx.item("0", "生存模式","0",false),
                this.ctx.item("1", "创造模式","1",false),
                this.ctx.item("2", "冒险模式","2",false),
                this.ctx.item("3", "旁观模式","3",false),

            ];
        }


        return [];
    }

}
