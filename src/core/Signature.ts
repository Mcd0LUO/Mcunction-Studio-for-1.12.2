import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';
import { DataLoader } from './DataLoader';
import { MacroCompletionProvider } from '../completionProvider/macro/MacroCompletionProvider';
import { MacroManager } from '../macro/MacroManager';
import { MacroApply } from '../macro/MacroaApply';
import { MacroDefinition } from '../macro/MacroAst';

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
    /**
     * 提供宏签名帮助（支持参数数量不同的宏重载）
     * 核心逻辑：
     * 1. 解析宏调用文本，获取命名空间/宏名/参数文本
     * 2. 获取该宏的所有重载版本（按参数数量区分）
     * 3. 为每个重载版本创建独立的签名信息
     * 4. 根据输入参数数量，自动激活匹配的重载签名和当前参数索引
     * @param text 宏调用文本（如 $foo.bar(a,b)、$foo.bar(、$foo.bar）
     * @returns 签名帮助对象 | null
     */
    provideMacroSignatureHelp(text: string): vscode.ProviderResult<vscode.SignatureHelp> {
        // 1. 边界处理：空文本直接返回null
        if (!text || typeof text !== 'string') {
            return null;
        }

        // 2. 解析宏调用文本（使用增强鲁棒性的parseMacroCall）
        const { namespace, macroName, paramText } = MacroApply.getInstance().parseMacroCall(text);
        // 无有效宏名/命名空间，返回null
        if (!macroName) {
            return null;
        }

        // 3. 获取该宏的所有重载版本（按参数数量区分）
        const macroOverloads = MacroManager.getInstance().getMacroByNameInNamespace(namespace, macroName);
        if (!macroOverloads || macroOverloads.length === 0) {
            return null;
        }

        // 4. 构建签名帮助核心对象
        const signatureHelp = new vscode.SignatureHelp();
        signatureHelp.activeSignature = 0; // 默认激活第一个签名
        signatureHelp.activeParameter = 0; // 默认激活第一个参数

        // 5. 为每个重载版本创建独立的签名信息
        const signatureItems = this.buildSignatureItems(macroOverloads);
        if (signatureItems.length === 0) {
            return null;
        }
        // 获取文档注释
        signatureHelp.signatures = signatureItems;

        // 6. 精准计算激活的签名和参数索引
        const { activeSignature, activeParameter } = this.calculateActiveItems(paramText, signatureItems);
        signatureHelp.activeSignature = activeSignature;
        signatureHelp.activeParameter = activeParameter;

        return signatureHelp;
    }

    /**
     * 为每个宏重载版本构建独立的签名信息
     * @param macroOverloads 宏重载列表（不同参数数量）
     * @returns 签名信息数组
     */
    private buildSignatureItems(macroOverloads: any[]): vscode.SignatureInformation[] {
        const signatureItems: vscode.SignatureInformation[] = [];

        for (const macro of macroOverloads) {
            // 构建签名标题（如 "set_num(scoreboard: string, num: number)"）
            const paramLabels = macro.params.map((p: { name: any; paramType: any; })  => `${p.name}: ${p.paramType || 'any'}`).join(', ');
            const signatureLabel = `${macro.name}(${paramLabels})`;

            // 创建签名信息（支持添加文档说明）
            const signature = new vscode.SignatureInformation(
                signatureLabel,
            );

            // 为每个参数添加详细信息
            for (const param of macro.params) {
                signature.parameters.push(new vscode.ParameterInformation(
                    `${param.name}: ${param.paramType || 'any'}`,
                    `${MacroManager.getInstance().getMacroDocComment(macro.uid) || '无'}`
                ));
            }

            signatureItems.push(signature);
        }

        // 按参数数量排序（便于匹配）
        return signatureItems.sort((a, b) => a.parameters.length - b.parameters.length);
    }

    /**
     * 计算激活的签名（匹配参数数量）和激活的参数索引
     * @param paramText 解析后的参数文本（如 "a,b"、""、"a,"）
     * @param signatureItems 签名信息数组
     * @returns {activeSignature: 激活的签名索引, activeParameter: 激活的参数索引}
     */
    private calculateActiveItems(
        paramText: string,
        signatureItems: vscode.SignatureInformation[]
    ): { activeSignature: number; activeParameter: number } {
        // 清洗参数文本：拆分括号外的逗号，处理空参数、末尾逗号
        const inputParams = paramText
            .split(/,(?![^()]*\))/) // 仅拆分括号外的逗号（兼容嵌套参数）
            .map(p => p.trim())
            .filter(p => p !== '' || paramText.endsWith(',')); // 保留末尾逗号对应的空参数

        // 计算输入的参数数量（关键：末尾逗号算"下一个参数"）
        const inputParamCount = paramText.endsWith(',')
            ? inputParams.length // 如 "a," → 数量2（准备输入第二个参数）
            : inputParams.length; // 如 "a,b" → 数量2

        // 1. 匹配最接近的重载签名（优先参数数量≥输入数量的第一个）
        let activeSignature = 0;
        for (let i = 0; i < signatureItems.length; i++) {
            const paramCount = signatureItems[i].parameters.length;
            // 找到第一个参数数量≥输入数量的重载，或参数数量完全匹配的
            if (paramCount >= inputParamCount || paramCount === inputParams.length) {
                activeSignature = i;
                break;
            }
        }

        // 2. 计算激活的参数索引（避免越界）
        const activeSignatureParams = signatureItems[activeSignature].parameters;
        let activeParameter = inputParams.length - 1;
        // 边界处理：参数索引不能为负，也不能超过当前签名的参数数量
        activeParameter = Math.max(0, Math.min(activeParameter, activeSignatureParams.length - 1));

        return { activeSignature, activeParameter };
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
        ...[' ', '$', '(', ',', '.']
    );
}