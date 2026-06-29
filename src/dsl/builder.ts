import { RootNode, LiteralNode, ArgumentNode, ForwardNode, CommandNode, SuggestionProvider } from './nodes';

// ================================================================
// 链式 Builder API — 仿 Minecraft Brigadier
// ================================================================

/** 创建一个根命令 */
export function command(name: string): RootNode {
    return new RootNode(name);
}

/** 创建一个字面量分支节点 */
export function literal(name: string): LiteralNode {
    return new LiteralNode(name);
}

/**
 * 创建一个参数节点。
 * @param name    参数名（用于签名展示，如 "<target>"）
 * @param suggest 补全建议函数，可选
 * @param options 配置：optional 表示可选参数
 */
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

/** 创建一个转发节点（execute run 等场景，转发到根命令列表） */
export function forward(): ForwardNode {
    return new ForwardNode();
}

// ================================================================
// 类型安全的 DSL 风格（函数式，无 class 开销）
// 可替代直接使用 literal()/argument() 的组合
// ================================================================

/** 构建命令定义并注册 */
export interface CommandDef {
    name: string;
    description?: string;
    root: RootNode;
}

/** 高阶工厂：一条命令完整定义 */
export function defineCommand(name: string, description: string, build: (c: RootNode) => void): CommandDef {
    const root = command(name);
    if (description) { root.description = description; }
    build(root);
    return { name, description, root };
}
