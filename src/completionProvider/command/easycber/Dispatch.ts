import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';
import { CommandRegistry } from '../../../core/CommandRegistry';

export class DispatchCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'dispatch';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        // /dispatch <任意命令> —— 将 %ns:var% 替换后执行
        // 当只有 /dispatch 时，补全所有根命令
        if (commands.length === 2) {
            const prefix = commands[1].toLowerCase();
            return CommandRegistry.getRootCommands()
                .filter(cmd => prefix === '' || cmd.toLowerCase().startsWith(prefix))
                .map(cmd => this.createCompletionItem(
                    cmd,
                    "通过 /dispatch 执行",
                    cmd,
                    true
                ));
        }

        return [];
    }
}
