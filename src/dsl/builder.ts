import { RootNode, LiteralNode, ArgumentNode, ForwardRootNode, JumpNode, CommandNode, SuggestionProvider } from './nodes';

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

/** 快捷方式：可选参数 */
export function optional(
    name: string,
    suggest?: SuggestionProvider | null
): ArgumentNode {
    return new ArgumentNode(name, suggest, true);
}

/** 转发到根命令列表（execute|foreach|superexe 的 run 子句） */
export function forwardRoot(): ForwardRootNode {
    return new ForwardRootNode();
}

/** @deprecated 请使用 forwardRoot */
export function forward(): ForwardRootNode {
    return new ForwardRootNode();
}

/**
 * 创建跳转节点 — 用于可重复链式子命令。
 * @param levels 向上跳几层（默认 1：回到直接父节点）
 */
export function jump(levels?: number): JumpNode {
    return new JumpNode(levels ?? 1);
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
