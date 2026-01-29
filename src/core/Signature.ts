import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';
import { DataLoader } from './DataLoader';
import { MacroCompletionProvider } from '../completionProvider/macro/MacroCompletionProvider';
import { MacroRegistry } from '../macro/MacroRegistry';
import { MacroApply } from '../macro/MacroaApply';

/**
 * 命令签名帮助提供器（示例：scoreboard/function命令参数提示）
 */
export class McFunctionSignatureHelpProvider implements vscode.SignatureHelpProvider {


    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        if (!DataLoader.getInstance().getConfig().Signature) { return null; }
        const lineText = document.lineAt(position.line).text.trimStart();
        if (lineText.startsWith('$')) {
            return this.provideMacroSignatureHelp(lineText);
        }
        const commands = CommandUtils.extraceActiveCommand(lineText);
        switch (commands[0]) {
            case 'scoreboard':
                return this.provideScoreboardSignatureHelp(commands);
            case 'function':
                return this.provideFunctionSignatureHelp(commands);
            case 'execute':
                return this.provideExecuteSignatureHelp(commands);
            case 'summon':
                return this.provideSummonSignatureHelp(commands);
            case 'stats':
                return this.provideStatsSignatureHelp(commands);
            default:
                return;
        }

    }
    provideMacroSignatureHelp(text: string): vscode.ProviderResult<vscode.SignatureHelp> {
        const signatureHelp = new vscode.SignatureHelp();
        const args: string[] = [];
        if (args.length <= 2) {
            const signature = new vscode.SignatureInformation(
                '<namespace>.<macroName>'
            );
            signature.parameters = [
                new vscode.ParameterInformation('<namespace>'),
                new vscode.ParameterInformation('<macroName>'),
            ];
            signatureHelp.signatures = [signature];
            signatureHelp.activeSignature = 0;
            signatureHelp.activeParameter = args.length - 1;
            return signatureHelp;
        }
        if (args.length === 3) {
        }
        return signatureHelp;
    }
    provideStatsSignatureHelp(commands: string[]): vscode.ProviderResult<vscode.SignatureHelp> {
        if (commands.length >= 8) { return null; }
        if (commands[1] === 'block') { return; }
        const signatureHelp = new vscode.SignatureHelp();
        // 匹配 stats 命令
        const signature = new vscode.SignatureInformation(
            '<源> <绑定对象> <操作> <事件> <赋值对象> <记分项>',
        );
        signature.parameters = [
            new vscode.ParameterInformation('<源>'),
            new vscode.ParameterInformation('<绑定对象>', '目标选择器'),
            new vscode.ParameterInformation('<操作>'),
            new vscode.ParameterInformation('<事件>'),
            new vscode.ParameterInformation('<赋值对象>', '目标选择器'),
            new vscode.ParameterInformation('<记分项>')
        ];
        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = commands.length - 2;
        return signatureHelp;
    }
    provideSummonSignatureHelp(commands: string[]): vscode.ProviderResult<vscode.SignatureHelp> {
        if (commands.length >= 7) { return null; }
        const signatureHelp = new vscode.SignatureHelp();
        // 匹配 summon 命令
        const signature = new vscode.SignatureInformation(
            '[<实体ID> <x> <y> <z> <NBT>]',
        );
        signature.parameters = [
            new vscode.ParameterInformation('<实体ID>', '如minecraft:pig'),
            new vscode.ParameterInformation('<x>'),
            new vscode.ParameterInformation('<y>'),
            new vscode.ParameterInformation('<z>'),
            new vscode.ParameterInformation('<NBT>')
        ];
        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = commands.length - 2;

        return signatureHelp;
    }
    provideExecuteSignatureHelp(commands: string[]): vscode.ProviderResult<vscode.SignatureHelp> {
        if (commands.length <= 2 || commands.length > 5) { return null; }
        const signatureHelp = new vscode.SignatureHelp();
        const signature = new vscode.SignatureInformation(
            'vec3[<x> <y> <z>]',
        );
        signature.parameters = [
            new vscode.ParameterInformation('<x>', 'x坐标'),
            new vscode.ParameterInformation('<y>', 'y坐标'),
            new vscode.ParameterInformation('<z>', 'z坐标')
        ];
        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = commands.length - 3;
        return signatureHelp;
    }
    provideFunctionSignatureHelp(commands: string[]): vscode.SignatureHelp | null {
        if (commands.length >= 3) { return null; }
        const signatureHelp = new vscode.SignatureHelp();
        // 匹配 function 命令
        const signature = new vscode.SignatureInformation(
            '<命名空间:路径>',
        );
        signature.parameters = [
            new vscode.ParameterInformation('命名空间', '如minecraft、my_mod'),
            new vscode.ParameterInformation('路径', '如tick、tools/build')
        ];
        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = commands[1]?.split(':').length - 1;



        return signatureHelp;
    }

    private provideScoreboardSignatureHelp(commands: string[]): vscode.SignatureHelp {
        const signatureHelp = new vscode.SignatureHelp();
        if (commands[1] === 'players') {
            if (['add', 'set', 'reset', 'remove'].includes(commands[2])) {
                const signature = new vscode.SignatureInformation(
                    '<目标> <记分板> <数值>',
                );
                // 参数说明
                signature.parameters = [
                    new vscode.ParameterInformation('<目标>'),
                    new vscode.ParameterInformation('<记分板>'),
                    new vscode.ParameterInformation('<数值>')
                ];
                signatureHelp.signatures = [signature];
                signatureHelp.activeSignature = 0;

                // 计算当前输入到第几个参数
                const paramIndex = commands.length - 4;
                signatureHelp.activeParameter = paramIndex;
            }
            else if (commands[2] === 'test') {
                const signature = new vscode.SignatureInformation(
                    '<目标> <记分板> <最小值> <最大值>',
                );
                // 参数说明
                signature.parameters = [
                    new vscode.ParameterInformation('<目标>'),
                    new vscode.ParameterInformation('<记分板>'),
                    new vscode.ParameterInformation('<最小值>'),
                    new vscode.ParameterInformation('<最大值>')

                ];
                signatureHelp.signatures = [signature];
                signatureHelp.activeSignature = 0;
                signatureHelp.activeParameter = commands.length - 4;
                return signatureHelp;
            }

        }
        else if (commands[1] === 'teams') {

        }

        return signatureHelp;
    }


}

// 注册Signature Help
export function registerSignatureHelp() {
    return vscode.languages.registerSignatureHelpProvider(
        { language: 'mcfunction', scheme: 'file' },
        new McFunctionSignatureHelpProvider(),
        ...[' ', '$', '(', ',']
    );
}