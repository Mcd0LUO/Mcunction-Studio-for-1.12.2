import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class TitleCompletionProvider extends BaseCompletionProvider {
    public provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): vscode.CompletionItem[] {
        switch (commands.length) {
            case 2:
                return this.ctx.selectors(commands[1]);
            case 3:
                return [
                    this.ctx.item('title', "主标题", "title" , true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('subtitle', "副标题", "subtitle" , true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('actionbar', "物品栏上方", "actionbar" , true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('times', "设置时间", "times" ,true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('clear', "清除设置", "clear" ,true, vscode.CompletionItemKind.Keyword),

                ];
            case 4:
                break;


        }
    return [];
    
}
}