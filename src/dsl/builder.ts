import { RootNode, LiteralNode, ArgumentNode, ForwardRootNode, CommandNode, SuggestionProvider } from './nodes';

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
