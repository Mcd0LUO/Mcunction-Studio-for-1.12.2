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
    /** 本次补全请求的光标列（无光标信息时 undefined） */
    cursorCharacter?: number;
}

/** suggest 函数签名（支持同步和异步） */
export type SuggestionProvider = (ctx: SuggestContext) => vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

/** 节点类型判别 */
export type NodeKind = 'root' | 'literal' | 'argument' | 'greedy' | 'forward_root';

/** 命令树节点基类 */
export abstract class CommandNode {
    public readonly kind: NodeKind;
    public readonly children: CommandNode[] = [];
    public description: string = '';

    /**
     * 标记该节点对应的参数可选（对应 Minecraft 语法中的 `[...]`）。
     *
     * ⚠️ 仅用于**结构快照与文档表达**，引擎的 walk/suggest 不读取它 ——
     * 补全时可选参数与必填参数一视同仁。因此像
     * `/effect <p> speed 10 1 true` 之后仍会提示 `[hideParticles]`。
     *
     * 之所以保留而不删除：
     *   1. `toTreeShape()` 会把它写进基准快照，1.12.2 的语法保真度需要它
     *   2. 命令定义文件里 `optional('[seconds]')` 的写法本身就值得保留可读性
     *
     * 若将来要让引擎真正支持「跳过可选参数」，需要在 walk 中实现
     * 回溯与 sibling 探测（Brigadier 风格的贪心/回溯匹配），属于引擎能力扩展，
     * 届时本字段的语义才会从「标记」升级为「行为」。
     */
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
 * 贪婪参数节点 —— 吃掉其后**所有**剩余 token。
 *
 * 对应 1.12.2 中若干变长/自由文本参数（wiki 写作 `<message …>`、
 * `[display name...]`、`[entities...]`、`[dataTag]`）：
 *   say <message …>
 *   title <target> title <raw json title …>
 *   scoreboard objectives add <name> <criteria> [display name...]
 *   scoreboard teams join <team> [entities...]
 *   scoreboard players set <entity> <objective> <score> [dataTag]
 *
 * ⚠️ 之所以需要独立节点类型：普通 ArgumentNode 每层只消费一个 token，
 *    `say hello world` 里的 world 会成为"未消费 token"，
 *    诊断层就会把完全合法的命令判成语法错误。
 *    同理 `teams join red @a @p` 的 `@p`、`set @s obj 1 {a: 1}` 的 `{a:` /
 *    `1}` 都会误报。
 */
export class GreedyArgumentNode extends CommandNode {
    public readonly argName: string;
    /**
     * 可选候选提供者。
     *
     * 变长参数既需要**吃掉后续全部 token**（避免误报），
     * 又希望在**第一个** token 上给出补全（如 `[entities...]` 给选择器列表）。
     * 普通 ArgumentNode 做不到前者，所以给 greedy 也挂一个 suggest。
     */
    public readonly suggest: SuggestionProvider | null;

    constructor(argName: string, suggest?: SuggestionProvider | null) {
        super('greedy');
        this.argName = argName;
        this.suggest = suggest ?? null;
    }
}

/**
 * 转发到根命令 — execute 等命令的 run 子句。
 * 到达此节点或其父节点时，引擎返回所有根命令列表。
 *
 * 注：原 JumpNode（可重复链式子命令）已随 EasyCber 的 superexe/foreach 一并移除，
 * 1.12.2 的 execute 用不上它，故不再保留。
 */
export class ForwardRootNode extends CommandNode {
    constructor() {
        super('forward_root');
    }
}
