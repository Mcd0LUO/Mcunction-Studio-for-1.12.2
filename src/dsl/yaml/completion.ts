/**
 * YAML 命令定义文件的补全提供器（不依赖外部 YAML 扩展）
 */
import * as vscode from 'vscode';

const ITEM = vscode.CompletionItemKind.Property;
const ENUM = vscode.CompletionItemKind.Enum;

/** 内置 suggest 名称 */
const SUGGESTS = [
    'selectors', 'scoreboards', 'teams', 'tags', 'functions',
    'coordinates', 'selectorsOrCoords',
    'items', 'blocks', 'entityTypes',
    'effects', 'weatherTypes', 'gameModes', 'difficulties',
    'criteria', 'operations', 'teamOptions',
    'particleNames', 'soundNames', 'gameRules',
    'advancements', 'placeholder', 'none',
];

/** 顶层 key → 缩进级别 */
type Context = 'top' | 'literal' | 'argument' | 'extract';

export class YamlCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const line = document.lineAt(position.line).text;
        const textBefore = line.substring(0, position.character);
        const indent = line.length - line.trimStart().length;

        // 判断上下文：看当前行和上一行以什么 key 开头
        const ctx = this.guessContext(document, position.line, indent);

        if (ctx === 'extract') {
            return [
                ci('pattern:', '提取模式，如 "set <name>"', ITEM),
                ci('type:', '存储类型名', ITEM),
                ci('description:', '可选描述', ITEM),
            ];
        }

        if (ctx === 'literal') {
            return [
                ci('name:', '关键字文本', ITEM),
                ci('description:', '可选描述', ITEM),
                ci('children:', '', ITEM),
            ];
        }

        if (ctx === 'argument') {
            const items = [
                ci('name:', '参数名（如 <target>）', ITEM),
                ci('optional:', 'true', ITEM),
                ci('children:', '', ITEM),
            ];
            // suggest 枚举
            for (const s of SUGGESTS) {
                items.push({
                    label: `suggest: ${s}`,
                    insertText: `suggest: ${s}`,
                    kind: ENUM,
                    sortText: `1_${s}`,
                });
            }
            return items;
        }

        // top-level
        return [
            ci('command:', '命令名（不含 /）', ITEM),
            ci('description:', '命令描述', ITEM),
            ci('extract:', '', ITEM),
            {
                label: 'children:',
                insertText: 'children:\n  - literal:\n      name: ',
                kind: ITEM,
                documentation: '子节点列表',
            },
            {
                label: '- literal:',
                insertText: '- literal:\n      name: ',
                kind: ITEM,
            },
            {
                label: '- argument:',
                insertText: '- argument:\n      name: ',
                kind: ITEM,
            },
            {
                label: '- forward:',
                insertText: '- forward: true',
                kind: ITEM,
            },
        ];
    }

    /** 根据当前行和上一行推断上下文 */
    private guessContext(document: vscode.TextDocument, lineNum: number, indent: number): Context {
        const line = document.lineAt(lineNum).text.trim();

        // 当前行以 - literal: 或 - argument: 开头 → 看具体 key
        if (line.startsWith('- literal:')) { return 'literal'; }
        if (line.startsWith('- argument:')) { return 'argument'; }

        // 上一行如果缩进更深，看上一行属于哪个块
        if (indent >= 2) {
            for (let i = lineNum - 1; i >= 0; i--) {
                const prev = document.lineAt(i).text;
                const prevIndent = prev.length - prev.trimStart().length;
                if (prevIndent < indent) {
                    const trimmed = prev.trim();
                    if (trimmed.includes('literal:')) { return 'literal'; }
                    if (trimmed.includes('argument:')) { return 'argument'; }
                    if (trimmed.includes('extract')) { return 'extract'; }
                    if (trimmed.startsWith('- literal:')) { return 'literal'; }
                    if (trimmed.startsWith('- argument:')) { return 'argument'; }
                    if (trimmed.startsWith('- pattern:')) { return 'extract'; }
                }
            }
        }

        return 'top';
    }
}

function ci(label: string, doc: string, kind: vscode.CompletionItemKind): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, kind);
    if (doc) { item.documentation = doc; }
    return item;
}
