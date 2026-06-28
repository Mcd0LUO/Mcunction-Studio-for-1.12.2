import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class SuperexeCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        // /superexe 关键字自由链式组合，遇 run 结束
        // /superexe if <条件> [facing ...] [positioned ...] run <命令>

        const lastArg = commands[commands.length - 1];

        // 根关键字：if / unless / facing / positioned / run
        // 这些在任意非末尾位置都可能出现（run 除外）
        const midKeywords = [
            this.ctx.item("if", "条件判断（真）", "if", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("unless", "条件判断（假）", "unless", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("facing", "设置执行朝向", "facing", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("positioned", "设置执行位置", "positioned", true, vscode.CompletionItemKind.Keyword),
        ];

        const runKeyword = this.ctx.item("run", "执行命令", "run", true, vscode.CompletionItemKind.Keyword);

        // 检查是否已经出现了 run（run 后的内容不再处理补全）
        const runIndex = commands.indexOf("run");
        if (runIndex !== -1 && runIndex < commands.length - 1) {
            // run 后面已有内容，不做补全
            return [];
        }

        // 如果最后一个参数是 run，补全所有根命令
        if (lastArg === "run") {
            return [
                this.ctx.item(
                    "<命令>",
                    "要执行的命令",
                    "",
                    true,
                    vscode.CompletionItemKind.Snippet
                ),
            ];
        }

        // 分析上一个关键字决定当前要补全什么
        const prevArg = commands.length >= 2 ? commands[commands.length - 2] : '';

        switch (prevArg) {
            case "if":
            case "unless":
                // if/unless 后接条件类型
                return this.provideConditionCompletions();

            case "facing":
                // facing entity <selector> 或 facing block <坐标>
                return this.provideFacingCompletions(commands, lastArg);

            case "positioned":
                // positioned <selector> 或 positioned <x> <y> <z>
                return this.providePositionedCompletions(commands, lastArg);

            case "entity":
                // if entity / if score / if var / if block / if data
                return this.provideEntitySubCompletions(commands, lastArg);

            case "block":
                return this.provideBlockSubCompletions(commands, lastArg);

            case "score":
                return this.provideScoreSubCompletions(commands, lastArg);

            case "var":
                return this.provideVarSubCompletions(commands, lastArg);

            case "data":
                return this.provideDataSubCompletions(commands, lastArg);

            default:
                // 默认提供所有中间关键字 + run
                return [...midKeywords, runKeyword];
        }
    }

    private provideConditionCompletions(): vscode.CompletionItem[] {
        return [
            this.ctx.item("entity", "实体存在性检查", "entity", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("block", "方块检查", "block", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("score", "记分板比较", "score", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("var", "变量比较", "var", true, vscode.CompletionItemKind.Keyword),
            this.ctx.item("data", "NBT 数据路径比较", "data", true, vscode.CompletionItemKind.Keyword),
        ];
    }

    private provideFacingCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        if (lastArg === "facing" || commands.length <= 2) {
            return [
                this.ctx.item("entity", "朝向实体", "entity", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("block", "朝向方块坐标", "block", true, vscode.CompletionItemKind.Keyword),
            ];
        }
        return [];
    }

    private providePositionedCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // positioned <selector> 或 positioned <x> <y> <z>
        if (["positioned"].includes(commands[commands.length - 2]) || commands.length <= 2) {
            const items = this.ctx.selectors(lastArg);
            items.push(...this.ctx.coordinates());
            return items;
        }
        // After coordinate ~ ~, continue coordinate suggestions
        if (["~", "^"].includes(lastArg) || !isNaN(Number(lastArg))) {
            return this.ctx.coordinates();
        }
        return [];
    }

    private provideEntitySubCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // if entity <selector>
        // 找到最近的 if/unless 之后是 entity 关键字
        const entityIdx = commands.lastIndexOf("entity");
        if (entityIdx !== -1 && commands.length === entityIdx + 2) {
            // 只有 entity 和一个待补全的参数
            return this.ctx.selectors(lastArg);
        }
        // if entity <selector> <op> ...
        const prevArg = commands[commands.length - 2];
        if (prevArg === "entity" && commands.length >= entityIdx + 3) {
            return this.ctx.selectors(lastArg);
        }
        // After selector: op or facing/positioned/run
        const entityIdx2 = commands.lastIndexOf("entity");
        if (entityIdx2 !== -1 && commands.length > entityIdx2 + 2) {
            // Could have matches/op after selector
            return this.provideCompareCompletions();
        }
        return [];
    }

    private provideBlockSubCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // if block <x> <y> <z>
        const blockIdx = commands.lastIndexOf("block");
        if (blockIdx !== -1) {
            const afterBlock = commands.length - blockIdx - 1;
            if (afterBlock >= 1 && afterBlock <= 3) {
                return this.ctx.coordinates();
            }
            if (afterBlock === 4) {
                return this.provideCompareCompletions();
            }
        }
        return [];
    }

    private provideScoreSubCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // if score <selector> <obj> <op> score <selector> <obj>
        const scoreIdx = commands.lastIndexOf("score");
        if (scoreIdx !== -1) {
            const afterScore = commands.length - scoreIdx - 1;
            if (afterScore === 1) {
                return this.ctx.selectors(lastArg);
            }
            if (afterScore === 2) {
                return this.ctx.scoreboards(this.getLastWordRange());
            }
            if (afterScore === 3) {
                return [
                    this.ctx.item(">", "大于", ">", true, vscode.CompletionItemKind.Operator),
                    this.ctx.item("<", "小于", "<", true, vscode.CompletionItemKind.Operator),
                    this.ctx.item(">=", "大于等于", ">=", true, vscode.CompletionItemKind.Operator),
                    this.ctx.item("<=", "小于等于", "<=", true, vscode.CompletionItemKind.Operator),
                    this.ctx.item("=", "等于", "=", true, vscode.CompletionItemKind.Operator),
                    this.ctx.item("matches", "匹配范围 (1..100 / ..50 / 10..)", "matches", true, vscode.CompletionItemKind.Operator),
                ];
            }
            if (afterScore === 4 && commands[commands.length - 2] === "score") {
                // second "score" keyword for comparison
                return this.ctx.selectors(lastArg);
            }
            if (afterScore === 5) {
                return this.ctx.scoreboards(this.getLastWordRange());
            }
        }
        return [];
    }

    private provideVarSubCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // if var <ns> <var> <op> var <ns> <var>
        const varIdx = commands.lastIndexOf("var");
        if (varIdx !== -1) {
            const afterVar = commands.length - varIdx - 1;
            if (afterVar === 1 || afterVar === 5) {
                // ns name
                return [
                    this.ctx.item(
                        "<命名空间>",
                        "变量命名空间",
                        "",
                        true,
                        vscode.CompletionItemKind.Variable
                    ),
                ];
            }
            if (afterVar === 2 || afterVar === 6) {
                return [
                    this.ctx.item(
                        "<变量名>",
                        "变量名",
                        "",
                        false,
                        vscode.CompletionItemKind.Variable
                    ),
                ];
            }
            if (afterVar === 3) {
                return this.provideCompareCompletions();
            }
        }
        return [];
    }

    private provideDataSubCompletions(commands: string[], lastArg: string): vscode.CompletionItem[] {
        // if data entity <selector> <path> <op> data entity <selector> <path>
        // if data block <x> <y> <z> <path> <op> data block <x> <y> <z> <path>
        const dataIdx = commands.lastIndexOf("data");
        if (dataIdx !== -1) {
            const afterData = commands.length - dataIdx - 1;
            // First data block
            if (afterData === 1) {
                return [
                    this.ctx.item("entity", "实体数据", "entity", true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item("block", "方块数据", "block", true, vscode.CompletionItemKind.Keyword),
                ];
            }
            // Could be entity or block sub-path
        }
        return [];
    }

    private provideCompareCompletions(): vscode.CompletionItem[] {
        return [
            this.ctx.item(">", "大于", ">", true, vscode.CompletionItemKind.Operator),
            this.ctx.item("<", "小于", "<", true, vscode.CompletionItemKind.Operator),
            this.ctx.item(">=", "大于等于", ">=", true, vscode.CompletionItemKind.Operator),
            this.ctx.item("<=", "小于等于", "<=", true, vscode.CompletionItemKind.Operator),
            this.ctx.item("=", "等于", "=", true, vscode.CompletionItemKind.Operator),
            this.ctx.item("==", "等于", "==", true, vscode.CompletionItemKind.Operator),
            this.ctx.item("matches", "匹配范围", "matches", true, vscode.CompletionItemKind.Operator),
        ];
    }

    private getLastWordRange(): vscode.Range | undefined {
        return undefined;
    }
}
