import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import { BaseCompletionProvider } from "../Base";
import * as vscode from "vscode";
import { BlockNameMap, EntityNameList, ItemNameMap, MinecraftStats, MinecraftStatsDetail } from "../../utils/EnumLib";

export class ScoreboardCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "scoreboard";
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem(
                    'objectives',
                    '记分项',
                    'objectives'
                ),
                this.createCompletionItem(
                    'players',
                    '玩家',
                    'players'
                ),
                this.createCompletionItem(
                    'teams',
                    '队伍',
                    'teams'
                ),
            ];
        }

        if (commands[1] === "objectives") {
            return this.handleObjectives(document, position, token, context, commands);
        }
        else if (commands[1] === "players") {
            return this.handlePlayers(document, position, token, context, commands);
        }
        else if (commands[1] === "teams") {
            return this.handleTeams(document, position, token, context, commands);
        }
        return [];
    } 
    handleTeams(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        if (commands.length === 3) {
            return [
                this.createCompletionItem(
                    'add',
                    '添加队伍',
                    'add'
                ),
                this.createCompletionItem(
                    'remove',
                    '移除队伍',
                    'remove'
                ),
                this.createCompletionItem(
                    'join',
                    '加入队伍',
                    'join'
                ),
                this.createCompletionItem(
                    'leave',
                    '离开队伍',
                    'leave'
                ),
                this.createCompletionItem(
                    'empty',
                    '清空队伍',
                    'empty'
                ),
                this.createCompletionItem(
                    'option',
                    '设置队伍选项',
                    'option'
                )
                
            ];
        }
        return [];
    }

    private handleObjectives(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] {
        if (commands.length === 3) {
            return [
                this.createCompletionItem(
                    'add',
                    '添加记分项',
                    'add'
                ),
                this.createCompletionItem(
                    'remove',
                    '移除记分项',
                    'remove'
                ),
                this.createCompletionItem(
                    'list',
                    '列出所有记分项',
                    'list'
                ),
                this.createCompletionItem(
                    'setdisplay',
                    '设置显示目标',
                    'setdisplay'
                ),
            ];
        }
        else if (commands.length ===4 ) {
            if (commands[2] === "remove") {
                return this.provideScoreboardCompletions();
            }
            else if (commands[2] === "add") {
                return [
                    this.createCompletionItem(
                        commands[3],
                        '',
                        commands[3],
                        false,
                        vscode.CompletionItemKind.Field
                    )
                ];
            }
            else if (commands[2] === "setdisplay") {
                return [
                    this.createCompletionItem(
                        'list',
                        '列表',
                        'list'
                    ),
                    this.createCompletionItem(
                        'sidebar',
                        '侧边栏',
                        'sidebar'
                    ),
                    this.createCompletionItem(
                        'belowName',
                        '下方名称',
                        'belowName'
                    )
                ];
            }
        }
        else if (commands.length === 5 && commands[2] === "add") {
            if (commands[2] === "add") {
                if (commands[4].startsWith("stat.")) {
                    if (commands[4].startsWith("stat.killEntity.")) {
                        return EntityNameList.all.map(item => {
                            return this.createCompletionItem(
                                `stat.killEntity.${item.name}`,
                                item.desc,
                                item.name,
                                false,
                                vscode.CompletionItemKind.Field
                            );
                        });
                    }
                    else if (commands[4].startsWith("stat.entityKilledBy.")) {
                        return EntityNameList.all.map(item => {
                            return this.createCompletionItem(
                                `stat.entityKilledBy.${item.name}`,
                                item.desc,
                                item.name,
                                false,
                                vscode.CompletionItemKind.Field
                            );
                        });
                    }
                    
                    else if (commands[4].startsWith("stat.useItem.minecraft.")) {
                        return this.provideBlockCompletions();
                    }

                    else if (commands[4].startsWith("stat.mineBlock.minecraft.")) {
                        const completionItems: vscode.CompletionItem[] = [];
                        for (const [block, desc] of Object.entries(BlockNameMap.all)) {

                            completionItems.push(this.createCompletionItem(`stat.mineBlock.minecraft.${block}`, desc, block, true, vscode.CompletionItemKind.Class));
                        }
                        return completionItems;
                    }

                    // 正常
                    return MinecraftStatsDetail.all.map(item => {
                        return this.createCompletionItem(
                            item.name,
                            item.desc,
                            item.name.slice(5),
                            false,
                            vscode.CompletionItemKind.Field
                        );
                    });
                }
                return MinecraftStats.all.map(item => {
                    return this.createCompletionItem(
                        item.name,
                        item.desc,
                        item.name,
                        false,
                        vscode.CompletionItemKind.Field
                    );
                });
            }
        }

        else if (commands.length === 5 && commands[2] === "setdisplay") {
            return this.provideScoreboardCompletions();
        }

        return [];

    }

    private handlePlayers(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] {
        if (commands.length === 3) { 
            return [
                this.createCompletionItem(
                    'add',
                    '添加记分项',
                    'add',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.createCompletionItem(
                    'remove',
                    '移除记分项',
                    'remove',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.createCompletionItem(
                    'reset',
                    '重置玩家指定记分项',
                    'reset',
                    undefined,
                    vscode.CompletionItemKind.Keyword

                ),
                this.createCompletionItem(
                    'operation',
                    '执行记分项运算',
                    'operation',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.createCompletionItem(
                    'set',
                    '设置玩记分项的值',
                    'set',
                ),
                this.createCompletionItem(
                    'tag',
                    '添加标签',
                    'tag',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
            ];
        }
        if (commands.length === 4 && ["add","remove","reset","operation","set","tag"].includes(commands[2])) {
            return this.provideSelectorCompletions(commands[3]);
        }
        if (commands.length === 5 && ["add","remove","reset","operation","set"].includes(commands[2])) {
            return this.provideScoreboardCompletions();
        }
        // scoreboard players tag @s add xxx
        if ("tag" === commands[2]) {
            if (commands.length === 5) {
                return [
                    this.createCompletionItem(
                        'add',
                        '添加标签',
                        'add',
                        undefined,
                        vscode.CompletionItemKind.Keyword
                    ),
                    this.createCompletionItem(
                        'remove',
                        '移除标签',
                        'remove',
                        undefined,
                        vscode.CompletionItemKind.Keyword
                    ),
                ];
            }
            if (commands.length === 6) {
                return this.provideTagCompletions(commands[5]);
            }
            if (commands.length === 7) {
                return this.provideItemNbtCompletions();
            }

        }

        if ("operation" === commands[2]) {
            // scoreboard players operation @s xxx = @s xxx
            if (commands.length === 6) {
                return [
                    this.createCompletionItem(
                        '+=',
                        '加法运算',
                        '+=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '-=',
                        '减法运算',
                        '-=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '*=',
                        '乘法运算',
                        '*=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '/=',
                        '除法运算',
                        '/=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '%=',
                        '取余运算',
                        '%=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '>',
                        '使左侧的值大于右侧的值',
                        '>',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.createCompletionItem(
                        '<',
                        '使左侧的值小于右侧的值',
                        '<',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                ];

            }
            if (commands.length === 7) {
                return this.provideSelectorCompletions(commands[6]);
            }
            if (commands.length === 8) {
                return this.provideScoreboardCompletions();
            }
        } 


        
        
        
        return [];
        }
    }