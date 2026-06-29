/**
 * YAML 命令定义的类型
 */

/** YAML 解析后的原始节点 */
export interface YamlCommandDef {
    command: string;
    description?: string;
    children?: YamlNode[];
}

export type YamlNode = YamlLiteral | YamlArgument | YamlForward;

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

export interface YamlForward {
    forward: true;
}

/** 自定义静态 suggest 列表项 */
export interface YamlSuggestItem {
    name: string;
    description?: string;
}
