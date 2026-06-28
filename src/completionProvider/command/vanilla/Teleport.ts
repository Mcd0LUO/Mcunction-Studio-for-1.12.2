import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class TeleportCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        let items: vscode.CompletionItem[] = [];

        if (commands.length === 2) {
            items = this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            items.push(this.createCompletionItem('<x> <y> <z>',"绝对坐标","${1:x} ${2:y} ${3:z}"));
            items.push(this.createCompletionItem('~<x> ~<y> ~<z>',"相对坐标","~${1:x} ~${2:y} ~${3:z}"));
        }

        return items;
    }
}