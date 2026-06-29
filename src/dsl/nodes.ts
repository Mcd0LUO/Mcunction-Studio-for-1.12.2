import * as vscode from 'vscode';

// ================================================================
// 命令树节点类型 — 仿 Minecraft Brigadier
// ================================================================

/** 补全上下文 — 传递给 suggest 函数的数据源 */
export interface SuggestContext {
    /** 根据名称获取 DataLoader 中的动态数据 */
    loader: import('../core/DataLoader').DataLoader;
    /** 补全上下文（提供 selectors/scoreboards/teams/tags 等数据查询） */
    cc: import('../completionProvider/CompletionContext').CompletionContext;
    /** 创建单个 CompletionItem 的工厂 */
    item(label: string, desc: string, insert: string | vscode.SnippetString, triggerNext?: boolean, kind?: vscode.CompletionItemKind): vscode.CompletionItem;
    /** 已解析的命令片段 */
    commands: string[];
    /** 当前行原始文本（NBT/JSON 需要） */
    lineText: string;
}

/** suggest 函数签名（支持同步和异步） */
export type SuggestionProvider = (ctx: SuggestContext) => vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

/** 节点类型判别 */
export type NodeKind = 'root' | 'literal' | 'argument' | 'forward';

/** 命令树节点基类 */
export abstract class CommandNode {
    public readonly kind: NodeKind;
    public readonly children: CommandNode[] = [];
    public description: string = '';
    /** 该节点是否可选（argument 节点用） */
    public optional: boolean = false;

    constructor(kind: NodeKind) {
        this.kind = kind;
    }

    /** 添加子节点，返回 this 支持链式调用 */
    then(...nodes: CommandNode[]): this {
        this.children.push(...nodes);
        return this;
    }
}

/** 根命令节点 (e.g. "scoreboard", "effect") */
export class RootNode extends CommandNode {
    public readonly commandName: string;

    constructor(name: string) {
        super('root');
        this.commandName = name;
    }
}

/** 字面量节点 (e.g. "add", "remove", "players") */
export class LiteralNode extends CommandNode {
    public readonly literal: string;

    constructor(literal: string) {
        super('literal');
        this.literal = literal;
    }
}

/** 参数节点 (e.g. <target>, <objective>, <value>) */
export class ArgumentNode extends CommandNode {
    public readonly argName: string;
    public readonly suggest: SuggestionProvider | null;

    constructor(
        argName: string,
        suggest?: SuggestionProvider | null,
        optional?: boolean
    ) {
        super('argument');
        this.argName = argName;
        this.suggest = suggest ?? null;
        if (optional) { this.optional = true; }
    }
}

/**
 * 转发节点 — 用于 execute 的 run 子命令等场景。
 * 到达此节点时，补全引擎返回所有根命令列表。
 */
export class ForwardNode extends CommandNode {
    constructor() {
        super('forward');
    }
}
