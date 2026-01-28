/**
 * 字符流处理工具类，封装字符的读取、消费、回溯等核心逻辑
 * 提供行/列位置追踪、批量操作、条件消费等高级抽象能力
 */
/**
 * 字符流处理工具类，封装字符的读取、消费、回溯等核心逻辑
 * 提供行/列位置追踪、批量操作、条件消费等高级抽象能力
 */
export class CharStream {
    /** 原始字符数组（只读+避免外部修改） */
    private chars: readonly string[];
    /** 原始文本（用于偏移量转行列） */
    private originalText: string;
    /** 当前读取位置（指针） */
    private pos: number = 0;
    /** 当前行号（从1开始） */
    private line: number = 1;
    /** 当前列号（从1开始） */
    private column: number = 1;
    /** 位置历史栈，用于回溯操作 */
    private readonly positionHistory: Array<{
        pos: number;
        line: number;
        column: number;
    }> = [];
    /** 标记是否刚读取过换行符 */
    public isNewLine: boolean = false;

    // 最大历史栈长度（可配置，默认不限）
    private readonly maxHistoryLength: number;

    /**
     * 初始化字符流
     * @param text 待处理的原始文本
     * @param maxHistoryLength 可选：最大历史栈长度，默认Infinity（不限）
     */
    constructor(text: string, maxHistoryLength: number = Infinity) {
        this.originalText = text;
        this.chars = Object.freeze(Array.from(text));
        this.maxHistoryLength = maxHistoryLength;
    }

    /**
     * 获取字符流总长度（通过 getter 避免冗余存储）
     */
    private get length(): number {
        return this.chars.length;
    }

    /**
     * 判断是否到达文本末尾（EOF）
     * @returns true=已到末尾，false=还有未读取字符
     */
    public isEOF(): boolean {
        return this.pos >= this.length;
    }

    /**
     * 获取当前指针位置的字符（不消费）
     * @returns 当前字符，EOF 时返回空字符串
     */
    public current(): string {
        return this.pos < this.length ? this.chars[this.pos] : '';
    }

    /**
     * 查看指定偏移量的字符（不消费）
     * @param offset 偏移量（默认1，即下一个字符），必须 >=0
     * @returns 目标位置字符，越界时返回空字符串
     */
    public peek(offset: number = 1): string {
        if (offset < 0) { return ''; } // 禁止负偏移，语义更清晰
        const targetPos = this.pos + offset;
        return targetPos < this.length ? this.chars[targetPos] : '';
    }

    /**
     * 查看当前指针前指定偏移量的字符（不消费）
     * @param offset 反向偏移量（默认1，即上一个字符），必须 >=0
     * @returns 目标位置字符，越界时返回空字符串
     */
    public peekBack(offset: number = 1): string {
        if (offset < 0) { return ''; }
        const targetPos = this.pos - offset;
        return targetPos >= 0 && targetPos < this.length ? this.chars[targetPos] : '';
    }

    /**
     * 查看当前指针后 N 个连续字符（不消费，从下1位开始）
     * @example 当前指针在索引0，peekN(2) → 取索引1、2的字符
     * @param count 要查看的字符数量（默认2），必须 >0
     * @returns 连续字符拼接的字符串，越界时返回空字符串
     */
    public peekN(count: number = 2): string {
        if (count <= 0) { return ''; }
        const start = this.pos + 1;
        const end = start + count;
        // 提前判断边界，避免无效的 slice 操作
        if (start >= this.length) { return ''; }
        return this.chars.slice(start, end).join('');
    }

    /**
     * 获取包含当前指针位置在内的 N 个连续字符（不消费）
     * @example 当前指针在索引0，getN(2) → 取索引0、1的字符
     * @param count 要获取的字符数量（默认2），必须 >0
     * @returns 连续字符拼接的字符串，越界时返回实际可获取的字符
     */
    public getN(count: number = 2): string {
        if (count <= 0) { return ''; }
        const end = Math.min(this.pos + count, this.length); // 避免越界
        return this.chars.slice(this.pos, end).join('');
    }

