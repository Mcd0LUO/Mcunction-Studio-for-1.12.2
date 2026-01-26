/**
 * 修复 TS/ESLint 错误后的 AST 解析器
 * 解决问题：
 * 1. TS：对象可能为未定义、找不到变量、类型不匹配
 * 2. ESLint：curly 规则（if 条件后缺少大括号）
 */
import { Token, TokenType } from './MacroTokenizer';

// ====================== AST 节点类型 ======================
export interface AstNode {
    type: string;
    position: {
        start: Token['position'];
        end: Token['position'];
    };
}

export interface MacroParameter extends AstNode {
    type: "MacroParameter";
    name: string;
    paramType?: string;
    defaultValue?: string;
}

export interface McFunctionStatement extends AstNode {
    type: "McFunctionStatement";
    content: string;
    tokens: Token[];
}

export interface MacroCall extends AstNode {
    type: "MacroCall";
    name: string;
    arguments: string[];
}

export interface MacroDefinition extends AstNode {
    type: "MacroDefinition";
    name: string;
    parameters: MacroParameter[];
    body: McFunctionStatement[];
    docComment?: string;
}

export interface McFunctionFile extends AstNode {
    type: "McFunctionFile";
    macros: MacroDefinition[];
    statements: (McFunctionStatement | MacroCall)[];
}

