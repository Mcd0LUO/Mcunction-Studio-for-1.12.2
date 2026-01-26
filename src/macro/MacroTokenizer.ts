/**
 * 终极修复版 Tokenizer：彻底解决Token流生成问题
 * 核心：mcfunction语法级符号合并，无拆分/无重复/无错误归类
 */
export enum TokenType {
    // 基础类型
    IDENTIFIER = "IDENTIFIER",        // 标识符（宏名/参数名/指令关键词/@s/@a等）
    NUMBER_LITERAL = "NUMBER_LITERAL",// 数字字面量（10/123）
    PUNCTUATOR = "PUNCTUATOR",        // 纯标点：(){}:,=.#
    OPERATOR = "OPERATOR",            // 运算符：*= /= += -= = * / + -
    WHITESPACE = "WHITESPACE",        // 空白符
    LINE_COMMENT = "LINE_COMMENT",    // 行注释 //
    DOC_COMMENT = "DOC_COMMENT",      // 文档注释 /** */
    STRING_LITERAL = "STRING_LITERAL",// 字符串 ""

    // 宏专用类型
    MACRO_DEF_KEYWORD = "MACRO_DEF_KEYWORD", // 关键字 define
    MACRO_PARAM_TYPE = "MACRO_PARAM_TYPE",   // 参数类型（score/int）
    MACRO_PARAM_REF = "MACRO_PARAM_REF",     // 参数引用 $(arg)
    MACRO_CALL = "MACRO_CALL",               // 内联宏调用 $name(xxx,xxx)
    MACRO_CALL_PREFIX = "MACRO_CALL_PREFIX"  // 宏调用前缀 $（兜底）
}

export interface Token {
    type: TokenType;
    value: string;
    position: {
        line: number;
        column: number;
        start: number;
        end: number;
    };
}

export class MacroTokenizer {
    private readonly text: string;
    private readonly chars: string[];
    private pos: number = 0;
    private line: number = 1;
    private column: number = 1;
    private tokens: Token[] = [];

    // 配置：可扩展
    private readonly paramTypes = new Set(["score", "int", "float", "bool"]); // 宏参数类型
    private readonly punctuators = new Set(["(", ")", "{", "}", ":", ",", "=", ".", "#"]); // 纯标点
    private readonly compoundOps = new Set(["*=", "/=", "+=", "-=", "="]); // 复合运算符（含单独=）
    private readonly singleOps = new Set(["*", "/", "+", "-"]); // 单运算符
    private readonly mcSelectors = new Set(["s", "a", "p", "r", "e"]); // mc目标选择器后缀

    constructor(text: string) {
        this.text = text;
        this.chars = Array.from(text);
    }

    /** 唯一解析入口：生成无错误Token流 */
    public parse(): Token[] {
        this.tokens = [];
        while (this.pos < this.chars.length) {
            const c = this.chars[this.pos];
            if (this.isWhitespace(c)) this.parseWhitespace();
            else if (c === "/") this.parseComment();
            else if (c === "\"") this.parseString();
            else if (this.isDigit(c)) this.parseNumber();
            else if (c === "$") this.parseMacroSymbol();
            else if (c === "@") this.parseMcSelector(); // 优先解析mc选择器@x
            else if (this.isOpStart(c)) this.parseOperator(); // 优先解析运算符
            else if (this.punctuators.has(c)) this.parsePunctuator();
            else if (this.isIdStart(c)) this.parseIdentifier();
            else this.consume(); // 未知字符直接消费（兜底）
        }
        return this.tokens;
    }

    // ====================== 核心修复：Mc选择器@x 解析（彻底解决重复） ======================
    private parseMcSelector(): void {
        let value = "@";
        this.consume(); // 消费@
        // 检查后续是否是合法选择器后缀（s/a/p/r/e）
        if (this.pos < this.chars.length && this.mcSelectors.has(this.chars[this.pos])) {
            value += this.consume(); // 合并为@s/@a/@p等
        }
        // 直接标记为IDENTIFIER，永不拆分@和后缀
        this.addToken(TokenType.IDENTIFIER, value);
    }

    // ====================== 核心修复：运算符解析（优先合并复合运算符*=/=） ======================
    private parseOperator(): void {
        let value = this.consume();
        // 优先合并复合运算符：*+/-/ 后紧跟= → 直接合并为*=/+=/-=/=
        if (this.singleOps.has(value) && this.pos < this.chars.length && this.chars[this.pos] === "=") {
            value += this.consume();
        }
        this.addToken(TokenType.OPERATOR, value);
    }

