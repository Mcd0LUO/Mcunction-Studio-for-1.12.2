import * as vscode from "vscode";
import { BaseCompletionProvider } from "../../Base";

export class CloneCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        if (commands.length <= 10) {
            return this.ctx.coordinates();
        }
        else if (commands.length === 11) {
            return [
                this.ctx.item(
                    'filtered',
                    '过滤 只复制指定方块',
                    'filtered'
                ),
                this.ctx.item(
                    'masked',
                    '遮罩 仅复制非空气方块',
                    'masked'
                ),
                this.ctx.item(
                    'replace',
                    '覆盖 复制所有方块',
                    'replace'
                ),

            ];
        }
        else if (commands.length === 12) {
            return [
                this.ctx.item(
                    'force',
                    '强制 忽略方块重叠',
                    'force'
                ),
                this.ctx.item(
                    'move',
                    '移动 源方块将迁移到目标方块',
                    'move'
                ),
                this.ctx.item(
                    'normal',
                    '正常 不执行force和normal',
                    'normal'
                )
            ];
        }
        else if (commands.length === 13 && commands[10] === 'filtered') {
            return this.ctx.blocks();
        }
        return [];
    }
}
