import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class ForeachCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'foreach';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        // /foreach var <ns> <list_var> as <ns> <item_var> run <命令>
        // /foreach data entity <selector> <path> as <ns> <item_var> run <命令>
        // /foreach data block <x> <y> <z> <path> as <ns> <item_var> run <命令>

        if (commands.length === 2) {
            return [
                this.createCompletionItem(
                    "var",
                    "遍历命名空间变量中的列表",
                    "var",
                    true,
                    vscode.CompletionItemKind.Keyword
                ),
                this.createCompletionItem(
                    "data",
                    "遍历实体/方块的 NBT 数据列表",
                    "data",
                    true,
                    vscode.CompletionItemKind.Keyword
                ),
            ];
        }

        // /foreach var <ns> <list_var>
        if (commands[1] === "var") {
            if (commands.length === 3) {
                return [
                    this.createCompletionItem(
                        "<命名空间>",
                        "变量命名空间",
                        "",
                        true,
                        vscode.CompletionItemKind.Variable
                    ),
                ];
            }
            if (commands.length === 4) {
                return [
                    this.createCompletionItem(
                        "<列表变量>",
                        "列表类型的变量名",
                        "",
                        true,
                        vscode.CompletionItemKind.Variable
                    ),
                ];
            }
        }

        // /foreach data entity <selector> <path>
        // /foreach data block <x> <y> <z> <path>
        if (commands[1] === "data") {
            if (commands.length === 3) {
                return [
                    this.createCompletionItem(
                        "entity",
                        "遍历实体数据列表",
                        "entity",
                        true,
                        vscode.CompletionItemKind.Keyword
                    ),
                    this.createCompletionItem(
                        "block",
                        "遍历方块数据列表",
                        "block",
                        true,
                        vscode.CompletionItemKind.Keyword
                    ),
                ];
            }
            if (commands[2] === "entity") {
                if (commands.length === 4) {
                    return this.provideSelectorCompletions(commands[3]);
                }
                if (commands.length === 5) {
                    return [
                        this.createCompletionItem(
                            "<NBT路径>",
                            "NBT 列表路径，如 Inventory, Motion",
                            "",
                            true,
                            vscode.CompletionItemKind.Field
                        ),
                    ];
                }
            }
            if (commands[2] === "block") {
                if (commands.length >= 4 && commands.length <= 6) {
                    return this.provideCoordinateCompletions();
                }
                if (commands.length === 7) {
                    return [
                        this.createCompletionItem(
                            "<NBT路径>",
                            "NBT 列表路径，如 Items",
                            "",
                            true,
                            vscode.CompletionItemKind.Field
                        ),
                    ];
                }
            }
        }

        // as <ns> <item_var>
        const asIndex = commands.indexOf("as");
        if (asIndex !== -1 && asIndex === commands.length - 2) {
            // "as" is the second-to-last, user needs to type ns
            return [
                this.createCompletionItem(
                    "<命名空间>",
                    "临时变量命名空间",
                    "",
                    true,
                    vscode.CompletionItemKind.Variable
                ),
            ];
        }
        if (asIndex !== -1 && asIndex === commands.length - 3 && commands[asIndex + 1] !== "run") {
            // user needs to type item_var name
            return [
                this.createCompletionItem(
                    "<变量名>",
                    "临时变量名（用于 %ns:var% 引用）",
                    "",
                    true,
                    vscode.CompletionItemKind.Variable
                ),
            ];
        }

        // "as" keyword
        if (asIndex === -1 && commands.length >= 4) {
            return [
                this.createCompletionItem(
                    "as",
                    "绑定临时变量",
                    "as",
                    true,
                    vscode.CompletionItemKind.Keyword
                ),
            ];
        }

        // run keyword
        if (asIndex !== -1 && commands.indexOf("run") === -1 && commands.length >= asIndex + 3) {
            return [
                this.createCompletionItem(
                    "run",
                    "执行命令（可用 %ns:var% 引用遍历项）",
                    "run",
                    true,
                    vscode.CompletionItemKind.Keyword
                ),
            ];
        }

        // After run: suggest commands
        if (commands.indexOf("run") !== -1 && commands.indexOf("run") === commands.length - 1) {
            return [
                this.createCompletionItem(
                    "<命令>",
                    "要执行的命令",
                    "",
                    true,
                    vscode.CompletionItemKind.Snippet
                ),
            ];
        }

        return [];
    }
}