    /**
     * 预读直到指定字符串（不消费），返回中间内容（不含目标字符串）
     * @param target 目标字符串（如 '\n'、'"'）
     * @returns 从当前位置到目标字符串前的内容，未找到则返回空
     */
    public peekUntil(target: string): string {
        if (target.length === 0) { return ''; }

        const startPos = this.pos;
        let currentSearchPos = startPos;
        const targetLen = target.length;

        while (currentSearchPos + targetLen <= this.length) {
            // 检查当前位置是否匹配目标字符串
            const isMatch = Array.from(target).every((char, index) => {
                return this.chars[currentSearchPos + index] === char;
            });
            if (isMatch) {
                return this.chars.slice(startPos, currentSearchPos).join('');
            }
            currentSearchPos++;
        }

        return '';
    }

    /**
     * 消费当前字符（移动指针），并更新行/列位置
     * @returns 被消费的字符，EOF 时返回空字符串
     */
    public consume(): string {
        if (this.isEOF()) { return ''; }

        // 超出最大历史长度时移除最旧记录
        if (this.positionHistory.length >= this.maxHistoryLength) {
            this.positionHistory.shift();
        }
        // 记录当前位置到历史栈（用于回溯）
        this.positionHistory.push({ pos: this.pos, line: this.line, column: this.column });

        const c = this.chars[this.pos];
        this.pos++;

        // 兼容 \r\n（Windows）、\r（旧Mac）、\n（Unix）
        if (c === '\n') {
            this.line++;
            this.column = 1;
            this.isNewLine = true;
        } else if (c === '\r') {
            this.line++;
            this.column = 1;
            this.isNewLine = true;
            // 处理 \r\n：下一个字符是\n则正常消费（走consume逻辑，避免历史记录混乱）
            if (this.peek() === '\n') {
                this.consume(); // 用正常的consume处理\n，保证历史记录正确
            }
        } else {
            this.column++;
            this.isNewLine = false;
        }
        return c;
    }

    /**
     * 批量消费指定数量的字符
     * @param count 要消费的字符数量（<=0 时返回空字符串）
     * @returns 被消费的字符拼接的字符串
     */
    public consumeN(count: number): string {
        if (count <= 0) { return ''; }

        let result = '';
        const maxConsume = Math.min(count, this.length - this.pos); // 避免无效循环
        for (let i = 0; i < maxConsume; i++) {
            result += this.consume();
        }
        return result;
    }

    /**
     * 条件消费：持续消费满足断言条件的字符
     * @param predicate 字符断言函数（返回 true 则消费）
     * @returns 被消费的字符拼接的字符串
     */
    public consumeIf(predicate: (char: string) => boolean): string {
        return this.consumeByPredicate(predicate, true);
    }

    /**
     * 反向条件消费：持续消费不满足断言条件的字符
     * @param predicate 字符断言函数（返回 false 则消费）
     * @returns 被消费的字符拼接的字符串
     */
    public consumeUnless(predicate: (char: string) => boolean): string {
        return this.consumeByPredicate(predicate, false);
    }

    /**
     * 获取当前位置的详细信息（行/列/指针）
     * @returns 包含 pos/line/column 的不可变对象
     */
    public getPosition(): Readonly<{ pos: number; line: number; column: number }> {
        return Object.freeze({
            pos: this.pos,
            line: this.line,
            column: this.column,
        });
    }

    /**
     * 【核心新增】通过字符偏移量获取对应的行/列位置（解决跨行计算问题）
     * @param offset 字符全局偏移量
     * @returns 对应的行/列/偏移信息，越界则返回默认值
     */
    public getPositionByOffset(offset: number): Readonly<{ pos: number; line: number; column: number }> {
        // 边界校验
        if (offset < 0) {
            return Object.freeze({ pos: 0, line: 1, column: 1 });
        }
        if (offset >= this.length) {
            return Object.freeze({ pos: this.length, line: this.line, column: this.column });
        }

        let line = 1;
        let column = 1;
        const text = this.originalText;

        // 遍历字符，统计到目标偏移量的行/列
        for (let i = 0; i < offset; i++) {
            const char = text[i];
            if (char === '\n') {
                line++;
                column = 1;
            } else if (char === '\r') {
                line++;
                column = 1;
                // 跳过 \r\n 中的 \n，避免重复计算行号
                if (i + 1 < offset && text[i + 1] === '\n') {
                    i++;
                }
            } else {
                column++;
            }
        }

        return Object.freeze({ pos: offset, line, column });
    }

