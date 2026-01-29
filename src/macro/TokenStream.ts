import { Token, TokenType } from "./MacroTokenizer";

/**
 * Token 流工具类（完全仿照 CharStream 设计）
 * 核心能力：游标遍历 Token 数组、预览/消费 Token、匹配/跳过指定 Token
 */
export class TokenStream {
    /** 原始 Token 数组（不可修改） */
    private readonly tokens: Token[];
    /** 当前游标位置（指向即将处理的 Token 索引） */
    private cursor: number = 0;
    /** 记录 Token 总数（避免重复计算） */
    private readonly length: number;

    /**
     * 构造 Token 流
     * @param tokens 你的 Tokenizer 生成的 Token 数组
     */
    constructor(tokens: Token[]) {
        this.tokens = tokens; // 深拷贝避免外部修改
        this.length = this.tokens.length;
    }

    // ===================== 核心基础方法（与 CharStream 对齐） =====================
    /**
     * 获取当前游标指向的 Token（不消费）
     * @returns 当前 Token | undefined（EOF 时）
     */
    public current(): Token | undefined {
        return this.tokens[this.cursor];
    }

    /**
     * 预览后续第 n 个 Token（不消费，默认预览下1个）
     * @param offset 预览偏移量（默认1，即下一个 Token）
     * @returns 预览的 Token | undefined（超出范围时）
     */
    public peek(offset: number = 1): Token | undefined {
        const targetIndex = this.cursor + offset;
        if (targetIndex >= this.length) {return undefined;}
        return this.tokens[targetIndex];
    }

    /**
     * 消费当前 Token（游标后移）
     * @returns 被消费的 Token | undefined（EOF 时）
     */
    public consume(): Token | undefined {
        if (this.isEOF()) {return undefined;}
        return this.tokens[this.cursor++];
    }

    /**
     * 消费并返回连续 n 个 Token（游标后移 n 位）
     * @param n 要消费的 Token 数量
     * @returns 消费的 Token 数组（不足 n 个时返回剩余所有）
     */
    public consumeN(n: number): Token[] {
        const consumed: Token[] = [];
        for (let i = 0; i < n && !this.isEOF(); i++) {
            consumed.push(this.consume()!);
        }
        return consumed;
    }

    /**
     * 获取上一个消费过的 Token（游标前一个位置）
     * @returns 上一个 Token | undefined（游标在0时返回undefined）
     */
    public prev(): Token | undefined {
        // 游标>0时，返回游标-1位置的Token；否则返回undefined
        if (this.cursor <= 0) {return undefined;}
        return this.tokens[this.cursor - 1];
    }

    /**
     * 获取上一个消费过的第 n 个 Token（可选偏移量）
     * @param offset 偏移量（默认1，即上1个；offset=2 表示上2个）
     * @returns Token | undefined
     */
    public prevN(offset: number = 1): Token | undefined {
        const targetIndex = this.cursor - offset;
        if (targetIndex < 0) {return undefined;}
        return this.tokens[targetIndex];
    }

    /**
     * 判断是否到达 Token 流末尾
     * @returns true=已到末尾，false=还有未处理的 Token
     */
    public isEOF(): boolean {
        return this.cursor >= this.length;
    }

    /**
     * 获取当前游标位置（Token 索引）
     * @returns 游标数值（从0开始）
     */
    public getPosition(): number {
        return this.cursor;
    }

    /**
     * 重置游标到指定位置（AST 构建时回溯用）
     * @param position 目标游标位置（需 >=0 且 <= Token 总数）
     */
    public reset(position: number): void {
        if (position < 0 || position > this.length) {
            throw new Error(`TokenStream 游标重置失败：位置 ${position} 超出范围（0~${this.length}）`);
        }
        this.cursor = position;
    }

    // ===================== 业务适配方法（宏解析场景专用） =====================
    /**
     * 匹配当前 Token（支持仅匹配类型 / 同时匹配类型+值）
     * @param type Token 类型（如 'KEYWORD'/'PUNCTUATOR'）
     * @param value Token 值（可选，如 'define'/'('）
     * @returns true=匹配成功，false=匹配失败
     */
    public match(type: string, value?: string): boolean {
        const current = this.current();
        if (!current) {return false;}
        if (value === undefined) {
            return current.type === type;
        }
        return current.type === type && current.value === value;
    }

