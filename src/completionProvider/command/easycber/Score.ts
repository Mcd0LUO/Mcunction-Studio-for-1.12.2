import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class ScoreCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'score';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        // /score set <obj> <sel> from var|score|entity|block|time [...]
        // 所有源均支持末尾 [scale N]

        if (commands.length === 2) {
            return [
                this.createCompletionItem("set", "设置记分板值", "set", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 3) {
            const range = this.getWordRange(document, position, commands[2].length);
            return this.provideScoreboardCompletions(range);
        }

        if (commands.length === 4) {
            return this.provideSelectorCompletions(commands[3]);
        }

        if (commands.length === 5) {
            return [
                this.createCompletionItem("from", "指定数据来源", "from", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 6) {
            return [
                this.createCompletionItem("var", "从命名空间变量取值", "var", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("score", "从记分板取值", "score", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("entity", "从实体 NBT 取值", "entity", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("block", "从方块 NBT 取值", "block", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("time", "获取时间值", "time", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        const sourceType = commands[5];

        // —— from var <ns> <name> [scale N] ——
        if (sourceType === "var") {
            if (commands.length === 7) {
                return [this.createCompletionItem("<命名空间>", "变量命名空间", "", true, vscode.CompletionItemKind.Variable)];
            }
            if (commands.length === 8) {
                return [this.createCompletionItem("<变量名>", "变量名", "", false, vscode.CompletionItemKind.Variable)];
            }
            return this.provideScaleCompletions(commands, 8);
        }

        // —— from score <sel> <obj> [scale N] ——
        if (sourceType === "score") {
            if (commands.length === 7) {
                return this.provideSelectorCompletions(commands[6]);
            }
            if (commands.length === 8) {
                const range = this.getWordRange(document, position, commands[7].length);
                return this.provideScoreboardCompletions(range);
            }
            return this.provideScaleCompletions(commands, 8);
        }

        // —— from entity <sel> <path> [scale N] ——
        if (sourceType === "entity") {
            if (commands.length === 7) {
                return this.provideSelectorCompletions(commands[6]);
            }
            if (commands.length === 8) {
                return [this.createCompletionItem("<NBT路径>", "实体 NBT 数据路径，如 Health", "", true, vscode.CompletionItemKind.Field)];
            }
            return this.provideScaleCompletions(commands, 8);
        }

        // —— from block <x> <y> <z> <path> [scale N] ——
        if (sourceType === "block") {
            if (commands.length >= 7 && commands.length <= 9) {
                return this.provideCoordinateCompletions();
            }
            if (commands.length === 10) {
                return [this.createCompletionItem("<NBT路径>", "方块 NBT 数据路径，如 Items[0].id", "", true, vscode.CompletionItemKind.Field)];
            }
            return this.provideScaleCompletions(commands, 10);
        }

        // —— from time <unit> [scale N] ——
        if (sourceType === "time") {
            if (commands.length === 7) {
                return [
                    this.createCompletionItem("tick", "游戏刻", "tick", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("ms", "毫秒", "ms", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("s", "秒", "s", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("m", "分钟", "m", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("h", "小时", "h", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("d", "天", "d", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("mo", "月", "mo", false, vscode.CompletionItemKind.Unit),
                    this.createCompletionItem("y", "年", "y", false, vscode.CompletionItemKind.Unit),
                ];
            }
            return this.provideScaleCompletions(commands, 7);
        }

        return [];
    }

    /**
     * 通用 scale 补全
     */
    private provideScaleCompletions(commands: string[], afterSourceArgs: number): vscode.CompletionItem[] {
        if (commands.length === afterSourceArgs + 1) {
            return [
                this.createCompletionItem("scale", "缩放值", "scale", true, vscode.CompletionItemKind.Keyword),
            ];
        }
        if (commands.length === afterSourceArgs + 2 && commands[afterSourceArgs] === "scale") {
            return [
                this.createCompletionItem("<值>", "缩放倍数", "", false, vscode.CompletionItemKind.Value),
            ];
        }
        return [];
    }
}
