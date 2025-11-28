import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { DataLoader } from './DataLoader';

/**
 * 命令类型枚举（用于区分不同跳转目标）
 */
enum CommandType {
    Function = 'function',
    Advancement = 'advancement',
    Scoreboard = 'scoreboard',
    ScoreboardFakePlayer = 'scoreboard_fake_player'
}

/**
 * 解析出的命令信息
 */
interface CommandInfo {
    type: CommandType;
    resourcePath: string; // 资源路径（如minecraft:tick、minecraft:story/root）
    range: vscode.Range | null; // 匹配的文本范围
}

export class McFunctionDefinitionProvider implements vscode.DefinitionProvider {
    /**
     * 核心：提供定义跳转
     */
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DefinitionLink[]> {
        const lineText = document.lineAt(position.line).text;

        // 1. 解析命令类型和资源路径
        const commandInfo = this.parseCommandInfo(lineText, position);
        if (!commandInfo || !commandInfo.resourcePath || !commandInfo.range) {
            return null;
        }

        // 2. 根据命令类型构建目标URI
        const targetInfo = this.getTargetInfo(commandInfo.type, commandInfo.resourcePath);
        if (!targetInfo) {
            return null;
        }

        // 3. 返回跳转链接
        return [{
            originSelectionRange: commandInfo.range,
            targetUri: targetInfo.uri,
            targetRange: targetInfo.range
        }];
    }

    /**
     * 解析行文本，识别命令类型和资源路径
     */
    private parseCommandInfo(lineText: string, position: vscode.Position): CommandInfo | null {
        // 匹配 function 命令
        const functionMatch = this.matchFunctionCommand(lineText, position);
        if (functionMatch) {
            return functionMatch;
        }

        // 匹配 advancement 命令
        const advancementMatch = this.matchAdvancementCommand(lineText, position);
        if (advancementMatch) {
            return advancementMatch;
        }
        const scoreboardMatch = this.matchScoreboardCommand(lineText, position);
        if (scoreboardMatch) {
            return scoreboardMatch;
        }

        return null;
    }
    /**
     * 匹配 scoreboard 命令（适配任意字符伪玩家 + 记分板精准匹配）
     */
    private matchScoreboardCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 1. 匹配 objectives 子命令
        const objectivesRegex = /scoreboard\s+objectives\s+(add|remove|modify)\s+([^\s]+)/u;
        const objectivesMatch = lineText.match(objectivesRegex);
        if (objectivesMatch) {
            const scoreboardName = objectivesMatch[2];
            const range = this.getWordRange(lineText, position, scoreboardName);
            return range ? { type: CommandType.Scoreboard, resourcePath: scoreboardName, range } : null;
        }

        // 2. 匹配 players 普通子命令
        const playersNormalRegex = /scoreboard\s+players\s+(set|add|remove|reset)\s+([^\s]+)\s+([^\s]+)/u;
        const playersNormalMatch = lineText.match(playersNormalRegex);
        if (playersNormalMatch) {
            const scoreboardName = playersNormalMatch[3];
            console.log(scoreboardName);
            const range = this.getWordRange(lineText, position, scoreboardName);
            return range ? { type: CommandType.Scoreboard, resourcePath: scoreboardName, range } : null;
        }

        // 3. 匹配 players operation 子命令（支持任意字符伪玩家）
        // [^\s]+ 匹配任意非空格字符（包括#、.、中文等伪玩家）
        const operationRegex = /scoreboard\s+players\s+operation\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/u;
        const operationMatch = lineText.match(operationRegex);
        if (operationMatch) {
            const [_, fakePlayer1, scoreboard1, operator, fakePlayer2, scoreboard2] = operationMatch;

            // 优先匹配记分板（arg3/arg1）
            const scoreboardTargets = [scoreboard1, scoreboard2];
            for (const board of scoreboardTargets) {
                const range = this.getWordRange(lineText, position, board);
                if (range) {
                    return { type: CommandType.Scoreboard, resourcePath: board, range };
                }
            }

            // 可选：匹配伪玩家（任意字符）
            const fakePlayerTargets = [fakePlayer1, fakePlayer2];
            for (const player of fakePlayerTargets) {
                const range = this.getWordRange(lineText, position, player);
                if (range) {
                    return { type: CommandType.ScoreboardFakePlayer, resourcePath: player, range };
                }
            }
        }

        return null;
    }

    /**
     * 匹配 function 命令：function <命名空间:路径>
     */
    private matchFunctionCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        const regex = /function\s+([^\s]*[\/:][^\s]*)/u;
        const match = lineText.match(regex);
        if (!match) {return null;}

        const resourcePath = match[1];
        const range = this.getWordRange(lineText, position, resourcePath);
        return {
            type: CommandType.Function,
            resourcePath: resourcePath,
            range: range
        };
    }

    /**
     * 匹配 advancement 命令：advancement (grant|revoke) <目标> (only|from|until) <命名空间:路径>
     */
    private matchAdvancementCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 匹配 advancement 命令的资源路径部分（最后一个参数）
        const regex = /advancement\s+(grant|revoke)\s+[^\s]+\s+(only|from|until|through)\s+([^\s]*[\/:][^\s]*)/u;
        const match = lineText.match(regex);
        if (!match) {return null;}

        const resourcePath = match[3];
        const range = this.getWordRange(lineText, position, resourcePath);
        return {
            type: CommandType.Advancement,
            resourcePath: resourcePath,
            range: range
        };
    }

    /**
     * 获取资源路径对应的文本范围
     */
    private getWordRange(lineText: string, position: vscode.Position, targetText: string): vscode.Range | null {
        const startIdx = lineText.indexOf(targetText);
        if (startIdx === -1) {return null;}

        const endIdx = startIdx + targetText.length;
        // 检查光标是否在目标文本范围内
        if (position.character < startIdx || position.character > endIdx) {
            return null;
        }

        return new vscode.Range(
            position.line, startIdx,
            position.line, endIdx
        );
    }

    /**
     * 根据命令类型构建目标URI
     */
    private getTargetInfo(type: CommandType, resourcePath: string): {uri: vscode.Uri, range: vscode.Range} | null {
        switch (type) {
            case CommandType.Function:
                const funcUri = MinecraftUtils.buildFunctionUri(resourcePath);
                if (funcUri) {
                    return { uri: funcUri, range: new vscode.Range(0, 0, 0, 0) };
                }
                return null;
            case CommandType.Advancement:
                const advUri = MinecraftUtils.buildAdvancementUri(resourcePath);
                if (advUri) {
                    return { uri: advUri, range: new vscode.Range(0, 0, 0, 0) };
                }
                return null;
            case CommandType.Scoreboard:
                const scoreboardData = DataLoader.getInstance().getScoreboardsData().get(resourcePath);
                if (scoreboardData) {
                    // 获取第一个定义位置的 URI 和行号
                    const [uri, lineNumber] = scoreboardData.def;
                    return { uri: uri, range: new vscode.Range(lineNumber, 0, lineNumber, 0) };
                }
                return null;
            default:
                return null;
        }
    }
}

// 注册方法（保持不变）
export function registerFunctionDefinitionProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { language: 'mcfunction' },
            new McFunctionDefinitionProvider()
        )
    );
}