    /**
     * 跳过指定类型的 Token（游标后移，直到不匹配该类型）
     * @param type 要跳过的 Token 类型（如 'WHITESPACE'/'LINE_COMMENT'）
     */
    public skip(type: string): void {
        while (!this.isEOF() && this.current()!.type === type) {
            this.consume();
        }
    }

    /**
     * 跳过空白/注释类 Token（宏解析场景高频使用）
     * 跳过类型：WHITESPACE（空白）/LINE_COMMENT（行注释）/DOC_COMMENT（文档注释）/BLOCK_COMMENT（块注释）
     */
    public skipWhitespaceAndComment(): void {
        const skipTypes = [TokenType.LINE_COMMENT, TokenType.DOC_COMMENT, TokenType.BLOCK_COMMENT, TokenType.WHITESPACE];
        while (!this.isEOF() && skipTypes.includes(this.current()!.type)) {
            this.consume();
        }
    }

    /**
     * 跳到第一个匹配条件的 Token（游标移动到该 Token 位置）
     * @param matcher 匹配函数（返回 true 表示找到目标）
     * @returns 找到的 Token | undefined（未找到时）
     */
    public skipTo(matcher: (token: Token) => boolean): Token | undefined {
        while (!this.isEOF()) {
            const current = this.current()!;
            if (matcher(current)) {
                return current;
            }
            this.consume();
        }
        return undefined;
    }
    /**
     * 跳过 Token 直到匹配指定类型+值（游标移动到该 Token 位置）
     * @param type Token 类型
     * @param value Token 值
     * @returns 匹配到的 Token | undefined（未找到时）
     */
    public skipToToken(type: string, value: string): Token | undefined {
        return this.skipTo((token) => token.type === type && token.value === value);
    }

    /**
     * 消费直到匹配指定条件（返回消费的 Token 数组，不包含匹配的 Token）
     * @param matcher 终止匹配函数（返回 true 停止消费）
     * @returns 消费的 Token 数组
     */
    public consumeUntil(matcher: (token: Token) => boolean): Token[] {
        const consumed: Token[] = [];
        while (!this.isEOF()) {
            const current = this.current()!;
            if (matcher(current)) {
                break;
            }
            consumed.push(this.consume()!);
        }
        return consumed;
    }

    /**
     * 获取当前游标到指定位置之间的 Token（不移动游标）
     * @param startIndex 起始索引（默认当前游标）
     * @param endIndex 结束索引（默认 Token 流末尾）
     * @returns Token 数组
     */
    public getRange(startIndex: number = this.cursor, endIndex: number = this.length): Token[] {
        if (startIndex < 0) {startIndex = 0;}
        if (endIndex > this.length) {endIndex = this.length;}
        return this.tokens.slice(startIndex, endIndex);
    }

    /**
     * 回溯游标（回退 n 步，默认1步）
     * @param n 回退步数（默认1）
     */
    public backtrack(n: number = 1): void {
        this.cursor = Math.max(0, this.cursor - n);
    }

    /**
     * 获取当前游标前/后范围内的 Token（不移动游标）
     * @param startOffset 起始偏移（负数=游标前，正数=游标后）
     * @param endOffset 结束偏移（负数=游标前，正数=游标后）
     * @returns Token 数组
     */
    public getSurroundingTokens(startOffset: number, endOffset: number): Token[] {
        const start = Math.max(0, this.cursor + startOffset);
        const end = Math.min(this.length, this.cursor + endOffset + 1);
        return this.tokens.slice(start, end);
    }

    /**
     * 调试用：打印当前 Token 流状态
     */
    public debug(): void {
        console.log(`=== TokenStream 状态 ===`);
        console.log(`当前游标位置：${this.cursor}/${this.length}`);
        console.log(`当前 Token：`, this.current() || 'EOF');
        console.log(`下一个 Token：`, this.peek() || 'EOF');
        console.log(`------------------------`);
    }
}