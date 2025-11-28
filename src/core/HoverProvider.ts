import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';

export class McFunctionHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // 诊断
        const lineText = document.lineAt(position.line).text;
        const hover = this.provideSelecterDiagnostics(document, position, token, lineText);
        if (hover) {
            return hover;
        }
        return hover;
    }
    private provideSelecterDiagnostics(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, lineText: string): vscode.Hover | null {
    const selector = CommandUtils.getCursorSelector(lineText, position.character);
    if (!selector) {return null;}
    

    return null;

    }
}

// 注册
export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('mcfunction', new McFunctionHoverProvider()));
}
