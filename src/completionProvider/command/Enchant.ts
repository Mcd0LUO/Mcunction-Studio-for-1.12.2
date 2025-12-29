import * as vscode from "vscode";
import { BaseCompletionProvider } from "../Base";
import { Enchantments } from "../../utils/EnumLib";

export class EnchantCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'enchant';
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        
        if (commands.length === 3) {
            // 第三个参数是附魔名称
            return this.createEnchantmentCompletions();
        }
        
        
        return [];
    }
    
    /**
     * 创建附魔名称补全项
     * @returns 附魔补全项数组
     */
    private createEnchantmentCompletions(): vscode.CompletionItem[] {
        return Enchantments.all.map(enchant =>
            this.createCompletionItem(
                enchant.name,
                enchant.desc,
                enchant.name,
                true,
                vscode.CompletionItemKind.Enum
            )
        );
    }
}