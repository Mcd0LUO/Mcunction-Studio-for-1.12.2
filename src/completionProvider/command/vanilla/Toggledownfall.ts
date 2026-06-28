import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class ToggledownfallCompletionProvider extends BaseCompletionProvider {
    public provideCommandCompletions(): vscode.CompletionItem[] {

    return [];
    
}
}