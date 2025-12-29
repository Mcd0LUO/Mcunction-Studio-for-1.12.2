import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { DataLoader } from './DataLoader';
import { CommandUtils } from '../utils/CommandUtils';

/**
 * 命令类型枚举（用于区分不同跳转目标）
 */
export enum CommandType {
    Function = 'function',
    Advancement = 'advancement',
    Scoreboard = 'scoreboard',
    ScoreboardFakePlayer = 'scoreboard_fake_player',
    Tag = 'tag',
    Team = 'team'
}

/**
 * 解析出的命令信息
 */
export interface CommandInfo {
    type: CommandType;
    resource: string; // 资源名（如标签名、记分板名等）
    range: vscode.Range | null; // 匹配的文本范围
}

export class McFunctionDefinitionProvider implements vscode.DefinitionProvider {

    public static instance: McFunctionDefinitionProvider = new McFunctionDefinitionProvider();
    /**
     * 核心：提供定义跳转
     */
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DefinitionLink[]> {
        const lineText = document.lineAt(position.line).text;

        // 解析命令信息（包括选择器内和选择器外的情况）
        const commandInfo = this.parseCommandInfo(lineText, position);
        if (commandInfo) {
            return this.buildDefinitionLink(commandInfo);
        }

        return null;
    }

    /**
     * 构建跳转链接（抽离复用）
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
     * 解析命令信息（统一处理选择器内外的情况）
     */
    public parseCommandInfo(lineText: string, position: vscode.Position): CommandInfo | null {
        // 1. 先判断光标是否在选择器内
        const params = CommandUtils.getCursorPredicate(lineText, position.character);
        if (params) {
            // 在选择器内，解析选择器谓词
            return this.parsePredicateType(...params, position.line);
        }

        // 2. 不在选择器内，按优先级顺序匹配各种命令
        const tagCommand = this.matchTagCommand(lineText, position);
        if (tagCommand) {return tagCommand;}

        const scoreboardCommand = this.matchScoreboardCommand(lineText, position);
        if (scoreboardCommand) {return scoreboardCommand;}

        const functionCommand = this.matchFunctionCommand(lineText, position);
        if (functionCommand) {return functionCommand;}

        const advancementCommand = this.matchAdvancementCommand(lineText, position);
        if (advancementCommand) {return advancementCommand;}

        const teamCommand = this.matchTeamCommand(lineText, position);
        if (teamCommand) {return teamCommand;}

        const triggerCommand = this.matchTriggerCommand(lineText, position);
        if (triggerCommand) {return triggerCommand;}

        return null;
    }

    /**
     * 匹配trigger命令
     * 格式示例：trigger myobjective、trigger myobjective add 1
     */
    private matchTriggerCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 匹配 trigger <记分板名> [值] 结构，支持包括中文在内的任意字符
        const triggerRegex = /trigger\s+([^\s]+)/u;
        const match = lineText.match(triggerRegex);
        if (!match) { return null; }

