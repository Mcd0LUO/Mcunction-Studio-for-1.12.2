import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class AreaCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem("create", "创建区域", "create", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("remove", "删除区域", "remove", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("tp", "传送到区域", "tp", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("bind", "绑定区域事件", "bind", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("unbind", "解绑区域事件", "unbind", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("list", "列出所有区域", "list", false, vscode.CompletionItemKind.Keyword),
            ];
        }

        // /area create <x1> <y1> <z1> <x2> <y2> <z2> <名称>
        if (commands[1] === "create") {
            if (commands.length >= 3 && commands.length <= 8) {
                return this.provideCoordinateCompletions();
            }
            if (commands.length === 9) {
                return [this.createCompletionItem("<区域名称>", "区域标识名称", "", false, vscode.CompletionItemKind.Value)];
            }
        }

        // /area remove <名称> / /area tp <名称>
        if (["remove", "tp"].includes(commands[1]) && commands.length === 3) {
            return this.provideAreaNameCompletions();
        }

        // /area bind <名称> <事件> <动作> [值]
        if (commands[1] === "bind") {
            return this.handleBind(document, position, commands);
        }

        // /area unbind <名称> [event] [type]
        if (commands[1] === "unbind") {
            return this.handleUnbind(commands);
        }

        return [];
    }

    private handleBind(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        if (commands.length === 3) {
            return this.provideAreaNameCompletions();
        }
        if (commands.length === 4) {
            return [
                this.createCompletionItem("enter", "进入区域时触发", "enter", true, vscode.CompletionItemKind.Event),
                this.createCompletionItem("leave", "离开区域时触发", "leave", true, vscode.CompletionItemKind.Event),
            ];
        }
        if (commands.length === 5) {
            return [
                this.createCompletionItem("title", "显示 Title 字幕", "title", true, vscode.CompletionItemKind.Method),
                this.createCompletionItem("subtitle", "显示 Subtitle 字幕", "subtitle", true, vscode.CompletionItemKind.Method),
                this.createCompletionItem("chat", "发送聊天消息", "chat", true, vscode.CompletionItemKind.Method),
                this.createCompletionItem("function", "执行函数", "function", true, vscode.CompletionItemKind.Method),
            ];
        }
        if (commands.length === 6) {
            if (commands[4] === "function") {
                const range = this.getWordRange(document, position, commands[5].length);
                return this.provideFunctionCompletions(range);
            }
            if (["title", "subtitle", "chat"].includes(commands[4])) {
                return [
                    this.createCompletionItem('"<值>"', "消息内容（支持颜色代码 &）", '"', false, vscode.CompletionItemKind.Value),
                ];
            }
        }
        return [];
    }

    private handleUnbind(commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 3) {
            return this.provideAreaNameCompletions();
        }
        if (commands.length === 4) {
            return [
                this.createCompletionItem("enter", "进入区域事件（留空解绑全部）", "enter", false, vscode.CompletionItemKind.Event),
                this.createCompletionItem("leave", "离开区域事件（留空解绑全部）", "leave", false, vscode.CompletionItemKind.Event),
            ];
        }
        if (commands.length === 5) {
            return [
                this.createCompletionItem("title", "Title 字幕绑定", "title", false, vscode.CompletionItemKind.Method),
                this.createCompletionItem("subtitle", "Subtitle 字幕绑定", "subtitle", false, vscode.CompletionItemKind.Method),
                this.createCompletionItem("chat", "聊天消息绑定", "chat", false, vscode.CompletionItemKind.Method),
                this.createCompletionItem("function", "函数绑定", "function", false, vscode.CompletionItemKind.Method),
            ];
        }
        return [];
    }

    private provideAreaNameCompletions(): vscode.CompletionItem[] {
        return [
            this.createCompletionItem("<区域名称>", "区域标识名称", "", false, vscode.CompletionItemKind.Value),
        ];
    }
}