    /**
     * 匹配指定字符串序列（不消费字符）
     * @param str 要匹配的字符串
     * @returns true=匹配成功，false=匹配失败
     */
    public match(str: string): boolean {
        if (str.length === 0) { return false; }
        const targetEnd = this.pos + str.length;
        if (targetEnd > this.length) { return false; }

        // 直接切片对比，减少循环开销
        const currentSlice = this.chars.slice(this.pos, targetEnd).join('');
        return currentSlice === str;
    }

    /**
     * 匹配并消费指定字符串
     * @param str 要匹配的字符串
     * @returns true=匹配并消费成功，false=匹配失败
     */
    public consumeIfMatch(str: string): boolean {
        if (this.match(str)) {
            this.consumeN(str.length);
            return true;
        }
        return false;
    }

    /**
     * 回溯到上一个字符位置（撤销一次 consume 操作）
     * @returns true=回溯成功，false=无历史位置可回溯
     */
    public backtrack(): boolean {
        const lastPos = this.positionHistory.pop();
        if (!lastPos) { return false; }

        this.pos = lastPos.pos;
        this.line = lastPos.line;
        this.column = lastPos.column;
        this.isNewLine = false; // 回溯后重置换行标记
        return true;
    }

    /**
     * 批量回退指定数量的字符
     * @param count 回退数量（<=0 则不操作）
     * @returns 实际回退的数量
     */
    public backtrackN(count: number): number {
        if (count <= 0 || this.positionHistory.length === 0) { return 0; }

        const targetCount = Math.min(count, this.positionHistory.length);
        // 从后往前弹出指定数量的历史记录
        for (let i = 0; i < targetCount; i++) {
            const lastPos = this.positionHistory.pop();
            if (!lastPos) { break; }
            this.pos = lastPos.pos;
            this.line = lastPos.line;
            this.column = lastPos.column;
        }
        this.isNewLine = false;
        return targetCount;
    }

    /**
     * 保存当前位置，返回标记（用于后续恢复）
     * @returns 位置标记（数字）
     */
    public savePosition(): number {
        // 先推入当前位置，再返回标记（标记=推入前的长度）
        const marker = this.positionHistory.length;
        const currentPos = this.getPosition();
        // 移除类型断言，直接存储普通对象
        this.positionHistory.push({
            pos: currentPos.pos,
            line: currentPos.line,
            column: currentPos.column
        });
        return marker;
    }

    /**
     * 恢复到指定标记的位置
     * @param marker 保存位置时返回的标记
     * @returns true=恢复成功，false=标记无效
     */
    public restorePosition(marker: number): boolean {
        // 参数校验：标记必须是合法的非负整数，且小于历史栈长度
        if (!Number.isInteger(marker) || marker < 0 || marker >= this.positionHistory.length) {
            return false;
        }

        const savedPos = this.positionHistory[marker];
        this.pos = savedPos.pos;
        this.line = savedPos.line;
        this.column = savedPos.column;
        this.isNewLine = false;

        // 截断历史栈到标记位置（避免脏数据）
        this.positionHistory.splice(marker);
        return true;
    }


    /**
     * 获取格式化的位置字符串（如 "Line 5, Column 10"）
     * @param withLabel 是否带标签（默认 true），false 则返回 "5:10"
     */
    public getPositionString(withLabel: boolean = true): string {
        const { line, column } = this.getPosition();
        return withLabel ? `Line ${line}, Column ${column}` : `${line}:${column}`;
    }

    /**
     * 重置字符流到初始状态（可复用实例）
     * @param newText 可选：替换为新文本，不传则重置当前文本的指针
     */
    public reset(newText?: string): void {
        if (newText !== undefined) {
            this.originalText = newText;
            this.chars = Object.freeze(Array.from(newText));
        }
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.positionHistory.splice(0); // 清空历史栈
        this.isNewLine = false;
    }

    // ===================== 私有工具方法 =====================
    /**
     * 通用消费逻辑（复用 consumeIf/consumeUnless 代码）
     * @param predicate 字符断言函数
     * @param matchWhenTrue true=满足断言消费，false=不满足断言消费
     * @returns 被消费的字符拼接的字符串
     */
    private consumeByPredicate(
        predicate: (char: string) => boolean,
        matchWhenTrue: boolean
    ): string {
        let result = '';
        while (!this.isEOF()) {
            const char = this.current();
            const isMatch = predicate(char);
            if (isMatch === matchWhenTrue) {
                result += this.consume();
            } else {
                break;
            }
        }
        return result;
    }
}