// ====================== 解析器核心实现 ======================
export class MacroAstParser {
    private readonly tokens: Token[];
    private currentIdx: number;
    private parseErrors: string[];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.currentIdx = 0;
        this.parseErrors = [];
    }

    public parse(): McFunctionFile {
        const rootStartPos = this.peek()?.position || { line: 1, column: 1, start: 0, end: 0 };
        const root: McFunctionFile = {
            type: "McFunctionFile",
            macros: [],
            statements: [],
            position: { start: rootStartPos, end: rootStartPos }
        };

        while (!this.isEof()) {
            this.skipWhitespace();
            const currentToken = this.peek();
            if (!currentToken) {
                break;
            }

            let docComment: string | undefined;
            if (currentToken.type === TokenType.DOC_COMMENT) {
                docComment = this.eat()!.value; // 非空断言：已通过if验证
                this.skipWhitespace();
            }

            if (this.match(TokenType.MACRO_DEF_KEYWORD, "define")) {
                const macroDef = this.parseMacroDefinition(docComment);
                if (macroDef) {
                    root.macros.push(macroDef);
                }
                continue;
            }

            const statement = this.parseStatement();
            if (statement) {
                root.statements.push(statement);
            }
        }

        root.position.end = this.tokens[this.tokens.length - 1]?.position || rootStartPos;

        if (this.parseErrors.length > 0) {
            console.warn(`[AST 解析器] 发现 ${this.parseErrors.length} 个语法结构错误：`);
            this.parseErrors.forEach((err, idx) => console.warn(`  ${idx + 1}. ${err}`));
        }

        return root;
    }

    private parseMacroDefinition(docComment?: string): MacroDefinition | undefined {
        // 修复：非空断言 + 空值检查
        const defineToken = this.eat();
        if (!defineToken) {
            return undefined;
        }
        const macroStartPos = defineToken.position;

        this.skipWhitespace();
        const nameToken = this.eat(TokenType.IDENTIFIER);
        if (!nameToken) {
            this.parseErrors.push(`[宏定义] 缺少宏名，位置：行${defineToken.position.line}`);
            return undefined;
        }
        const macroName = nameToken.value;

        this.skipWhitespace();
        // 修复：if 后添加大括号（ESLint curly）
        if (!this.eat(TokenType.PUNCTUATOR, "(")) {
            this.parseErrors.push(`[宏定义 ${macroName}] 缺少左括号 (，位置：行${nameToken.position.line}`);
            return undefined;
        }

        this.skipWhitespace();
        const parameters = this.parseMacroParameters();

        this.skipWhitespace();
        // 修复：if 后添加大括号（ESLint curly）
        if (!this.eat(TokenType.PUNCTUATOR, ")")) {
            this.parseErrors.push(`[宏定义 ${macroName}] 缺少右括号 )，位置：参数列表后`);
        }

        this.skipWhitespace();
        // 修复：if 后添加大括号（ESLint curly）
        if (!this.eat(TokenType.PUNCTUATOR, "{")) {
            this.parseErrors.push(`[宏定义 ${macroName}] 缺少左大括号 {，位置：行${this.peek()?.position.line || nameToken.position.line}`);
            return undefined;
        }

        this.skipWhitespace();
        const body = this.parseMacroBody();

        this.skipWhitespace();
        const closeBraceToken = this.eat(TokenType.PUNCTUATOR, "}");
        if (!closeBraceToken) {
            this.parseErrors.push(`[宏定义 ${macroName}] 缺少右大括号 }，位置：宏体后`);
        }

        return {
            type: "MacroDefinition",
            name: macroName,
            parameters,
            body,
            docComment,
            position: {
                start: macroStartPos,
                end: closeBraceToken?.position || nameToken.position
            }
        };
    }

    private parseMacroParameters(): MacroParameter[] {
        const parameters: MacroParameter[] = [];

        while (!this.isEof()) {
            this.skipWhitespace();
            const currentToken = this.peek();
            if (!currentToken) {
                break;
            }

            if (currentToken.type === TokenType.PUNCTUATOR && currentToken.value === ")") {
                break;
            }

            const nameToken = this.eat(TokenType.IDENTIFIER);
            if (!nameToken) {
                this.parseErrors.push(`[宏参数] 无效的参数名，位置：行${currentToken.position.line}`);
                this.skipUntil(TokenType.PUNCTUATOR, ",", ")");
                continue;
            }
            const paramStartPos = nameToken.position;

            // 修复：提前声明变量（解决找不到 nameToken/typeToken 错误）
            let paramType: string | undefined;
            let typeToken: Token | undefined;
            let defaultValue: string | undefined;
            let valueToken: Token | undefined;

            this.skipWhitespace();
            // 修复：if 后添加大括号（ESLint curly）
            if (this.eat(TokenType.PUNCTUATOR, ":")) {
                this.skipWhitespace();
                typeToken = this.eat(TokenType.MACRO_PARAM_TYPE);
                paramType = typeToken?.value;
            }

            this.skipWhitespace();
            // 修复：if 后添加大括号（ESLint curly）
            if (this.eat(TokenType.OPERATOR, "=")) {
                this.skipWhitespace();
                valueToken = this.eat(TokenType.NUMBER_LITERAL) || this.eat(TokenType.STRING_LITERAL);
                if (valueToken) {
                    defaultValue = valueToken.type === TokenType.STRING_LITERAL
                        ? valueToken.value.replace(/"/g, "")
                        : valueToken.value;
                }
            }

            parameters.push({
                type: "MacroParameter",
                name: nameToken.value,
                paramType,
                defaultValue,
                position: {
                    start: paramStartPos,
                    end: valueToken?.position || typeToken?.position || nameToken.position
                }
            });

            this.skipWhitespace();
            // 修复：if 后添加大括号（ESLint curly）
            if (this.match(TokenType.PUNCTUATOR, ",")) {
                this.eat();
            }
        }

        return parameters;
    }

    private parseMacroBody(): McFunctionStatement[] {
        const bodyStatements: McFunctionStatement[] = [];

        while (!this.isEof()) {
            this.skipWhitespace();
            const currentToken = this.peek();
            if (!currentToken) {
                break;
            }

            if (currentToken.type === TokenType.PUNCTUATOR && currentToken.value === "}") {
                break;
            }

            // 修复：if 后添加大括号（ESLint curly）
            if (currentToken.type === TokenType.LINE_COMMENT || currentToken.type === TokenType.DOC_COMMENT) {
                this.eat();
                continue;
            }

            const statement = this.parseStatement();
            if (statement && statement.type === "McFunctionStatement") {
                bodyStatements.push(statement);
            }
        }

        return bodyStatements;
    }

    private parseStatement(): McFunctionStatement | MacroCall | undefined {
        this.skipWhitespace();
        const startToken = this.peek();
        if (!startToken) {
            return undefined;
        }

        // 修复：if 后添加大括号（ESLint curly）
        if (startToken.type === TokenType.MACRO_CALL || startToken.type === TokenType.MACRO_CALL_PREFIX) {
            const callToken = this.eat();
            if (!callToken) {
                return undefined;
            }
            const callValue = callToken.value;
            const nameMatch = callValue.match(/^\$([a-zA-Z_一-龥0-9]+)/);
            const argsMatch = callValue.match(/\((.*)\)/);

            if (!nameMatch) {
                this.parseErrors.push(`[宏调用] 无效格式：${callValue}，位置：行${callToken.position.line}`);
                return undefined;
            }

            return {
                type: "MacroCall",
                name: nameMatch[1],
                arguments: argsMatch ? argsMatch[1].split(",").map(arg => arg.trim()) : [],
                position: {
                    start: callToken.position,
                    end: callToken.position
                }
            };
        }

        const statementTokens: Token[] = [];
        let statementContent = "";
        const stmtStartPos = startToken.position;

        while (!this.isEof()) {
            this.skipWhitespace();
            const token = this.peek();
            if (!token) {
                break;
            }

            // 修复：if 后添加大括号（ESLint curly）
            if (
                (token.type === TokenType.PUNCTUATOR && ["}", ")", "("].includes(token.value)) ||
                token.type === TokenType.LINE_COMMENT ||
                token.type === TokenType.DOC_COMMENT
            ) {
                break;
            }

            const consumedToken = this.eat();
            if (consumedToken) { // 修复：空值检查，避免 undefined 推入数组
                statementTokens.push(consumedToken);
                statementContent += consumedToken.value + " ";
            }
        }

        if (statementTokens.length === 0) {
            return undefined;
        }

        return {
            type: "McFunctionStatement",
            content: statementContent.trim(),
            tokens: statementTokens,
            position: {
                start: stmtStartPos,
                end: statementTokens[statementTokens.length - 1].position
            }
        };
    }

    // ====================== 辅助方法 ======================
    private isEof(): boolean {
        return this.currentIdx >= this.tokens.length;
    }

    private peek(offset: number = 0): Token | undefined {
        const idx = this.currentIdx + offset;
        return idx >= 0 && idx < this.tokens.length ? this.tokens[idx] : undefined;
    }

    private match(type: TokenType, value?: string): boolean {
        const token = this.peek();
        // 修复：if 后添加大括号（ESLint curly）
        if (!token || token.type !== type) {
            return false;
        }
        return value ? token.value === value : true;
    }

    private eat(type?: TokenType, value?: string): Token | undefined {
        if (this.isEof()) {
            return undefined;
        }

        const token = this.peek();
        // 修复：if 后添加大括号（ESLint curly）
        if (type && token?.type !== type) {
            return undefined;
        }
        // 修复：if 后添加大括号（ESLint curly）
        if (value && token?.value !== value) {
            return undefined;
        }

        this.currentIdx++;
        return token;
    }

    private skipWhitespace(): void {
        // 修复：while 内条件拆分 + 空值检查
        while (!this.isEof()) {
            const peekedToken = this.peek();
            // 修复：if 后添加大括号（ESLint curly）
            if (peekedToken?.type === TokenType.WHITESPACE) {
                this.eat();
            } else {
                break;
            }
        }
    }

    private skipUntil(type: TokenType, ...values: string[]): void {
        while (!this.isEof()) {
            const token = this.peek();
            // 修复：if 后添加大括号（ESLint curly）
            if (token?.type === type && values.includes(token.value)) {
                break;
            }
            this.eat();
        }
    }

    public getParseErrors(): string[] {
        return [...this.parseErrors];
    }
}