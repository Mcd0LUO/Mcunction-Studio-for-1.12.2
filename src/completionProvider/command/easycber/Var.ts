import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class VarCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem("set", "设置/声明变量", "set", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("operation", "变量变换操作", "operation", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("get", "查看变量", "get", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("del", "删除变量", "del", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("delall", "清空命名空间下所有变量", "delall", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("save", "持久化变量", "save", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("load", "加载持久化变量", "load", false, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 3) {
            return [
                this.createCompletionItem("<命名空间>", "变量命名空间（如 test）", "", true, vscode.CompletionItemKind.Variable),
            ];
        }

        // ---- /var set <ns> <var> ... ----
        if (commands[1] === "set") {
            return this.handleSet(document, position, commands);
        }

        // ---- /var operation <ns> <var> <category> <op> [extra] ----
        if (commands[1] === "operation") {
            return this.handleOperation(commands);
        }

        // ---- /var get <ns> [var] ----
        if (commands[1] === "get" && commands.length === 4) {
            return [
                this.createCompletionItem("<变量名>", "查看指定变量（留空查看全部）", "", false, vscode.CompletionItemKind.Variable),
            ];
        }

        // ---- /var del <ns> <var> ----
        if (commands[1] === "del" && commands.length === 4) {
            return [
                this.createCompletionItem("<变量名>", "要删除的变量名", "", false, vscode.CompletionItemKind.Variable),
            ];
        }

        return [];
    }

    private handleSet(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 4) {
            return [
                this.createCompletionItem("<变量名>", "变量名（须符合 [a-zA-Z_][a-zA-Z0-9_]*）", "", true, vscode.CompletionItemKind.Variable),
            ];
        }
        if (commands.length === 5) {
            return [
                this.createCompletionItem("value", "直接赋值", "value", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("from", "从外部来源取值", "from", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        // value 分支
        if (commands[4] === "value") {
            if (commands.length === 6) {
                return [this.createCompletionItem("<值>", "变量值（字符串须引号包裹）", "", true, vscode.CompletionItemKind.Value)];
            }
            if (commands.length === 7) {
                return [
                    this.createCompletionItem("int", "整数类型（默认自动推断）", "int", false, vscode.CompletionItemKind.TypeParameter),
                    this.createCompletionItem("float", "浮点类型", "float", false, vscode.CompletionItemKind.TypeParameter),
                    this.createCompletionItem("string", "字符串类型", "string", false, vscode.CompletionItemKind.TypeParameter),
                    this.createCompletionItem("bool", "布尔类型", "bool", false, vscode.CompletionItemKind.TypeParameter),
                    this.createCompletionItem("list", "列表类型", "list", false, vscode.CompletionItemKind.TypeParameter),
                    this.createCompletionItem("map", "映射类型", "map", false, vscode.CompletionItemKind.TypeParameter),
                ];
            }
            return [];
        }

        // from 分支
        if (commands[4] === "from") {
            return this.handleSetFrom(document, position, commands);
        }

        return [];
    }

    /**
     * /var set <ns> <var> from <源> ...
     * 所有源均支持末尾 [scale N]
     */
    private handleSetFrom(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 6) {
            return [
                this.createCompletionItem("var", "从变量取值", "var", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("score", "从记分板取值", "score", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("entity", "从实体 NBT 取值", "entity", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("block", "从方块 NBT 取值", "block", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("time", "获取时间值", "time", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        const sourceType = commands[5];

        // —— from var <srcNs> <srcName> [scale N] ——
        if (sourceType === "var") {
            if (commands.length === 7) {
                return [this.createCompletionItem("<命名空间>", "源变量命名空间", "", true, vscode.CompletionItemKind.Variable)];
            }
            if (commands.length === 8) {
                return [this.createCompletionItem("<变量名>", "源变量名", "", false, vscode.CompletionItemKind.Variable)];
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
     * 通用 scale 补全：在源参数完成后，offer scale / scale <N>
     * @param afterSourceArgs 源参数刚结束时的 commands.length（即刚提供完最后一个源参数后）
     */
    private provideScaleCompletions(commands: string[], afterSourceArgs: number): vscode.CompletionItem[] {
        if (commands.length === afterSourceArgs + 1) {
            // scale 关键字
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

    // ---- /var operation ----
    private handleOperation(commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 4) {
            return [this.createCompletionItem("<变量名>", "目标变量名", "", true, vscode.CompletionItemKind.Variable)];
        }
        if (commands.length === 5) {
            return [
                this.createCompletionItem("math", "数学运算", "math", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("string", "字符串操作", "string", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("list", "列表操作", "list", true, vscode.CompletionItemKind.Keyword),
            ];
        }
        if (commands.length === 6) {
            if (commands[4] === "math") {
                return [
                    this.createCompletionItem("sqrt", "平方根", "sqrt", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("abs", "绝对值", "abs", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("int", "转整数", "int", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("float", "转浮点", "float", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("double", "转双精度", "double", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("bin", "十进制转二进制", "bin", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("pow", "幂运算", "pow", true, vscode.CompletionItemKind.Operator),
                ];
            }
            if (commands[4] === "string") {
                return [
                    this.createCompletionItem("upper", "转大写", "upper", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("lower", "转小写", "lower", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toString", "转字符串", "toString", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toUUID", "转 UUID", "toUUID", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toInt", "转整数", "toInt", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toFloat", "转浮点", "toFloat", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toDouble", "转双精度", "toDouble", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("split", "分隔", "split", true, vscode.CompletionItemKind.Operator),
                ];
            }
            if (commands[4] === "list") {
                return [
                    this.createCompletionItem("join", "拼接列表元素", "join", true, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("toString", "逐元素转字符串", "toString", false, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("math", "逐元素数学运算", "math", true, vscode.CompletionItemKind.Operator),
                    this.createCompletionItem("sort", "排序", "sort", true, vscode.CompletionItemKind.Operator),
                ];
            }
        }
        // math pow <指数>
        if (commands.length === 7 && commands[5] === "pow") {
            return [this.createCompletionItem("<指数>", "幂指数值", "", false, vscode.CompletionItemKind.Value)];
        }
        // list math <op>
        if (commands.length === 7 && commands[4] === "list" && commands[5] === "math") {
            return [
                this.createCompletionItem("sqrt", "平方根", "sqrt", false, vscode.CompletionItemKind.Operator),
                this.createCompletionItem("abs", "绝对值", "abs", false, vscode.CompletionItemKind.Operator),
                this.createCompletionItem("pow", "幂运算", "pow", true, vscode.CompletionItemKind.Operator),
            ];
        }
        // list math pow <指数>
        if (commands.length === 8 && commands[4] === "list" && commands[6] === "pow") {
            return [this.createCompletionItem("<指数>", "幂指数值", "", false, vscode.CompletionItemKind.Value)];
        }
        // list sort [min|max]
        if (commands.length === 7 && commands[5] === "sort") {
            return [
                this.createCompletionItem("min", "升序", "min", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("max", "降序", "max", false, vscode.CompletionItemKind.Enum),
            ];
        }
        // split / join 的分隔符参数
        if (commands.length === 7 && ["split", "join"].includes(commands[5])) {
            return [
                this.createCompletionItem('"<分隔符>"', "分隔符（须引号包裹）", '"', false, vscode.CompletionItemKind.Value),
            ];
        }
        return [];
    }
}
