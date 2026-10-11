import { RootNode, LiteralNode, ArgumentNode, GreedyArgumentNode, ForwardRootNode, CommandNode, SuggestionProvider } from './nodes';

/** 创建一个根命令 */
export function command(name: string): RootNode {
    return new RootNode(name);
}

/** 创建一个字面量分支节点 */
export function literal(name: string): LiteralNode {
    return new LiteralNode(name);
}

export function argument(
    name: string,
    suggest?: SuggestionProvider | null,
    options?: { optional?: boolean }
): ArgumentNode {
    return new ArgumentNode(name, suggest, options?.optional);
}

/**
 * 快捷方式：可选参数
 *
 * 仅设置 `optional` 标记（供 treeShape 快照与文档表达），引擎补全链路不读取它。
 * 详见 CommandNode.optional 的说明。
 */
export function optional(
    name: string,
    suggest?: SuggestionProvider | null
): ArgumentNode {
    return new ArgumentNode(name, suggest, true);
}

/**
 * 贪婪参数：吃掉其后所有剩余 token。
 *
 * 用于 1.12.2 的变长/自由文本参数（wiki 写作 `<message …>`、`[display name...]`、
 * `[entities...]`、`[dataTag]`）。校验与诊断层据此认定：
 * 进入该节点后，剩余 token 全部合法。
 *
 * @param suggest 可选。变长参数若在**首个** token 上有候选（如 `[entities...]`
 *                给选择器），传进来即可；后续 token 仍会被全部吃掉。
 */
export function greedy(name: string, suggest?: SuggestionProvider | null): GreedyArgumentNode {
    return new GreedyArgumentNode(name, suggest);
}

/** 转发到根命令列表（execute 的末段：1.12.2 中该位置直接接命令，无 run 关键字） */
export function forwardRoot(): ForwardRootNode {
    return new ForwardRootNode();
}

/** @deprecated 请使用 forwardRoot */
export function forward(): ForwardRootNode {
    return new ForwardRootNode();
}

/** 构建命令定义并注册 */
export interface CommandDef {
    name: string;
    description?: string;
    root: RootNode;
}

export function defineCommand(name: string, description: string, build: (c: RootNode) => void): CommandDef {
    const root = command(name);
    if (description) { root.description = description; }
    build(root);
    return { name, description, root };
}
