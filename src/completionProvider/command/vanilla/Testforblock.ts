import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class TestforblockCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        if (commands.length <= 4) {
            return this.ctx.coordinates();
        }
        if (commands.length === 5) {
            return this.ctx.blocks();
        }
        if (commands.length === 6) {
            return [
                this.ctx.item("<data>","数据值|-1|状态|*", ""),
            ];
        }

        return [];
    }
}