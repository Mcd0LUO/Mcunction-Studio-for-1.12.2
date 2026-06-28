import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';

export class FillCompletionProvider extends BaseCompletionProvider {


    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        if (commands.length <= 7) {
            return this.ctx.coordinates();
        }
        if (commands.length === 8) {
            return this.ctx.blocks();
        }
        if (commands.length === 9) {
            return [this.ctx.item(
                "<数据值>",
                "data",
                "",
                true,
                vscode.CompletionItemKind.Value,

            )];
        }
        if (commands.length === 10) {
            //  destroy, hollow, keep, outline, replace
            return [this.ctx.item(
                "destroy",
                "摧毁原方块并填充",
                "destroy ",

                true,
                vscode.CompletionItemKind.Value,

            ), this.ctx.item(
                "hollow",
                "替换外层方块。内部替换为空气",
                "hollow ",

                true,
                vscode.CompletionItemKind.Value,

            ), this.ctx.item(
                "keep",
                "替换填充区域内的空气方块",
                "keep ",
                true,
                vscode.CompletionItemKind.Value,

            ), this.ctx.item(
                "outline",
                "填充区域外层的方块。内部方块不受影响",
                "outline ",
                true,
                vscode.CompletionItemKind.Value,

            ), this.ctx.item(
                "replace",
                "默认",
                "replace ",
                true,
                vscode.CompletionItemKind.Value,
            )

            ];
        }
        return [];
        
    }

}