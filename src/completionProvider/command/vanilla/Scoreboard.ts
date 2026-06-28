import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import { BaseCompletionProvider } from "../../Base";
import * as vscode from "vscode";
import { BlockNameMap, EntityNameList, ItemNameMap, MinecraftStats, MinecraftStatsDetail } from "../../../utils/EnumLib";

export class ScoreboardCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.ctx.item(
                    'objectives',
                    '记分项',
                    'objectives'
                ),
                this.ctx.item(
                    'players',
                    '玩家',
                    'players'
                ),
                this.ctx.item(
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
                this.ctx.item(
                    'add',
                    '添加队伍',
                    'add'
                ),
                this.ctx.item(
                    'remove',
                    '移除队伍',
                    'remove'
                ),
                this.ctx.item(
                    'join',
                    '加入队伍',
                    'join'
                ),
                this.ctx.item(
                    'leave',
                    '离开队伍',
                    'leave'
                ),
                this.ctx.item(
                    'empty',
                    '清空队伍',
                    'empty'
                ),
                this.ctx.item(
                    'option',
                    '设置队伍选项',
                    'option'
                )

            ];
        }
        if (commands.length === 4) {
            return this.ctx.teams();
        }
        if (commands.length === 5 && commands[2] === "option") {
            return [
                this.ctx.item(
                    'color',
                    '设置队伍颜色',
                    'color'
                ),
                this.ctx.item(
                    'friendlyFire',
                    '设置队伍友火',
                    'friendlyFire'
                ),
                this.ctx.item(
                    'nametagVisibility',
                    '设置队伍名称可见性',
                    'nametagVisibility'
                ),
                this.ctx.item(
                    'deathMessageVisibility',
                    '设置队伍死亡信息可见性',
                    'deathMessageVisibility'
                ),
                this.ctx.item(
                    'collisionRule',
                    '设置队伍碰撞规则',
                    'collisionRule'
                ),
                this.ctx.item(
                    'seeFriendlyInvisibles',
                    '设置队伍是否可见',
                    'seeFriendlyInvisibles'
                )

            ];
        }
        if (commands.length === 6) {
            if (commands[4] === "collisionRule") {
                return [
                    this.ctx.item(
                        'never',
                        '从不碰撞',
                        'never'
                    ),
                    this.ctx.item(
                        'pushOtherTeams',
                        '碰撞其它队伍',
                        'pushOtherTeams'
                    ),
                    this.ctx.item(
                        'pushOwnTeam',
                        '碰撞自身队伍',
                        'pushOwnTeam'
                    ),
                    this.ctx.item(
                        'always',
                        '总是碰撞',
                        'always'
                    )
                ];
            }
            if (commands[4] === "nametagVisibility" || commands[4] === "deathMessageVisibility") {
                return [
                    this.ctx.item(
                        'always',
                        '总是可见',
                        'always'
                    ),
                    this.ctx.item(
                        'never',
                        '从不可见',
                        'never'
                    ),
                    this.ctx.item(
                        'hideForOtherTeams',
                        '隐藏其它队伍',
                        'hideForOtherTeams'
                    ),
                    this.ctx.item(
                        'hideForOwnTeam',
                        '隐藏自身队伍',
                        'hideForOwnTeam'
                    )
                ];
            }
            if (commands[4] === "friendlyFire" || commands[4] === "seeFriendlyInvisibles") {
                return [
                    this.ctx.item(
                        'true',
                        '允许友火',
                        'true'
                    ),
                    this.ctx.item(
                        'false',
                        '禁止友火',
                        'false'
                    )
                ];
            }
            if (commands[4] === 'color') {
                return [
                    this.ctx.item(
                        'aqua',
                        '青色',
                        'aqua'
                    ),
                    this.ctx.item(
                        'black',
                        '黑色',
                        'black'
                    ),
                    this.ctx.item(
                        'blue',
                        '蓝色',
                        'blue'
                    ),
                    this.ctx.item(
                        'dark_aqua',
                        '暗青色',
                        'darkAqua'
                    ),
                    this.ctx.item(
                        'dark_blue',
                        '暗蓝色',
                        'darkBlue'
                    ),
                    this.ctx.item(
                        'dark_gray',
                        '暗灰色',
                        'darkGray'
                    ),
                    this.ctx.item(
                        'dark_green',
                        '暗绿色',
                        'darkGreen'
                    ),
                    this.ctx.item(
                        'dark_purple',
                        '暗紫色',
                        'darkPurple'
                    ),
                    this.ctx.item(
                        'dark_red',
                        '暗红色',
                        'darkRed'
                    ),
                    this.ctx.item(
                        'gold',
                        '金色',
                        'gold'
                    ),
                    this.ctx.item(
                        'gray',
                        '灰色',
                        'gray'
                    ),
                    this.ctx.item(
                        'green',
                        '绿色',
                        'green'
                    ),
                    this.ctx.item(
                        'light_purple',
                        '浅紫色',
                        'lightPurple'
                    ),
                    this.ctx.item(
                        'red',
                        '红色',
                        'red'
                    ),
                    this.ctx.item(
                        'white',
                        '白色',
                        'white'
                    ),
                    this.ctx.item(
                        'yellow',
                        '黄色',
                        'yellow'
                    ),
                    this.ctx.item(
                        'reset',
                        '重置颜色',
                        'reset'
                    )



                ];

            }



        }
        return [];
    }

    private handleObjectives(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] {
        if (commands.length === 3) {
            return [
                this.ctx.item(
                    'add',
                    '添加记分项',
                    'add'
                ),
                this.ctx.item(
                    'remove',
                    '移除记分项',
                    'remove'
                ),
                this.ctx.item(
                    'list',
                    '列出所有记分项',
                    'list'
                ),
                this.ctx.item(
                    'setdisplay',
                    '设置显示目标',
                    'setdisplay'
                ),
            ];
        }
        else if (commands.length === 4) {
            if (commands[2] === "remove") {
                return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[3].length));
            }
            else if (commands[2] === "add") {
                return [
                    this.ctx.item(
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
                    this.ctx.item(
                        'list',
                        '列表',
                        'list'
                    ),
                    this.ctx.item(
                        'sidebar',
                        '侧边栏',
                        'sidebar'
                    ),
                    this.ctx.item(
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
                            return this.ctx.item(
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
                            return this.ctx.item(
                                `stat.entityKilledBy.${item.name}`,
                                item.desc,
                                item.name,
                                false,
                                vscode.CompletionItemKind.Field
                            );
                        });
                    }

                    else if (commands[4].startsWith("stat.useItem.minecraft.")) {
                        return this.ctx.blocks();
                    }

                    else if (commands[4].startsWith("stat.mineBlock.minecraft.")) {
                        const completionItems: vscode.CompletionItem[] = [];
                        for (const [block, desc] of Object.entries(BlockNameMap.all)) {

                            completionItems.push(this.ctx.item(`stat.mineBlock.minecraft.${block}`, desc, block, true, vscode.CompletionItemKind.Class));
                        }
                        return completionItems;
                    }

                    // 正常
                    return MinecraftStatsDetail.all.map(item => {
                        return this.ctx.item(
                            item.name,
                            item.desc,
                            item.name.slice(5),
                            false,
                            vscode.CompletionItemKind.Field
                        );
                    });
                }
                return MinecraftStats.all.map(item => {
                    return this.ctx.item(
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
            return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[4].length));
        }

        return [];

    }

    private handlePlayers(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] {
        if (commands.length === 3) {
            return [
                this.ctx.item(
                    'add',
                    '添加记分项',
                    'add',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.ctx.item(
                    'remove',
                    '移除记分项',
                    'remove',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.ctx.item(
                    'reset',
                    '重置玩家指定记分项',
                    'reset',
                    undefined,
                    vscode.CompletionItemKind.Keyword

                ),
                this.ctx.item(
                    'operation',
                    '执行记分项运算',
                    'operation',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.ctx.item(
                    'set',
                    '设置玩记分项的值',
                    'set',
                ),
                this.ctx.item(
                    'tag',
                    '添加标签',
                    'tag',
                    undefined,
                    vscode.CompletionItemKind.Keyword
                ),
                this.ctx.item(
                    'enable',
                    '启用记分板',
                    'enable'
                ),
                this.ctx.item(
                    'list',
                    '列出记分板',
                    'list'
                ),
                this.ctx.item(
                    'test',
                    '检测',
                    'test'
                ),

            ];
        }
        if (commands.length === 4 && ["add", "remove", "reset", "operation", "set", "tag", "enable", "test", "list"].includes(commands[2])) {
            return this.ctx.selectors(commands[3]);
        }
        if (commands.length === 5 && ["add", "remove", "reset", "operation", "set", "enable", "test"].includes(commands[2])) {
            return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[4].length), commands[2] === "enable" ? "trigger" : undefined);
        }
        // scoreboard players tag @s add xxx
        if ("tag" === commands[2]) {
            if (commands.length === 5) {
                return [
                    this.ctx.item(
                        'add',
                        '添加标签',
                        'add',
                        undefined,
                        vscode.CompletionItemKind.Keyword
                    ),
                    this.ctx.item(
                        'remove',
                        '移除标签',
                        'remove',
                        undefined,
                        vscode.CompletionItemKind.Keyword
                    ),
                ];
            }
            if (commands.length === 6) {
                return this.ctx.tags(this.ctx.wordRange(document, position, commands[5].length));
            }
            if (commands.length === 7) {
                return []; // TODO: NBT dataTag 补全
            }

        }

        if ("operation" === commands[2]) {
            // scoreboard players operation @s xxx = @s xxx
            if (commands.length === 6) {
                return [
                    this.ctx.item(
                        '+=',
                        '加法运算',
                        '+=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '-=',
                        '减法运算',
                        '-=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '*=',
                        '乘法运算',
                        '*=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '/=',
                        '除法运算',
                        '/=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '%=',
                        '取余运算',
                        '%=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '>',
                        '使左侧的值大于右侧的值',
                        '>',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '<',
                        '使左侧的值小于右侧的值',
                        '<',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '><',
                        '交换两侧的值',
                        '><',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),
                    this.ctx.item(
                        '=',
                        '赋值',
                        '=',
                        undefined,
                        vscode.CompletionItemKind.Operator
                    ),

                ];

            }
            if (commands.length === 7) {
                return this.ctx.selectors(commands[6]);
            }
            if (commands.length === 8) {
                return this.ctx.scoreboards(this.ctx.wordRange(document, position, commands[7].length));
            }
        }





        return [];
    }
}