        const objectiveName = match[1];
        const range = this.getWordRange(lineText, position, objectiveName);
        return range ? { type: CommandType.Scoreboard, resource: objectiveName, range } : null;
    }

    /**
     * 匹配scoreboard teams命令中的队伍名
     * 格式示例：scoreboard teams add myteam、scoreboard teams remove myteam、scoreboard teams join myteam @a
     */
    private matchTeamCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 匹配 scoreboard teams <操作> <队伍名> 结构（支持add/remove/empty/leave/option/join）
        const teamRegex = /scoreboard\s+teams\s+(add|remove|empty|leave|option|join)\s+([^\s]+)/u;
        const match = lineText.match(teamRegex);
        if (!match) { return null; }

        const teamName = match[2];
        const range = this.getWordRange(lineText, position, teamName);
        return range ? { type: CommandType.Team, resource: teamName, range } : null;
    }

    // 已合并到parseCommandInfo方法中，此方法已废弃
    /**
     * 匹配选择器内的predicate（仅处理选择器范围内的tag/score/team）
     */
    private matchSelectorPredicate(lineText: string, position: vscode.Position): CommandInfo | null {
        const params = CommandUtils.getCursorPredicate(lineText, position.character);
        if (!params) {return null;}


        return this.parsePredicateType(...params, position.line);
    }

    /**
     * 解析选择器内的单个predicate类型
     */
    private parsePredicateType(
        predicate: string,
        startIdx: number,
        endIdx: number,
        line: number
    ): CommandInfo | null {
        const range = new vscode.Range(line, startIdx, line, endIdx);

        if (predicate.startsWith('tag=')) {
            return { type: CommandType.Tag, resource: predicate.slice(4), range };
        } else if (predicate.startsWith('score_') && (predicate.includes('_min=') || predicate.includes('='))) {
            const scoreboardName = predicate.includes('_min=')
                ? predicate.split('_min=')[0].slice(6)
                : predicate.split('=')[0].slice(6);
            return { type: CommandType.Scoreboard, resource: scoreboardName, range };
        } else if (predicate.startsWith('team=')) {
            return { type: CommandType.Team, resource: predicate.slice(5), range };
        }

        return null;
    }

    /**
     * 匹配scoreboard players tag命令中的tag（选择器外的tag）
     * 格式示例：scoreboard players tag @s add mytag、scoreboard players tag @a remove mytag
     */
    private matchTagCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 匹配 scoreboard players tag <目标> add/remove <标签名> 结构
        const tagRegex = /scoreboard\s+players\s+tag\s+[^\s]+\s+(add|remove)\s+([^\s]+)/u;
        const match = lineText.match(tagRegex);
        if (!match) { return null; }

        const tagName = match[2];
        const range = this.getWordRange(lineText, position, tagName);
        return range ? { type: CommandType.Tag, resource: tagName, range } : null;
    }

    /**
     * 匹配/scoreboard命令（选择器外的scoreboard）
     */
    private matchScoreboardCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        // 1. 匹配 objectives 子命令（定义记分板）
        const objectivesRegex = /scoreboard\s+objectives\s+(add|remove)\s+([^\s]+)/u;
        const objectivesMatch = lineText.match(objectivesRegex);
        if (objectivesMatch) {
            const scoreboardName = objectivesMatch[2];
            console.log(position);
            const range = this.getWordRange(lineText, position, scoreboardName);
            return range ? { type: CommandType.Scoreboard, resource: scoreboardName, range } : null;
        }

        // 2. 匹配 players 子命令（操作记分板数据）
        const playersNormalRegex = /scoreboard\s+players\s+(set|add|remove|reset)\s+([^\s]+)\s+([^\s]+)/u;
        const playersNormalMatch = lineText.match(playersNormalRegex);
        if (playersNormalMatch) {
            const scoreboardName = playersNormalMatch[3];
            const range = this.getWordRange(lineText, position, scoreboardName);
            return range ? { type: CommandType.Scoreboard, resource: scoreboardName, range } : null;
        }

        // 3. 匹配 players operation 子命令
        const operationRegex = /scoreboard\s+players\s+operation\s+([^\s]+)\s+([^\s]+)\s+[^\s]+\s+([^\s]+)\s+([^\s]+)/u;
        const operationMatch = lineText.match(operationRegex);
        if (operationMatch) {
            // 提取两个记分板名称
            const [, , scoreboard1, , scoreboard2] = operationMatch;
            // 检查光标是否在其中一个记分板名称上
            for (const board of [scoreboard1, scoreboard2]) {
                const range = this.getWordRange(lineText, position, board);
                if (range) {
                    return { type: CommandType.Scoreboard, resource: board, range };
                }
            }
        }

        return null;
    }

    /**
     * 匹配/function命令
     */
    private matchFunctionCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        const regex = /function\s+([^\s]*[\/:][^\s]*)/u;
        const match = lineText.match(regex);
        if (!match) {return null;}

        const resourcePath = match[1];
        const range = this.getWordRange(lineText, position, resourcePath);
        return { type: CommandType.Function, resource: resourcePath, range };
    }

    /**
     * 匹配/advancement命令
     */
    private matchAdvancementCommand(lineText: string, position: vscode.Position): CommandInfo | null {
        const regex = /advancement\s+(grant|revoke)\s+[^\s]+\s+(only|from|until|through)\s+([^\s]*[\/:][^\s]*)/u;
        const match = lineText.match(regex);
        if (!match) {return null;}

        const resourcePath = match[3];
        const range = this.getWordRange(lineText, position, resourcePath);
        return { type: CommandType.Advancement, resource: resourcePath, range };
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
    private getTargetInfo(type: CommandType, resourcePath: string): { uri: vscode.Uri, range: vscode.Range } | null {
        switch (type) {
            case CommandType.Function:
                const funcUri = MinecraftUtils.buildFunctionUri(resourcePath);
                return funcUri ? { uri: funcUri, range: new vscode.Range(0, 0, 0, 0) } : null;
            case CommandType.Advancement:
                const advUri = MinecraftUtils.buildAdvancementUri(resourcePath);
                return advUri ? { uri: advUri, range: new vscode.Range(0, 0, 0, 0) } : null;
            case CommandType.Scoreboard:
                return DataLoader.getInstance().getScoreboardDef(resourcePath);
            case CommandType.Team:
                const teamUri = DataLoader.getInstance().getTeamDef(resourcePath);
                return teamUri;
            default:
                return null;
        }
    }
}

export function registerFunctionDefinitionProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { language: 'mcfunction' },
            new McFunctionDefinitionProvider()
        )
    );
}