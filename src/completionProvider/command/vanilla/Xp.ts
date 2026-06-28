import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class XpCompletionProvider extends BaseCompletionProvider {

    /**
     * 提供xp命令的补全项
     * @param commands 已解析的命令片段数组
     * @returns 补全项数组
     */
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        switch (commands.length) {
            case 2:
                // 第二个参数是经验值数量，可以是数字或者带L后缀的等级
                return [
                    this.ctx.item(
                        '<amount>', 
                        '经验值数量（点数）', 
                        '', 
                        true, 
                        vscode.CompletionItemKind.Value
                    ),
                    this.ctx.item(
                        '<amount>L', 
                        '经验值数量（等级）', 
                        '${1:}L', 
                        true, 
                        vscode.CompletionItemKind.Value
                    )
                ];
            
            case 3:
                // 第三个参数是目标玩家
                return this.ctx.selectors(commands[2]);
                
            default:
                return [];
        }
    }
}