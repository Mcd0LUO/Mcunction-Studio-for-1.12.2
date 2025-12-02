import * as vscode from 'vscode';
import { rootDir } from '../extension';
import { DataLoader } from '../core/DataLoader';

/**
 * 配置文件专属的 CodeLens 提供器
 */
class ConfigFileCodeLensProvider implements vscode.CodeLensProvider {
    // 判断是否是目标配置文件
    private isTargetConfigFile(document: vscode.TextDocument): boolean {
        return document.fileName.endsWith('McfunctionStudio.json')
            && (rootDir ? document.uri.fsPath.startsWith(rootDir.fsPath) : true);
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        if (!this.isTargetConfigFile(document)) {
            return codeLenses;
        }

        // 1. 第一行开头：重载配置
        const firstLineRange = document.lineAt(0).range;
        const reloadLens = new vscode.CodeLens(firstLineRange, {
            title: '▶️ 重载配置',
            command: 'mcf-studio.reloadConfig',
            arguments: [document.uri]
        });
        codeLenses.push(reloadLens);

        // 2. 第二行开头（若文件不足两行则用最后一行）：重载并重启拓展
        const secondLineNumber = Math.min(1, document.lineCount - 1); // 防止越界
        const secondLineRange = document.lineAt(secondLineNumber).range;
        const resetLens = new vscode.CodeLens(secondLineRange, {
            title: '🔄 重载并重启拓展',
            command: 'mcf-studio.ApplayConfig',
            arguments: [document.uri]
        });
        codeLenses.push(resetLens);

        return codeLenses;
    }

    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
        return codeLens;
    }
}

/**
 * 注册配置文件的 CodeLens 及对应命令
 */
export function registerConfigFileCodeLens(context: vscode.ExtensionContext): void {
    const disposables: vscode.Disposable[] = [];

    // 注册 CodeLens 提供器
    disposables.push(
        vscode.languages.registerCodeLensProvider(
            { pattern: '**/McfunctionStudio.json', scheme: 'file' },
            new ConfigFileCodeLensProvider()
        )
    );

    // 注册「重载配置」命令
    disposables.push(
        vscode.commands.registerCommand('mcf-studio.reloadConfig', async (uri: vscode.Uri) => {
            try {
                await DataLoader.getInstance().loadExtensionConfig();
            } catch (error) {
                vscode.window.showErrorMessage(`重载配置失败：${(error as Error).message}`);
            }
        })
    );

    // 注册「重载并重启拓展」命令（补充实现）
    disposables.push(
        vscode.commands.registerCommand('mcf-studio.ApplayConfig', async (uri: vscode.Uri) => {
            try {
                await DataLoader.getInstance().loadExtensionConfig();
                DataLoader.getInstance().loadData(true, DataLoader.getInstance().getConfig().FileProcessing.MaxConcurrentReads);
            } catch (error) {
                vscode.window.showErrorMessage(`重载并重启拓展失败：${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(...disposables);
}