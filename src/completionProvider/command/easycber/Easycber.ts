import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class EasycberCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem("setting", "插件设置", "setting", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 3) {
            return [
                this.createCompletionItem("command_feedback", "命令反馈开关", "command_feedback", true, vscode.CompletionItemKind.Property),
                this.createCompletionItem("on_load", "世界加载时执行的函数列表", "on_load", true, vscode.CompletionItemKind.Property),
            ];
        }

        // /easycber setting command_feedback <true|false>
        if (commands[2] === "command_feedback" && commands.length === 4) {
            return [
                this.createCompletionItem("true", "开启命令反馈", "true", false, vscode.CompletionItemKind.Constant),
                this.createCompletionItem("false", "关闭命令反馈", "false", false, vscode.CompletionItemKind.Constant),
            ];
        }

        // /easycber setting on_load add|remove|list [函数]
        if (commands[2] === "on_load") {
            if (commands.length === 4) {
                return [
                    this.createCompletionItem("add", "添加初始化函数", "add", true, vscode.CompletionItemKind.Keyword),
                    this.createCompletionItem("remove", "移除初始化函数", "remove", true, vscode.CompletionItemKind.Keyword),
                    this.createCompletionItem("list", "列出所有初始化函数", "list", false, vscode.CompletionItemKind.Keyword),
                ];
            }
            if (commands.length === 5 && ["add", "remove"].includes(commands[3])) {
                const range = this.getWordRange(document, position, commands[4].length);
                return this.provideFunctionCompletions(range);
            }
        }

        return [];
    }
}
