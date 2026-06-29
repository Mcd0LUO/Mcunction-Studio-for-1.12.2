import * as vscode from 'vscode';

// ================================================================
// 命令树节点类型 — 仿 Minecraft Brigadier
// ================================================================

/** 补全上下文 — 传递给 suggest 函数的数据源 */
export interface SuggestContext {
    loader: import('../core/DataLoader').DataLoader;
    cc: import('../completionProvider/CompletionContext').CompletionContext;
    item(label: string, desc: string, insert: string | vscode.SnippetString, triggerNext?: boolean, kind?: vscode.CompletionItemKind): vscode.CompletionItem;
    commands: string[];
    lineText: string;
}

/** suggest 函数签名（支持同步和异步） */
export type SuggestionProvider = (ctx: SuggestContext) => vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

/** 节点类型判别 */
export type NodeKind = 'root' | 'literal' | 'argument' | 'forward_root' | 'jump';

/** 命令树节点基类 */
export abstract class CommandNode {
    public readonly kind: NodeKind;
    public readonly children: CommandNode[] = [];
    public description: string = '';
    public optional: boolean = false;

    constructor(kind: NodeKind) {
        this.kind = kind;
    }

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
 * 转发到根命令 — execute|foreach|superexe 的 run 子句。
 * 到达此节点或其父节点时，引擎返回所有根命令列表。
 */
export class ForwardRootNode extends CommandNode {
    constructor() {
        super('forward_root');
    }
}

/**
 * 跳转节点 — 用于 superexe 等可重复链式子命令。
 * 到达此节点时，引擎向上跳 `levels` 层后展示该层兄弟节点，
 * 实现 if/unless/facing/positioned 的任意顺序循环。
 * 默认跳 1 层（回到直接父节点）。
 */
export class JumpNode extends CommandNode {
    public readonly levels: number;
    constructor(levels: number = 1) {
        super('jump');
        this.levels = levels;
    }
}
