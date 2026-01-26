import * as vscode from 'vscode';
import { CommandRegistry } from '../core/CommandRegistry';
import { CommandUtils } from '../utils/CommandUtils';
import { DataLoader } from '../core/DataLoader';
import { BlockNameMap, EntityNameList, ItemNameMap, SoundNames } from '../utils/EnumLib';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { NbtAst } from '../utils/nbt/NbtAst';
import { NbtAstKeyValueNode, NbtAstLiteralNode } from '../utils/nbt/NbtAstNode';
import { NbtTokenizer, NbtTokenType } from '../utils/nbt/NbtTokenizer';
import { NBTUtils } from '../utils/nbt/NBTUtils';
import { text } from 'stream/consumers';
import { MacroCompletionProvider } from './macro/MacroCompletionProvider';

export const COLORS = [
    "red", "blue", "green", "yellow", "white", "black",
    "gray", "dark_gray", "light_gray", "aqua", "dark_aqua",
    "dark_blue", "dark_green", "dark_purple", "dark_red",
    "gold", "pink", "purple"
];

/**
 * 选择器参数补全数据（如 score、tag、type 等）
 * 包含显示文本、描述和插入文本（带前缀符号）
 */
const SELECTOR_ARGUMENTS = [
    { label: 'score', desc: '筛选指定计分板积分的实体', insertText: 'score_' },
    { label: 'tag', desc: '筛选带有指定标签的实体', insertText: 'tag=' },
    { label: 'r', desc: '筛选指定半径内的实体', insertText: 'r=' },
    { label: 'team', desc: '筛选指定队伍的实体', insertText: 'team=' },
    { label: 'name', desc: '筛选指定名称的实体', insertText: 'name=' },
    { label: 'c', desc: '限制筛选实体的数量（由近到远）', insertText: 'c=' },
    { label: 'x', desc: '筛选指定X坐标的实体', insertText: 'x=' },
    { label: 'y', desc: '筛选指定Y坐标的实体', insertText: 'y=' },
    { label: 'z', desc: '筛选指定Z坐标的实体', insertText: 'z=' },
    { label: 'type', desc: '筛选指定类型的实体', insertText: 'type=' },
    { label: 'rx', desc: '筛选垂直视角小于等于指定值的实体', insertText: 'rx=' },
    { label: 'rxm', desc: '筛选垂直视角大于等于指定值的实体', insertText: 'rxm=' },
    { label: 'ry', desc: '筛选水平视角小于等于指定值的实体', insertText: 'ry=' },
    { label: 'rym', desc: '筛选水平视角大于等于指定值的实体', insertText: 'rym=' },
    { label: 'dx', desc: '筛选X轴范围内的实体', insertText: 'dx=' },
    { label: 'dy', desc: '筛选Y轴范围内的实体', insertText: 'dy=' },
    { label: 'dz', desc: '筛选Z轴范围内的实体', insertText: 'dz=' },
    { label: 'rm', desc: '筛选指定半径外的实体', insertText: 'rm=' },
    { label: 'm', desc: '筛选指定游戏模式的玩家', insertText: 'm=' },
    { label: 'lm', desc: '筛选等级大于等于指定值的玩家', insertText: 'lm=' },
    { label: 'l', desc: '筛选等级小于等于指定值的玩家', insertText: 'l=' },
];



export abstract class BaseCompletionProvider implements vscode.CompletionItemProvider {
    protected global_sufiix: string = '';
    // 命令字段名
    protected abstract commandKeyword: string;

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {

        // 获取光标前片段
        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const trimmedText = textBeforeCursor.trimStart();
        if (trimmedText.length === 0) {
            return this.provideRootCompletions('');
        }
        if (trimmedText.startsWith("#")) {return [];}
        if (trimmedText.startsWith('$')) {
            return MacroCompletionProvider.getInstance().provideCompletionItems(document, position, token, context, lineText);
        }
        // 解析片段
        const full_commands = CommandUtils.extractCommand(trimmedText);
        const { isExecute, isComplete, currentCommands, paramStage } = CommandUtils.findActiveCommand(full_commands);
        // 获取当前命令提供者
        const provider = CommandRegistry.getProvider(currentCommands[0]);
        const result = provider ? await provider.provideCommandCompletions(document, position, token, context, currentCommands, lineText) : this.provideRootCompletions(currentCommands[0]);
        return Array.isArray(result) ? result : await result;
    }


