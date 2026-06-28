import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';
import { DataLoader } from "../../../core/DataLoader";

export class TriggerCompletionProvider extends BaseCompletionProvider {


    public provideCommandCompletions(
        document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]
    ): vscode.CompletionItem[] {
        switch (commands.length) {
            case 2:
                // 第二个参数是trigger的计分板目标名称（必须是trigger类型的计分板）
                return this.ctx.scoreboards(undefined, 'trigger');
            
            case 3:
                // 第三个参数是操作类型：add 或 set
                return [
                    this.ctx.item('add', '增加数值到计分板目标', 'add ', true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('set', '设置计分板目标的数值', 'set ', true, vscode.CompletionItemKind.Keyword)
                ];
            
            case 4:
                // 第四个参数是数值
                return [
                    this.ctx.item('<value>', '要增加或设置的数值', '', true, vscode.CompletionItemKind.Value)
                ];
        }
        
        return [];
    }


}
