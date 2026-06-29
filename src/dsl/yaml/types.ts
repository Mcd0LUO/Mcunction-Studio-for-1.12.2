/**
 * YAML 命令定义的类型
 */

/** 数据提取规则 */
export interface YamlExtractRule {
    pattern: string;      // 如 "set <name>" 或 "<location>"
    type: string;         // 存储类型名（suggest 引用用）
    description?: string; // 可选描述
}

/** YAML 解析后的原始节点 */
export interface YamlCommandDef {
    command: string;
    description?: string;
    extract?: YamlExtractRule[];
    children?: YamlNode[];
}

export type YamlNode = YamlLiteral | YamlArgument | YamlForwardRoot | YamlJump;

export interface YamlLiteral {
    literal: {
        name: string;
        description?: string;
        children?: YamlNode[];
    };
}

export interface YamlArgument {
    argument: {
        name: string;
        suggest?: string | YamlSuggestItem[];
        optional?: boolean;
        children?: YamlNode[];
    };
}

export interface YamlForwardRoot {
    forward_root: true;
}

/** @deprecated 请使用 forward_root */
export interface YamlForward {
    forward: true;
}

export interface YamlJump {
    jump: true;
}

/** 自定义静态 suggest 列表项 */
export interface YamlSuggestItem {
    name: string;
    description?: string;
}
