import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class TestforblockCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "testforblock";
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        if (commands.length <= 4) {
            return this.provideCoordinateCompletions();
        }
        if (commands.length === 5) {
            return this.provideBlockCompletions();
        }
        if (commands.length === 6) {
            return [
                this.createCompletionItem("<data>","数据值|-1|状态|*", ""),
            ];
        }

        return [];
    }
}