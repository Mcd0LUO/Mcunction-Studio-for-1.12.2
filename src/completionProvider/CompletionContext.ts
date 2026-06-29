import * as vscode from 'vscode';
import { DataLoader } from '../core/DataLoader';
import { BlockNameMap, EntityNameList, ItemNameMap } from '../utils/EnumLib';
import { MinecraftUtils } from '../utils/MinecraftUtils';

// ============================================================
// 类型
// ============================================================

export type CommandHandler = (
    commands: string[],
    document: vscode.TextDocument,
    position: vscode.Position,
    lineText: string
) => vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

// ============================================================
// 常量
// ============================================================

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

// ============================================================
// CompletionContext — 补全上下文（替代 BaseCompletionProvider）
// ============================================================

export class CompletionContext {
    private handlers = new Map<string, CommandHandler>();
    private loader: DataLoader;

    private fastCommands: vscode.CompletionItem[] = [
        { label: 'tag', detail: 'scoreboard players tag', insertText: 'scoreboard players tag', kind: vscode.CompletionItemKind.Snippet }
    ];

    constructor(loader: DataLoader) {
        this.loader = loader;
    }

    // ================================================================
    // 注册
    // ================================================================

    /** 注册一个命令的补全处理器 */
    on(command: string, handler: CommandHandler): void {
        this.handlers.set(command, handler);
    }

    /** 检查是否有指定命令的处理器 */
    hasHandler(command: string): boolean {
        return this.handlers.has(command);
    }

    /** 分发到指定命令的处理器 */
    dispatch(command: string, commands: string[], document: vscode.TextDocument, position: vscode.Position, lineText: string): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        const handler = this.handlers.get(command);
        return handler ? handler(commands, document, position, lineText) : [];
    }

    /** 根命令补全（所有已注册命令） */
    rootCompletions(): vscode.CompletionItem[] {
        const result = Array.from(this.handlers.keys()).map(cmd => this.item(cmd, '', cmd));
        result.push(...this.fastCommands);
        return result;
    }

    // ================================================================
    // 工厂方法
    // ================================================================

    item(
        label: string,
        desc: string,
        insertText: string | vscode.SnippetString,
        triggerNext: boolean = true,
        kind: vscode.CompletionItemKind = vscode.CompletionItemKind.Keyword,
        range?: vscode.Range
    ): vscode.CompletionItem {
        const ci = new vscode.CompletionItem(label, kind);
        ci.detail = desc;
        ci.insertText = insertText instanceof vscode.SnippetString
            ? insertText
            : new vscode.SnippetString(insertText);
        if (range) { ci.range = range; }
        if (triggerNext) {
            ci.command = { command: 'editor.action.triggerSuggest', title: '触发下一级补全' };
        }
        return ci;
    }

    // ================================================================
    // 工具
    // ================================================================

    wordRange(document: vscode.TextDocument, position: vscode.Position, inputLength: number): vscode.Range | undefined {
        const adjusted = position.with(position.line, position.character - inputLength);
        return document.getWordRangeAtPosition(adjusted);
    }

    // ================================================================
    // 数据访问 — 动态（来自 DataLoader）
    // ================================================================

    functions(range?: vscode.Range): vscode.CompletionItem[] {
        const arr = this.loader.getFunctionResNames().map(name =>
            this.item(name, '', name, true, vscode.CompletionItemKind.Function, range)
        );
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const thisName = MinecraftUtils.buildFunctionCall(editor.document.uri);
            if (thisName) {
                const ci = this.item('THIS', '当前函数', thisName, false, vscode.CompletionItemKind.Snippet, range);
                ci.sortText = '0';
                arr.push(ci);
            }
        }
        return arr;
    }

    teams(range?: vscode.Range): vscode.CompletionItem[] {
        return Array.from(this.loader.getTeamsData().keys()).map(name =>
            this.item(name, '', name, false, vscode.CompletionItemKind.Field, range)
        );
    }

    tags(range?: vscode.Range, quoted?: boolean): vscode.CompletionItem[] {
        return Array.from(this.loader.getTagsData().keys()).map(name =>
            this.item(name, '', quoted ? `"${name}"` : name, false, vscode.CompletionItemKind.Constant, range)
        );
    }

    scoreboards(range?: vscode.Range, type?: string): vscode.CompletionItem[] {
        const data = this.loader.getScoreboardsData();
        const entries = type
            ? Array.from(data.entries()).filter(([, d]) => d?.type === type)
            : Array.from(data.entries());
        return entries.map(([name, d]) =>
            this.item(name, `${d?.type} ${d?.desc}`, name, false, vscode.CompletionItemKind.Field, range)
        );
    }

    fakePlayers(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        for (const name of this.loader.getFakePlayerData().keys()) {
            items.push(this.item(name, '', name, true, vscode.CompletionItemKind.Variable));
        }
        return items;
    }

    /** 选择器补全（含参数） */
    selectors(selector: string): vscode.CompletionItem[] {
        if (!['@a', '@s', '@e', '@r', '@p'].includes(selector) && !selector.includes('[')) {
            const items = this.simpleSelectors();
            items.push(...this.fakePlayers());
            return items;
        }

        if (selector[2] !== '[') { return []; }
        const params = selector.slice(3).split(',');
        const last = params[params.length - 1];
        const lastKey = last.split('=')[0];

        switch (lastKey) {
            case 'type': return this.entityTypes();
            case 'tag': return this.tags();
            case 'team': return this.teams();
            default:
                if (lastKey.startsWith('score_') && !last.endsWith('=') && !lastKey.endsWith('_min')) {
                    return Array.from(this.loader.getScoreboardsData().keys()).map(sb => {
                        const sd = this.loader.getScoreboardsData().get(sb);
                        return this.item(`score_${sb}`, `${sd?.type} ${sd?.desc}`, `score_${sb}`, false, vscode.CompletionItemKind.Field);
                    });
                }
                if (last.endsWith('=')) { return []; }
                return SELECTOR_ARGUMENTS.map(a =>
                    this.item(a.label, a.desc, a.insertText, true, vscode.CompletionItemKind.Property)
                );
        }
    }

    // ================================================================
    // 数据访问 — 静态（来自 EnumLib）
    // ================================================================

    simpleSelectors(): vscode.CompletionItem[] {
        return [
            this.item('@a', '所有玩家', '@a'),
            this.item('@p', '最接近的玩家', '@p'),
            this.item('@r', '随机玩家', '@r'),
            this.item('@s', '当前实体', '@s'),
            this.item('@e', '所有实体', '@e'),
            this.item('*', '所有被记分板追踪的实体', '*'),
        ];
    }

    coordinates(): vscode.CompletionItem[] {
        return [this.item('~', '相对坐标', '~ ', true, vscode.CompletionItemKind.Value)];
    }

    entityTypes(): vscode.CompletionItem[] {
        return EntityNameList.all.map(e =>
            this.item(e.name, e.desc, e.name, false, vscode.CompletionItemKind.TypeParameter)
        );
    }

    items(): vscode.CompletionItem[] {
        return Object.keys(ItemNameMap.all).map(key =>
            this.item(key, ItemNameMap.getDescription(key), key, false, vscode.CompletionItemKind.Struct)
        );
    }

    blocks(): vscode.CompletionItem[] {
        return Object.keys(BlockNameMap.all).map(key =>
            this.item(key, ItemNameMap.getDescription(key), key, false, vscode.CompletionItemKind.Struct)
        );
    }
}
