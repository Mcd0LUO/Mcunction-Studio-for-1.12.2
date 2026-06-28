import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class NbtCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'nbt';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem("get", "读取 NBT 数据", "get", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("set", "写入 NBT 数据", "set", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 3) {
            return [
                this.createCompletionItem("entity", "实体 NBT", "entity", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("block", "方块 NBT", "block", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands[1] === "get") {
            return this.handleGet(commands);
        }

        if (commands[1] === "set") {
            return this.handleSet(document, position, commands);
        }

        return [];
    }

    // ==================== /nbt get ====================
    private handleGet(commands: string[]): vscode.CompletionItem[] {
        // /nbt get entity <sel> [path]
        if (commands[2] === "entity") {
            if (commands.length === 4) {
                return this.provideSelectorCompletions(commands[3]);
            }
            if (commands.length === 5) {
                return [this.createCompletionItem("<NBT路径>", "可选：NBT 路径，如 CustomName", "", false, vscode.CompletionItemKind.Field)];
            }
        }
        // /nbt get block <x> <y> <z> [path]
        if (commands[2] === "block") {
            if (commands.length >= 4 && commands.length <= 6) {
                return this.provideCoordinateCompletions();
            }
            if (commands.length === 7) {
                return [this.createCompletionItem("<NBT路径>", "可选：NBT 路径", "", false, vscode.CompletionItemKind.Field)];
            }
        }
        return [];
    }

    // ==================== /nbt set ====================
    private handleSet(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands[2] === "entity") {
            return this.handleSetEntity(document, position, commands);
        }
        if (commands[2] === "block") {
            return this.handleSetBlock(document, position, commands);
        }
        return [];
    }

    // /nbt set entity <sel> <path> value|from ...
    private handleSetEntity(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 4) {
            return this.provideSelectorCompletions(commands[3]);
        }
        if (commands.length === 5) {
            return [this.createCompletionItem("<NBT路径>", "NBT 数据路径，如 CustomName", "", true, vscode.CompletionItemKind.Field)];
        }
        if (commands.length === 6) {
            return [
                this.createCompletionItem("value", "直接赋值", "value", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("from", "从来源取值", "from", true, vscode.CompletionItemKind.Keyword),
            ];
        }
        // value <字面量>
        if (commands[5] === "value" && commands.length === 7) {
            return [
                this.createCompletionItem('"<值>"', "字符串值（须引号包裹）", '"', true, vscode.CompletionItemKind.Value),
            ];
        }
        // from <源> ...
        if (commands[5] === "from") {
            return this.handleSetFrom(document, position, commands, 6);
        }
        return [];
    }

    // /nbt set block <x> <y> <z> <path> value|from ...
    private handleSetBlock(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands.length >= 4 && commands.length <= 6) {
            return this.provideCoordinateCompletions();
        }
        if (commands.length === 7) {
            return [this.createCompletionItem("<NBT路径>", "NBT 数据路径，如 Lock", "", true, vscode.CompletionItemKind.Field)];
        }
        if (commands.length === 8) {
            return [
                this.createCompletionItem("value", "直接赋值", "value", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("from", "从来源取值", "from", true, vscode.CompletionItemKind.Keyword),
            ];
        }
        // value <字面量>
        if (commands[7] === "value" && commands.length === 9) {
            return [
                this.createCompletionItem('"<值>"', "字符串值（须引号包裹）", '"', true, vscode.CompletionItemKind.Value),
            ];
        }
        // from <源> ...
        if (commands[7] === "from") {
            return this.handleSetFrom(document, position, commands, 8);
        }
        return [];
    }

    /**
     * 统一处理 from 子句：源 = var|score|entity|block|time|value
     * @param fromIndex commands 中 "from" 关键字所在索引
     */
    private handleSetFrom(document: vscode.TextDocument, position: vscode.Position, commands: string[], fromIndex: number): vscode.CompletionItem[] {
        const afterFrom = fromIndex + 1; // "from" 后第一个参数的位置

        // from 后第一个参数：源类型
        if (commands.length === afterFrom) {
            return [
                this.createCompletionItem("var", "从变量取值", "var", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("score", "从记分板取值", "score", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("entity", "从实体 NBT 取值", "entity", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("block", "从方块 NBT 取值", "block", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("time", "获取时间值", "time", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("value", "字面量值", "value", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        const sourceType = commands[afterFrom];

        // —— from var <ns> <name> ——
        if (sourceType === "var") {
            if (commands.length === afterFrom + 1) {
                return [this.createCompletionItem("<命名空间>", "变量命名空间", "", true, vscode.CompletionItemKind.Variable)];
            }
            if (commands.length === afterFrom + 2) {
                return [this.createCompletionItem("<变量名>", "变量名", "", false, vscode.CompletionItemKind.Variable)];
            }
        }

        // —— from score <sel> <obj> ——
        if (sourceType === "score") {
            if (commands.length === afterFrom + 1) {
                return this.provideSelectorCompletions(commands[afterFrom + 1] || '');
            }
            if (commands.length === afterFrom + 2) {
                const range = this.getWordRange(document, position, (commands[afterFrom + 2] || '').length);
                return this.provideScoreboardCompletions(range);
            }
        }

        // —— from entity <sel> <path> ——
        if (sourceType === "entity") {
            if (commands.length === afterFrom + 1) {
                return this.provideSelectorCompletions(commands[afterFrom + 1] || '');
            }
            if (commands.length === afterFrom + 2) {
                return [this.createCompletionItem("<NBT路径>", "实体 NBT 路径，如 Health", "", false, vscode.CompletionItemKind.Field)];
            }
        }

        // —— from block <x> <y> <z> <path> ——
        if (sourceType === "block") {
            const afterBlock = commands.indexOf("block", afterFrom);
            if (afterBlock !== -1) {
                const posInBlock = commands.length - afterBlock - 1;
                if (posInBlock >= 1 && posInBlock <= 3) {
                    return this.provideCoordinateCompletions();
                }
                if (posInBlock === 4) {
                    return [this.createCompletionItem("<NBT路径>", "方块 NBT 路径，如 Items[0].id", "", false, vscode.CompletionItemKind.Field)];
                }
            }
        }

        // —— from time <unit> ——
        if (sourceType === "time") {
            if (commands.length === afterFrom + 1) {
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
        }

        // —— from value <字面量> ——
        if (sourceType === "value") {
            if (commands.length === afterFrom + 1) {
                return [
                    this.createCompletionItem('"<值>"', "字符串值（须引号包裹）", '"', false, vscode.CompletionItemKind.Value),
                ];
            }
        }

        return [];
    }
}
