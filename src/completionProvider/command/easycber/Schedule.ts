import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class ScheduleCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'schedule';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        // schedule
        // ├── function <func> <time> [append|replace]
        // ├── repeat   <func> <interval> [次数]
        // ├── random   <func> <min> <max>
        // └── clear    [func]

        if (commands.length === 2) {
            return [
                this.createCompletionItem("function", "调度单次函数", "function", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("repeat", "重复调度函数", "repeat", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("random", "随机延迟调度函数", "random", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("clear", "清除调度任务", "clear", false, vscode.CompletionItemKind.Keyword),
            ];
        }

        const subCmd = commands[1];

        // 所有子命令在位置3都需要函数名
        if (commands.length === 3 && ["function", "repeat", "random", "clear"].includes(subCmd)) {
            const range = this.getWordRange(document, position, commands[2].length);
            return this.provideFunctionCompletions(range);
        }

        // --- function <func> <time> [append|replace] ---
        if (subCmd === "function") {
            if (commands.length === 4) {
                return [
                    this.createCompletionItem("<time>", "延迟时间 (如 5s, 100t, 1d)", "", true, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("5s", "5 秒后", "5s", false, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("1d", "1 游戏日后", "1d", false, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("100t", "100 tick 后", "100t", false, vscode.CompletionItemKind.Value),
                ];
            }
            if (commands.length === 5) {
                return [
                    this.createCompletionItem("append", "追加任务（不覆盖已有）", "append", false, vscode.CompletionItemKind.Keyword),
                    this.createCompletionItem("replace", "覆盖已有任务", "replace", false, vscode.CompletionItemKind.Keyword),
                ];
            }
        }

        // --- repeat <func> <interval> [次数] ---
        if (subCmd === "repeat") {
            if (commands.length === 4) {
                return [
                    this.createCompletionItem("<interval>", "重复间隔 (如 5s, 100t, 1d)", "", true, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("5s", "每 5 秒", "5s", false, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("1d", "每游戏日", "1d", false, vscode.CompletionItemKind.Value),
                    this.createCompletionItem("100t", "每 100 tick", "100t", false, vscode.CompletionItemKind.Value),
                ];
            }
            if (commands.length === 5) {
                return [
                    this.createCompletionItem("<次数>", "重复次数（留空则无限）", "", true, vscode.CompletionItemKind.Value),
                ];
            }
        }

        // --- random <func> <min> <max> ---
        if (subCmd === "random") {
            if (commands.length === 4) {
                return [
                    this.createCompletionItem("<min>", "最小延迟 (如 5s)", "", true, vscode.CompletionItemKind.Value),
                ];
            }
            if (commands.length === 5) {
                return [
                    this.createCompletionItem("<max>", "最大延迟 (如 30s)", "", false, vscode.CompletionItemKind.Value),
                ];
            }
        }

        return [];
    }
}
