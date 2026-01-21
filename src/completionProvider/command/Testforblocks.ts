import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../Base";

export class TestforblocksCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "testforblocks";
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        if (commands.length <= 10) {
            return this.provideCoordinateCompletions();
        }
        if (commands.length === 11) {
            return [
                this.createCompletionItem(
                    'all',
                    '严格相同',
                    'all'
                ),
                this.createCompletionItem(
                    'masked',
                    '忽略空气',
                    'masked'
                ),
            ];

        }

        return [];
    }
}