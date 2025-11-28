import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../Base";
/**
 * Tellraw命令补全提供者
 * 负责为Minecraft 1.12.2版本的/tellraw命令提供智能补全功能
 */
export class TellrawCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "tellraw";
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        throw new Error("Method not implemented.");
    }
    /**
     * 提供tellraw命令的补全项入口方法
     * @param commands 已解析的命令参数数组
     * @param lineText 当前行文本
     * @param document 当前活动文档
     * @param position 光标位置
     * @returns 补全项数组
     */

}