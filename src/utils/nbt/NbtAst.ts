import { NbtAstArrayNode, NbtAstBaseNode, NbtAstGuards, NbtAstKeyValueNode, NbtAstLiteralNode, NbtAstObjectNode, NbtAstRootNode } from "./NbtAstNode";
import { NbtToken, NbtTokenizer, NbtTokenType } from "./NbtTokenizer";

// -------------------------- 9. 核心解析入口类（封装Tokenizer+递归生成AST类实例） --------------------------
export class NbtAst {
    public root: NbtAstRootNode;
    private tokens: NbtToken[];
    private pos: number = 0;

    constructor(nbtStr: string) {
        this.root = new NbtAstRootNode();
        // 1. Token化
        const tokenizer = new NbtTokenizer(nbtStr);
        this.tokens = tokenizer.scanAllTokens().filter(t =>
            t.type !== NbtTokenType.Whitespace && t.type !== NbtTokenType.EOF
        );
        // 2. 解析生成AST类实例
        const rootChild = this.parseValue();
        if (rootChild) { this.root.setRootChild(rootChild); }
    }

    // -------------------------- 解析核心方法（递归生成类实例） --------------------------
    private parseValue(): NbtAstNode | undefined {
        const currentToken = this.peekToken();
        if (!currentToken) { return undefined; }

        if (currentToken.type === NbtTokenType.CurlyBraceOpen) {
            return this.parseObject();
        } else if (currentToken.type === NbtTokenType.SquareBracketOpen) {
            return this.parseArray();
        } else {
            return this.parseLiteral();
        }
    }

    private parseObject(): NbtAstObjectNode {
        const openToken = this.consumeToken()!;
        const objNode = new NbtAstObjectNode(openToken.start, openToken.end);

        while (this.peekToken()?.type !== NbtTokenType.CurlyBraceClose && this.peekToken()) {
            try {
                const kvNode = this.parseKeyValue();
                if (kvNode) { objNode.addKeyValue(kvNode); }
                if (this.peekToken()?.type === NbtTokenType.Comma) { this.consumeToken(); }
            } catch (e) {
                break;
            }
        }

        const closeToken = this.peekToken();
        if (closeToken?.type === NbtTokenType.CurlyBraceClose) {
            objNode.end = this.consumeToken()!.end;
        } else {
            objNode.end = objNode.getLastChild()?.end || openToken.end;
        }

        return objNode;
    }

    private parseKeyValue(): NbtAstKeyValueNode | undefined {
        const keyToken = this.consumeToken();
        if (!keyToken || keyToken.type !== NbtTokenType.Identifier) { return undefined; }

        const colonToken = this.consumeToken();
        if (!colonToken || colonToken.type !== NbtTokenType.Colon) { return undefined; }

        const valueNode = this.parseValue();
        if (!valueNode || (!NbtAstGuards.isObjectNode(valueNode) && !NbtAstGuards.isArrayNode(valueNode) && !NbtAstGuards.isLiteralNode(valueNode))) {
            return undefined;
        }

        return new NbtAstKeyValueNode(
            keyToken.value,
            valueNode,
            keyToken.start,
            valueNode.end
        );
    }

    private parseArray(): NbtAstArrayNode {
        const openToken = this.consumeToken()!;
        const arrNode = new NbtAstArrayNode(openToken.start, openToken.end);

        while (this.peekToken()?.type !== NbtTokenType.SquareBracketClose && this.peekToken()) {
            try {
                const itemNode = this.parseValue();
                if (itemNode) { arrNode.addItem(itemNode); }
                if (this.peekToken()?.type === NbtTokenType.Comma) { this.consumeToken(); }
            } catch (e) {
                break;
            }
        }

        const closeToken = this.peekToken();
        if (closeToken?.type === NbtTokenType.SquareBracketClose) {
            arrNode.end = this.consumeToken()!.end;
        } else {
            arrNode.end = arrNode.getLastChild()?.end || openToken.end;
        }

        return arrNode;
    }

    private parseLiteral(): NbtAstLiteralNode | undefined {
        const token = this.consumeToken();
        if (!token) { return undefined; }

        let literalType: NbtTokenType.String | NbtTokenType.Number | NbtTokenType.Boolean = NbtTokenType.String;
        if ([NbtTokenType.String, NbtTokenType.Number, NbtTokenType.Boolean].includes(token.type)) {
            literalType = token.type as any;
        }

        return new NbtAstLiteralNode(
            literalType,
            token.value,
            token.start,
            token.end
        );
    }
    // ---开放方法
    public getTokens(): NbtToken[] {
        return this.tokens;
    }

    // -------------------------- Token辅助方法 --------------------------
    private peekToken(offset = 0): NbtToken | undefined {
        return this.tokens[this.pos + offset];
    }

    private consumeToken(): NbtToken | undefined {
        return this.tokens[this.pos++];
    }

    // -------------------------- 业务方法：获取最后一个KeyValue节点（核心需求） --------------------------
    public getLastKeyValue(options: { includeNested?: boolean } = { includeNested: false }): NbtAstKeyValueNode | undefined {
        const allKeyNodes: NbtAstKeyValueNode[] = [];

        const collectKeyNodes = (node: NbtAstNode) => {
            if (NbtAstGuards.isKeyValueNode(node)) { allKeyNodes.push(node); }
            if (node.children) { node.children.forEach(child => collectKeyNodes(child)); }
            if (NbtAstGuards.isKeyValueNode(node)) { collectKeyNodes(node.value); }
        };

        collectKeyNodes(this.root.getRootChild()!);

        if (options.includeNested) {
            return allKeyNodes.at(-1);
        } else {
            const rootChild = this.root.getRootChild();
            if (rootChild && NbtAstGuards.isObjectNode(rootChild)) {
                return rootChild.getLastKeyValue();
            }
            return undefined;
        }
    }

    // 核心：完整可视化（统一缩进+单次遍历+无重复）
    public visualize(): string {
        const INDENT_STEP = 2; // 固定缩进步长
        let result = '===== NBT AST 可视化 =====\n';

        // 递归遍历：单次遍历，统一缩进
        const traverse = (node: NbtAstBaseNode, depth: number) => {
            const indent = ' '.repeat(depth * INDENT_STEP);
            // 1. 打印当前节点（简洁toString）
            result += indent + node.toString().replace(/\n/g, '\n' + indent) + '\n';

            // 2. 特殊处理：KeyValue的value（单独遍历，层级+1）
            if (NbtAstGuards.isKeyValueNode(node)) {
                result += indent + '  → value details:\n';
                traverse(node.value, depth + 1);
                return; // 避免重复遍历children（KeyValue无children）
            }

            // 3. 遍历children（仅Object/Array/Root有有效children）
            if (node.children && node.children.length > 0) {
                result += indent + `  → children (${node.children.length}):\n`;
                node.children.forEach(child => traverse(child, depth + 1));
            }
        };

        // 从根节点开始遍历
        traverse(this.root, 0);
        result += '==========================';
        return result;
    }

    // 快捷打印
    public print(): void {
        console.log(this.visualize());
    }

    // 简洁toString（仅根节点信息）
    public toString(): string {
        return this.root.toString();
    }


}

// -------------------------- 类型导出（保持和原有代码的兼容性） --------------------------
export type NbtAstNode = NbtAstRootNode | NbtAstObjectNode | NbtAstArrayNode | NbtAstKeyValueNode | NbtAstLiteralNode;
export type NbtLiteralType = NbtTokenType.String | NbtTokenType.Number | NbtTokenType.Boolean;