import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class AreaCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.ctx.item("create", "创建区域", "create", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("remove", "删除区域", "remove", false, vscode.CompletionItemKind.Keyword),
                this.ctx.item("tp", "传送到区域", "tp", false, vscode.CompletionItemKind.Keyword),
                this.ctx.item("bind", "绑定区域事件", "bind", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("unbind", "解绑区域事件", "unbind", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("list", "列出所有区域", "list", false, vscode.CompletionItemKind.Keyword),
            ];
        }

        // /area create <x1> <y1> <z1> <x2> <y2> <z2> <名称>
        if (commands[1] === "create") {
            if (commands.length >= 3 && commands.length <= 8) {
                return this.ctx.coordinates();
            }
            if (commands.length === 9) {
                return [this.ctx.item("<区域名称>", "区域标识名称", "", false, vscode.CompletionItemKind.Value)];
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
                this.ctx.item("enter", "进入区域时触发", "enter", true, vscode.CompletionItemKind.Event),
                this.ctx.item("leave", "离开区域时触发", "leave", true, vscode.CompletionItemKind.Event),
            ];
        }
        if (commands.length === 5) {
            return [
                this.ctx.item("title", "显示 Title 字幕", "title", true, vscode.CompletionItemKind.Method),
                this.ctx.item("subtitle", "显示 Subtitle 字幕", "subtitle", true, vscode.CompletionItemKind.Method),
                this.ctx.item("chat", "发送聊天消息", "chat", true, vscode.CompletionItemKind.Method),
                this.ctx.item("function", "执行函数", "function", true, vscode.CompletionItemKind.Method),
            ];
        }
        if (commands.length === 6) {
            if (commands[4] === "function") {
                const range = this.ctx.wordRange(document, position, commands[5].length);
                return this.ctx.functions(range);
            }
            if (["title", "subtitle", "chat"].includes(commands[4])) {
                return [
                    this.ctx.item('"<值>"', "消息内容（支持颜色代码 &）", '"', false, vscode.CompletionItemKind.Value),
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
                this.ctx.item("enter", "进入区域事件（留空解绑全部）", "enter", false, vscode.CompletionItemKind.Event),
                this.ctx.item("leave", "离开区域事件（留空解绑全部）", "leave", false, vscode.CompletionItemKind.Event),
            ];
        }
        if (commands.length === 5) {
            return [
                this.ctx.item("title", "Title 字幕绑定", "title", false, vscode.CompletionItemKind.Method),
                this.ctx.item("subtitle", "Subtitle 字幕绑定", "subtitle", false, vscode.CompletionItemKind.Method),
                this.ctx.item("chat", "聊天消息绑定", "chat", false, vscode.CompletionItemKind.Method),
                this.ctx.item("function", "函数绑定", "function", false, vscode.CompletionItemKind.Method),
            ];
        }
        return [];
    }

    private provideAreaNameCompletions(): vscode.CompletionItem[] {
        return [
            this.ctx.item("<区域名称>", "区域标识名称", "", false, vscode.CompletionItemKind.Value),
        ];
    }
}