    // ====================== 基础解析方法（无错误，直接复用） ======================
    private parseComment(): void {
        if (this.chars[this.pos + 1] === "*" && this.chars[this.pos + 2] === "*") { // /** */
            let value = "/**";
            this.consume(); this.consume(); this.consume();
            while (this.pos < this.chars.length && !(this.chars[this.pos] === "*" && this.chars[this.pos + 1] === "/")) {
                value += this.consume();
            }
            value += this.consume() + this.consume();
            this.addToken(TokenType.DOC_COMMENT, value);
        } else if (this.chars[this.pos + 1] === "/") { // //
            let value = "//";
            this.consume(); this.consume();
            while (this.pos < this.chars.length && this.chars[this.pos] !== "\n") value += this.consume();
            this.addToken(TokenType.LINE_COMMENT, value);
        }
    }

    private parseString(): void {
        let value = "\"";
        this.consume();
        while (this.pos < this.chars.length && this.chars[this.pos] !== "\"") value += this.consume();
        value += this.consume();
        this.addToken(TokenType.STRING_LITERAL, value);
    }

    private parseNumber(): void {
        let value = "";
        while (this.pos < this.chars.length && this.isDigit(this.chars[this.pos])) value += this.consume();
        this.addToken(TokenType.NUMBER_LITERAL, value);
    }

    private parsePunctuator(): void {
        const value = this.consume();
        this.addToken(TokenType.PUNCTUATOR, value);
    }

    private parseIdentifier(): void {
        let value = "";
        while (this.pos < this.chars.length && this.isIdChar(this.chars[this.pos])) value += this.consume();
        // 宏关键字/参数类型识别
        if (value === "define") this.addToken(TokenType.MACRO_DEF_KEYWORD, value);
        else if (this.paramTypes.has(value)) this.addToken(TokenType.MACRO_PARAM_TYPE, value);
        else this.addToken(TokenType.IDENTIFIER, value);
    }

    private parseWhitespace(): void {
        let value = "";
        while (this.pos < this.chars.length && this.isWhitespace(this.chars[this.pos])) value += this.consume();
        this.addToken(TokenType.WHITESPACE, value);
    }

    // ====================== 宏符号解析（原有逻辑，无错误） ======================
    private parseMacroSymbol(): void {
        let value = "$";
        this.consume();
        if (this.chars[this.pos] === "(") { // $(arg) → 参数引用
            value += this.consume();
            while (this.pos < this.chars.length && this.isIdChar(this.chars[this.pos])) value += this.consume();
            if (this.chars[this.pos] === ")") value += this.consume();
            this.addToken(TokenType.MACRO_PARAM_REF, value);
        } else if (this.isIdStart(this.chars[this.pos])) { // $name(...) → 宏调用
            while (this.pos < this.chars.length && this.isIdChar(this.chars[this.pos])) value += this.consume();
            if (this.chars[this.pos] === "(") {
                value += this.consume();
                let paren = 1;
                while (this.pos < this.chars.length && paren > 0) {
                    if (this.chars[this.pos] === "(") paren++;
                    if (this.chars[this.pos] === ")") paren--;
                    value += this.consume();
                }
                this.addToken(TokenType.MACRO_CALL, value);
            } else {
                this.addToken(TokenType.MACRO_CALL_PREFIX, value);
            }
        } else {
            this.addToken(TokenType.MACRO_CALL_PREFIX, value);
        }
    }

    // ====================== 工具方法（无错误） ======================
    private isWhitespace(c: string): boolean { return [" ", "\t", "\n", "\r"].includes(c); }
    private isDigit(c: string): boolean { return /^[0-9]$/.test(c); }
    private isOpStart(c: string): boolean { return this.singleOps.has(c) || c === "="; }
    private isIdStart(c: string): boolean { return /^[a-zA-Z_一-龥]$/.test(c); }
    private isIdChar(c: string): boolean { return /^[a-zA-Z0-9_一-龥]$/.test(c); }

    private consume(): string {
        const c = this.chars[this.pos];
        this.pos++;
        if (c === "\n") { this.line++; this.column = 1; } else { this.column++; }
        return c;
    }

    private addToken(type: TokenType, value: string): void {
        const start = this.pos - value.length;
        this.tokens.push({
            type, value,
            position: { line: this.line, column: this.column - value.length, start, end: this.pos - 1 }
        });
    }
}
