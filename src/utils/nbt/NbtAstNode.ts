import { NbtAstNode } from './NbtAst';
import {NbtTokenType } from './NbtTokenizer';

// -------------------------- 1. 保留原有枚举（适配类的type属性） --------------------------
export enum NbtAstNodeType {
    Root = 'Root',
    Object = 'Object',
    Array = 'Array',
    KeyValue = 'KeyValue',
    Literal = 'Literal'
}

// -------------------------- 2. 基础节点类（所有AST节点的父类） --------------------------
export class NbtAstBaseNode {
    public type: NbtAstNodeType;
    public start: number;
    public end: number;
    public children?: NbtAstNode[];

    constructor(type: NbtAstNodeType, start: number = 0, end: number = 0) {
        this.type = type;
        this.start = start;
        this.end = end;
        this.children = [];
    }

    // 通用：添加子节点（所有节点通用）
    public addChild(node: NbtAstNode): void {
        if (!this.children) {this.children = [];}
        this.children.push(node);
        // 自动更新当前节点的end为最后一个子节点的end（简化位置维护）
        this.end = node.end;
    }

    // 通用：获取最后一个子节点
    public getLastChild(): NbtAstNode | undefined {
        return this.children?.at(-1);
    }

    // 基础节点 toString：输出核心属性
    public toString(): string {
        return `[${this.type}] start: ${this.start}, end: ${this.end}`;
    }
}

// -------------------------- 3. 根节点类 --------------------------
export class NbtAstRootNode extends NbtAstBaseNode {
    constructor() {
        super(NbtAstNodeType.Root);
        // 根节点强制只有一个子节点（Object/Array）
        this.children = [];
    }

    // 根节点专属：设置唯一子节点
    public setRootChild(node: NbtAstNode): void {
        this.children = [node];
        this.end = node.end;
    }

    // 根节点专属：获取唯一子节点
    public getRootChild(): NbtAstNode | undefined {
        return this.children?.[0];
    }

    // 根节点 toString：补充子节点信息
    // 简洁版：仅自身+根子节点引用（无递归）
    public toString(): string {
        const rootChildStr = this.getRootChild() ? this.getRootChild()!.toString() : '(none)';
        return `${super.toString()}\n  → rootChild: ${rootChildStr}`;
    }
}

// -------------------------- 4. Object节点类 --------------------------
export class NbtAstObjectNode extends NbtAstBaseNode {
    constructor(start: number = 0, end: number = 0) {
        super(NbtAstNodeType.Object, start, end);
        // Object节点的children强制为KeyValueNode
        this.children = [] as NbtAstKeyValueNode[];
    }

    // Object专属：添加键值对节点
    public addKeyValue(node: NbtAstKeyValueNode): void {
        (this.children as NbtAstKeyValueNode[]).push(node);
        this.end = node.end;
    }

    // Object专属：获取最后一个键值对节点（核心需求）
    public getLastKeyValue(): NbtAstKeyValueNode | undefined {
        return (this.children as NbtAstKeyValueNode[]).at(-1);
    }

    // Object专属：根据key查找KeyValue节点
    public findKeyValueByKey(key: string): NbtAstKeyValueNode | undefined {
        return (this.children as NbtAstKeyValueNode[]).find(kv => kv.key === key);
    }

    // 简洁版：仅自身+键值对数量（无递归）
    public toString(): string {
        const kvCount = (this.children as NbtAstKeyValueNode[]).length;
        return `${super.toString()}\n  → keyValueCount: ${kvCount}`;
    }
}

// -------------------------- 5. Array节点类 --------------------------
export class NbtAstArrayNode extends NbtAstBaseNode {
    constructor(start: number = 0, end: number = 0) {
        super(NbtAstNodeType.Array, start, end);
    }

    // Array专属：添加子节点（支持任意AST节点）
    public addItem(node: NbtAstNode): void {
        this.addChild(node);
    }

    // Array专属：添加字符串字面量（高频场景：Tags数组补全）
    public addStringLiteral(value: string, start?: number, end?: number): NbtAstLiteralNode {
        const literal = new NbtAstLiteralNode(
            NbtTokenType.String,
            `"${value}"`,
            start ?? this.end + 1,
            end ?? (start ?? this.end + 1) + value.length + 2
        );
        this.addItem(literal);
        return literal;
    }

    // 简洁版：仅自身+元素数量（无递归）
    public toString(): string {
        const itemCount = this.children?.length || 0;
        return `${super.toString()}\n  → itemCount: ${itemCount}`;
    }
}

// -------------------------- 6. KeyValue节点类（核心） --------------------------
export class NbtAstKeyValueNode extends NbtAstBaseNode {
    public key: string;
    public value: NbtAstObjectNode | NbtAstArrayNode | NbtAstLiteralNode;

    constructor(key: string, value: NbtAstObjectNode | NbtAstArrayNode | NbtAstLiteralNode, start: number = 0, end: number = 0) {
        super(NbtAstNodeType.KeyValue, start, end);
        this.key = key;
        this.value = value;
        // 自动同步end为value的end
        this.end = value.end;
    }

    // KeyValue专属：修改key
    public setKey(newKey: string): void {
        this.key = newKey;
    }

    // KeyValue专属：修改value
    public setValue(newValue: NbtAstObjectNode | NbtAstArrayNode | NbtAstLiteralNode): void {
        this.value = newValue;
        this.end = newValue.end;
    }

    // 简洁版：仅自身+key+value类型（无递归）
    public toString(): string {
        return `${super.toString()}\n  → key: "${this.key}"\n  → valueType: ${this.value.type}`;
    }
}

// -------------------------- 7. Literal节点类 --------------------------
export class NbtAstLiteralNode extends NbtAstBaseNode {
    public literalType: NbtTokenType.String | NbtTokenType.Number | NbtTokenType.Boolean;
    public value: string;

    constructor(literalType: NbtTokenType.String | NbtTokenType.Number | NbtTokenType.Boolean, value: string, start: number = 0, end: number = 0) {
        super(NbtAstNodeType.Literal, start, end);
        this.literalType = literalType;
        this.value = value;
    }

    // Literal专属：修改值（自动同步类型）
    public setValue(newValue: string, newLiteralType?: NbtTokenType.String | NbtTokenType.Number | NbtTokenType.Boolean): void {
        this.value = newValue;
        if (newLiteralType) {this.literalType = newLiteralType;}
    }

    // Literal节点 toString：补充类型和值
    // 简洁版：仅自身+类型+值（无递归）
    public toString(): string {
        return `${super.toString()}\n  → literalType: ${this.literalType}\n  → value: ${this.value}`;
    }
}

// -------------------------- 8. 类型守卫（静态类，替代原有对象） --------------------------
export class NbtAstGuards {
    public static isRootNode(node: NbtAstBaseNode): node is NbtAstRootNode {
        return node.type === NbtAstNodeType.Root;
    }

    public static isObjectNode(node: NbtAstBaseNode): node is NbtAstObjectNode {
        return node.type === NbtAstNodeType.Object;
    }

    public static isArrayNode(node: NbtAstBaseNode): node is NbtAstArrayNode {
        return node.type === NbtAstNodeType.Array;
    }

    public static isKeyValueNode(node: NbtAstBaseNode): node is NbtAstKeyValueNode {
        return node.type === NbtAstNodeType.KeyValue;
    }

    public static isLiteralNode(node: NbtAstBaseNode): node is NbtAstLiteralNode {
        return node.type === NbtAstNodeType.Literal;
    }
}