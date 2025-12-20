import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../Base";
import { JsonMessageUtils } from "../../utils/JsonMessageUtils";
import { JsonMsgParser } from "../../utils/JsonMsgParser";
/**
 * Tellraw命令补全提供者
 * 负责为Minecraft 1.12.2版本的/tellraw命令提供智能补全功能
 */
export class TellrawCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "tellraw";
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            return JsonMsgParser.instance.completion(commands[2], document.lineAt(position.line).text) ?? [];
        }
        return [];
    }


}