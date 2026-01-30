import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { CommandUtils } from '../utils/CommandUtils';
import { MacroApply } from './MacroaApply';
import { MacroDefinition } from './MacroAst';


export enum TextType {
    MACRO = 'macro',
}

/**
 * 解析出的命令信息
 */
export interface CommandInfo {
    type: TextType;
    resource: string | MacroDefinition; // 资源名
    range: vscode.Range | null; // 匹配的文本范围
}

export class McMacroDefinitionProvider implements vscode.DefinitionProvider {

    public static instance: McMacroDefinitionProvider = new McMacroDefinitionProvider();
    /**
     * 核心：提供定义跳转
     */
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DefinitionLink[]> {
        const lineText = document.lineAt(position.line).text;

        // 解析命令信息
        const commandInfo = this.parseCommandInfo(lineText, position, document);
        if (commandInfo) {
            return this.buildDefinitionLink(commandInfo);
        }

        return null;
    }

    /**
     * 构建跳转链接
     */
    private buildDefinitionLink(commandInfo: CommandInfo): vscode.DefinitionLink[] | null {
        if (!commandInfo.resource || !commandInfo.range) {
            return null;
        }

        const targetInfo = this.getTargetInfo(commandInfo.type, commandInfo.resource);
        if (!targetInfo) {
            return null;
        }

        return [{
            originSelectionRange: commandInfo.range,
            targetUri: targetInfo.uri,
            targetRange: targetInfo.range
        }];
    }

    /**
     * 解析命令信息
     */
    public parseCommandInfo(lineText: string, position: vscode.Position, doc: vscode.TextDocument): CommandInfo | null {
        const args = MacroApply.getInstance().parseMacroCall(lineText);
        const macro = MacroApply.getInstance().findMatchedMacro(args.namespace, args.macroName, args.paramText);
        if (!macro) {
            return null;
        }
        const nameid = `$${macro.namespace}.${macro.name}`;
        return {
            resource: macro,
            type: TextType.MACRO,
            range: this.getWordRange(lineText, position , nameid)
        };
        

    }

    /**
     * 获取目标文本在当前行的范围（辅助方法）
     */
    private getWordRange(lineText: string, position: vscode.Position, targetText: string, ): vscode.Range | null {
        const startIdx = lineText.indexOf(targetText, position.character - targetText.length);
        if (startIdx === -1) {return null;}

        const endIdx = startIdx + targetText.length;
        if (position.character < startIdx || position.character > endIdx) {
            return null;
        }

        return new vscode.Range(position.line, startIdx, position.line, endIdx);
    }

    

    /**
     * 根据命令类型构建目标URI
     */
    private getTargetInfo(type: TextType, resource: string | MacroDefinition): { uri: vscode.Uri, range: vscode.Range } | null {
        switch (type) {
            case TextType.MACRO:
                resource = resource as MacroDefinition;
                const funcUri = resource.uri;
                if (funcUri && resource.position) {
                    // 将自定义的position对象转换为vscode.Range对象
                    const startPosition = new vscode.Position(
                        resource.position.start.line - 1, // 注意：这里需要调整为从0开始的索引
                        resource.position.start.column - 1
                    );
                    const endPosition = new vscode.Position(
                        resource.position.end.line - 1,
                        resource.position.end.column - 1
                    );
                    const range = new vscode.Range(startPosition, endPosition);
                    return { uri: funcUri, range: range };
                }
                return null;

            default:
                return null;
        }
    }
}

export function registerMcMacroDefinitionProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            [{ language: 'mcfunction' }],
            McMacroDefinitionProvider.instance
        )
    );
}