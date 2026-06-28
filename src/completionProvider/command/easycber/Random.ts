import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class RandomCompletionProvider extends BaseCompletionProvider {

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.ctx.item("var", "对命名空间变量进行随机赋值", "var", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("score", "对记分板进行随机赋值", "score", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        if (commands.length === 3) {
            return [
                this.ctx.item("range", "范围内随机", "range", true, vscode.CompletionItemKind.Keyword),
                this.ctx.item("sample", "从列表中随机采样", "sample", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        // ---- /random var ----
        if (commands[1] === "var") {
            return this.handleVarRandom(document, position, commands);
        }

        // ---- /random score ----
        if (commands[1] === "score") {
            return this.handleScoreRandom(document, position, commands);
        }

        return [];
    }

    // /random var range  <ns> <var> <min> <max> [int|float]
    // /random var sample <ns> <var> <count>
    private handleVarRandom(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands.length === 4) {
            return [this.ctx.item("<命名空间>", "变量命名空间", "", true, vscode.CompletionItemKind.Variable)];
        }
        if (commands.length === 5) {
            return [this.ctx.item("<变量名>", "目标变量名", "", true, vscode.CompletionItemKind.Variable)];
        }

        if (commands[2] === "range") {
            if (commands.length === 6) {
                return [this.ctx.item("<min>", "最小值", "", true, vscode.CompletionItemKind.Value)];
            }
            if (commands.length === 7) {
                return [this.ctx.item("<max>", "最大值", "", false, vscode.CompletionItemKind.Value)];
            }
            if (commands.length === 8) {
                return [
                    this.ctx.item("int", "整数类型", "int", false, vscode.CompletionItemKind.TypeParameter),
                    this.ctx.item("float", "浮点类型", "float", false, vscode.CompletionItemKind.TypeParameter),
                ];
            }
        }

        if (commands[2] === "sample") {
            if (commands.length === 6) {
                return [this.ctx.item("<count>", "采样数量", "", false, vscode.CompletionItemKind.Value)];
            }
        }

        return [];
    }

    // /random score range  <obj> <sel> <min> <max>
    // /random score sample <ns> <var> <obj> <sel>
    private handleScoreRandom(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        if (commands[2] === "range") {
            if (commands.length === 4) {
                return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[3].length));
            }
            if (commands.length === 5) {
                return this.ctx.selectors(commands[4]);
            }
            if (commands.length === 6) {
                return [this.ctx.item("<min>", "最小值", "", true, vscode.CompletionItemKind.Value)];
            }
            if (commands.length === 7) {
                return [this.ctx.item("<max>", "最大值", "", false, vscode.CompletionItemKind.Value)];
            }
        }

        if (commands[2] === "sample") {
            // sample <ns> <var> <obj> <sel>
            if (commands.length === 4) {
                return [this.ctx.item("<命名空间>", "变量命名空间", "", true, vscode.CompletionItemKind.Variable)];
            }
            if (commands.length === 5) {
                return [this.ctx.item("<变量名>", "源列表变量名", "", true, vscode.CompletionItemKind.Variable)];
            }
            if (commands.length === 6) {
                return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[5].length));
            }
            if (commands.length === 7) {
                return this.ctx.selectors(commands[6]);
            }
        }

        return [];
    }
}