    /**
     * 抽象方法：子类需实现具体命令的补全逻辑
     * @param commands 命令片段数组
     * @param document 当前文档
     * @param position 光标位置
     * @param token 取消令牌
     * @param context 补全上下文
     * @param lineText 当前行文本
     * @returns 补全项数组
     */
    protected abstract provideCommandCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
        commands: string[],
        lineText: string

    ): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    /**
     * 创建补全项的工具方法
     * @param label 显示的文本
     * @param desc 描述信息（补全项下方的小字）
     * @param insertText 插入到文档的文本
     * @param triggerNext 是否自动触发下一级补全（输入后立即显示后续补全）
     * @param kind 补全项的类型（图标，如 Keyword、Enum 等）
     * @param range 
     * @returns 构建好的补全项
     */
    public createCompletionItem(
        label: string,
        desc: string,
        insertText: string | vscode.SnippetString,
        triggerNext: boolean = true,
        kind: vscode.CompletionItemKind = vscode.CompletionItemKind.Keyword,
        range: vscode.Range | undefined = undefined
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, kind);
        item.detail = desc;
        if (range) {
            item.range = range;
        }
        // item.insertText = insertText; // 直接赋值，支持 string 或 SnippetString 类型
        if (insertText instanceof vscode.SnippetString) {
            item.insertText = insertText;
        } else {
            item.insertText = new vscode.SnippetString(insertText);
        }

        // 自动触发下一级补全（提升用户体验，无需手动按 Ctrl+Space）
        if (triggerNext) {

            item.command = {
                command: 'editor.action.triggerSuggest',
                title: '触发下一级补全'
            };
        }

        return item;
    }


    /**
     * 提供根命令补全（如 /scoreboard、/execute、/say 等顶级命令）
     * @param text 已输入的命令前缀（用于筛选补全项）
     * @returns 根命令补全项数组
     */
    private provideRootCompletions(text: string): vscode.CompletionItem[] {
        const prefix = text.trim().toLowerCase();
        return CommandRegistry.getRootCommands()
            .filter(command => prefix === '' || command.toLowerCase().startsWith(prefix))
            .map(command => this.createCompletionItem(
                command,
                "",
                command,
                true // 自动触发下一级补全
            ));
    }


    protected async provideFunctionCompletions(
        range: vscode.Range | undefined = undefined
    ): Promise<vscode.CompletionItem[]> {
        const arr = DataLoader.getInstance().getFunctionResNames().map(resName => this.createCompletionItem(
            resName,
            "",
            resName,
            true,
            vscode.CompletionItemKind.Function,
            range
        ));

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const resName = MinecraftUtils.buildFunctionCall(activeEditor.document.uri);
            if (resName) {
                const item = this.createCompletionItem(
                    "THIS",
                    "当前函数",
                    resName,
                    false,
                    vscode.CompletionItemKind.Snippet,
                    range
                );
                item.sortText = "0";
                arr.push(item);
            }
        }

        return arr;
    }

    protected provideTeamCompletions(range: vscode.Range | undefined = undefined): vscode.CompletionItem[] {
        return Array.from(DataLoader.getInstance().getTeamsData().keys()).map(team => this.createCompletionItem(
            team,
            "",
            team,
            false,
            vscode.CompletionItemKind.Field
        ));
    }

    public provideTagCompletions(range: vscode.Range | undefined = undefined, wrapper: boolean | undefined = false): vscode.CompletionItem[] {
        if (!wrapper) {
            return Array.from(DataLoader.getInstance().getTagsData().keys()).map(tag => this.createCompletionItem(
                tag,
                "",
                tag,
                false,
                vscode.CompletionItemKind.Constant,
                range
            ));
        }
        return Array.from(DataLoader.getInstance().getTagsData().keys()).map(tag => this.createCompletionItem(
            tag,
            "",
            `"${tag}"`,
            false,
            vscode.CompletionItemKind.Constant,
            range
        ));;
    }
    protected provideItemNbtCompletions(): vscode.CompletionItem[] {
        return [];
    }

    protected provideEntityTypeCompletions(): vscode.CompletionItem[] {
        return EntityNameList.all.map(entity => this.createCompletionItem(
            entity.name,
            entity.desc,
            entity.name,
            false,
            vscode.CompletionItemKind.TypeParameter
        ));
    }

    protected provideItemCompletions(): vscode.CompletionItem[] {
        const items = ItemNameMap.all;
        return Object.keys(items).map(key => this.createCompletionItem(
            key,
            ItemNameMap.getDescription(key),
            key,
            false,
            vscode.CompletionItemKind.Struct
        ));
    }

    protected provideBlockCompletions(): vscode.CompletionItem[] {
        return Object.keys(BlockNameMap.all).map(key => this.createCompletionItem(
            key,
            ItemNameMap.getDescription(key),
            key,
            false,
            vscode.CompletionItemKind.Struct
        ));
    }

    protected provideSoundsCompletions(): vscode.CompletionItem[] {
        return SoundNames.all.map(sound => this.createCompletionItem(
            sound.name,
            sound.desc,
            sound.name,
            false,
            vscode.CompletionItemKind.Reference
        ));
    }

    public provideScoreboardCompletions(range: vscode.Range | undefined = undefined, type?: string): vscode.CompletionItem[] {
        const scoreboardData = DataLoader.getInstance().getScoreboardsData();

        if (type) {
            // 按指定类型过滤记分板，同时映射到CompletionItem
            return Array.from(scoreboardData.entries())
                .filter(([scoreboard, data]) => data?.type === type)
                .map(([scoreboard, data]) => {
                    return this.createCompletionItem(
                        scoreboard,
                        `${data?.type} ${data?.desc}`,
                        scoreboard,
                        false,
                        vscode.CompletionItemKind.Field,
                        range
                    );
                });
        } else {
            // 返回所有记分板
            return Array.from(scoreboardData.entries()).map(([scoreboard, data]) => {
                return this.createCompletionItem(
                    scoreboard,
                    `${data?.type} ${data?.desc}`,
                    scoreboard,
                    false,
                    vscode.CompletionItemKind.Field,
                    range
                );
            });
        }
    }

    protected provideSimpleSelectorCompletions(): vscode.CompletionItem[] {
        return [
            this.createCompletionItem(
                "@a",
                "所有玩家",
                "@a",
                true,
            ),
            this.createCompletionItem(
                "@p",
                "最接近的玩家",
                "@p",
                true,
            ),
            this.createCompletionItem(
                "@r",
                "随机玩家 [限制type可以选中实体]",
                "@r",
                true,
            ),
            this.createCompletionItem(
                "@s",
                "当前实体",
                "@s",
                true,
            ),
            this.createCompletionItem(
                "@e",
                "所有实体",
                "@e",
                true,
            ),
            this.createCompletionItem(
                "*",
                "所有被记分板追踪的实体",
                "*",
                true,
            ),

        ];
    }

    /**
     * 提供坐标补全项
     * @returns 坐标补全项数组
     */
    protected provideCoordinateCompletions(): vscode.CompletionItem[] {
        return [
            this.createCompletionItem(
                "~",
                "相对坐标",
                "~ ",
                true,
                vscode.CompletionItemKind.Value
            )
        ];
    }


    protected provideSelectorCompletions(selector: string): vscode.CompletionItem[] {
        // 如果不包含完整的@选择器则运行
        if (!["@a", "@s", "@e", "@r", "@s"].includes(selector) && !selector.includes("[")) {
            const selectorCompletions = this.provideSimpleSelectorCompletions();
            // 添加fake player数据
            const fakePlayers = DataLoader.getInstance().getFakePlayerData().keys();
            for (const fakePlayer of fakePlayers) {
                selectorCompletions.push(
                    this.createCompletionItem(
                        fakePlayer,
                        "",
                        fakePlayer,
                        true,
                        vscode.CompletionItemKind.Variable
                    )
                );
            }
            return selectorCompletions;
        }

        if (selector[2] !== "[") { return []; }
        const params = selector.slice(3).split(",");
        const fullLastSelector = params[params.length - 1];
        const lastSelector = fullLastSelector.split("=")[0];

        switch (lastSelector) {
            case "type":
                return this.provideEntityTypeCompletions();
            case "tag":
                return this.provideTagCompletions();
            case "team":
                return this.provideTeamCompletions();
            default:
                if (lastSelector.startsWith("score_") && !fullLastSelector.endsWith("=") && !lastSelector.endsWith("_min")) {
                    return Array.from(DataLoader.getInstance().getScoreboardsData().keys()).map(scoreboard => {
                        const scoreboardData = DataLoader.getInstance().getScoreboardsData().get(scoreboard);
                        return this.createCompletionItem(
                            `score_${scoreboard}`,
                            `${scoreboardData?.type} ${scoreboardData?.desc}`,
                            `score_${scoreboard}`,
                            false,
                            vscode.CompletionItemKind.Field);
                    });
                }

                if (fullLastSelector.endsWith("=")) {
                    return [];
                }
                return SELECTOR_ARGUMENTS.map(argument => this.createCompletionItem(
                    argument.label,
                    argument.desc,
                    argument.insertText,
                    true,
                    vscode.CompletionItemKind.Property
                ));

        }
    }

    protected provideEntityNbtCompletions(nbt: string): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        const ast = new NbtAst(nbt);
        const tokens = ast.getTokens();
        const lastKeyNode = ast.getLastKeyValue();
        // ----------------Tags______________
        if (!lastKeyNode) {
            return [];
        }
        if (lastKeyNode.key === 'Tags') {
            if (!lastKeyNode.value.children) { return []; }
            const tagsArrNode = lastKeyNode.value.children;
            const last_tag = tagsArrNode.at(-1) as NbtAstLiteralNode;
            if (last_tag.value === '""') {
                return this.provideTagCompletions();
            }
            else if (NbtTokenizer.isTokenInIdentifierRange(tokens, tokens.length - 1, lastKeyNode.start)) {
                return this.provideTagCompletions(undefined, true);
            }
        }
        //




        return NBTUtils.provideEntityNBTCompletions(this.createCompletionItem);
    }




    /**
     * 获取当前输入文本的范围
     * @param document 当前文档
     * @param position 光标位置
     * @param inputLength 输入文本长度
     * @returns 文本范围或undefined
     */
    public getWordRange(
        document: vscode.TextDocument,
        position: vscode.Position,
        inputLength: number
    ): vscode.Range | undefined {
        const adjustedPosition = position.with(position.line, position.character - inputLength);
        return document.getWordRangeAtPosition(adjustedPosition);
    }




}