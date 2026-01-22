/**
 * NBT Token类型枚举（覆盖MC NBT所有核心语法元素）
 */
export enum NbtTokenType {
    // 分隔符/括号
    CurlyBraceOpen = 'CurlyBraceOpen',    // {
    CurlyBraceClose = 'CurlyBraceClose',  // }
    SquareBracketOpen = 'SquareBracketOpen', // [
    SquareBracketClose = 'SquareBracketClose', // ]
    Colon = 'Colon',                      // :
    Comma = 'Comma',                      // ,

    // 字面量
    String = 'String',                    // 带引号的字符串 "xxx"
    Identifier = 'Identifier',            // 无引号的标识符（标签名）
    Number = 'Number',                    // 数值（含MC后缀：1b/2s/3l/4f/5d）
    Boolean = 'Boolean',                  // 布尔值（1b/0b/true/false）

    // 辅助类型
    Whitespace = 'Whitespace',            // 空白符（空格/制表符/换行）
    EOF = 'EOF'                           // 结束符
}

/**
 * NBT Token实体类（纯字符串版，记录字符索引位置）
 */
export class NbtToken {
    /**
     * @param type Token类型
     * @param value Token原始值
     * @param start Token起始字符索引（包含）
     * @param end Token结束字符索引（不包含）
     */
    constructor(
        public readonly type: NbtTokenType,
        public readonly value: string,
        public readonly start: number,
        public readonly end: number
    ) { }

    // 辅助方法：打印Token信息
    toString(): string {
        return `[${this.type}] "${this.value}" (${this.start}-${this.end})`;
    }
}

/**
 * NBT Tokenizer核心类（纯字符串输入，无VSCode依赖）
 */
export class NbtTokenizer {
    private readonly input: string; // 待解析的NBT字符串
    private pos: number = 0;        // 当前扫描的字符索引

    /**
     * @param input NBT格式的字符串（如 "{Tags:["Skill.Trace"],NoGravity:1b}"）
     */
    constructor(input: string) {
        this.input = input;
    }

    /**
     * 获取下一个Token（核心方法）
     * @returns 解析出的Token，EOF表示解析完成
     */
    public nextToken(): NbtToken {
        // 1. 到达字符串末尾，返回EOF Token
        if (this.pos >= this.input.length) {
            return new NbtToken(NbtTokenType.EOF, '', this.pos, this.pos);
        }

        const currentChar = this.input[this.pos];

        // 2. 处理空白符（空格、制表符、换行、回车）
        if (/\s/.test(currentChar)) {
            return this.scanWhitespace();
        }

        // 3. 处理单字符分隔符/括号
        switch (currentChar) {
            case '{':
                return this.scanSingleCharToken(NbtTokenType.CurlyBraceOpen);
            case '}':
                return this.scanSingleCharToken(NbtTokenType.CurlyBraceClose);
            case '[':
                return this.scanSingleCharToken(NbtTokenType.SquareBracketOpen);
            case ']':
                return this.scanSingleCharToken(NbtTokenType.SquareBracketClose);
            case ':':
                return this.scanSingleCharToken(NbtTokenType.Colon);
            case ',':
                return this.scanSingleCharToken(NbtTokenType.Comma);
        }

        // 4. 处理带引号的字符串（"xxx"）
        if (currentChar === '"') {
            return this.scanString();
        }

        // 5. 处理数值（含MC后缀：1b/0b/2s/3l/4f/5d）
        if (/\d|\-/.test(currentChar)) {
            const token = this.scanNumber();
            // 特殊判断：MC NBT中 1b/0b 是布尔值，而非普通Number
            if (token.value === '1b' || token.value === '0b') {
                return new NbtToken(NbtTokenType.Boolean, token.value, token.start, token.end);
            }
            return token;
        }

        // 6. 处理标识符或布尔值（true/false）
        if (/[a-zA-Z_$]/.test(currentChar)) {
            return this.scanIdentifierOrBoolean(); // 关键修改：替换为新方法
        }

        // 7. 未知字符（默认按Identifier处理，也可自定义错误逻辑）
        return this.scanSingleCharToken(NbtTokenType.Identifier);
    }

    /**
     * 批量解析所有Token（辅助方法）
     * @returns 所有Token的列表（包含EOF）
     */
    public scanAllTokens(): NbtToken[] {
        const tokens: NbtToken[] = [];
        let token: NbtToken;
        do {
            token = this.nextToken();
            tokens.push(token);
        } while (token.type !== NbtTokenType.EOF);
        return tokens;
    }

    // ---------------- 私有扫描方法 ----------------
    /**
     * 扫描空白符（空格、制表符、换行、回车）
     */
    private scanWhitespace(): NbtToken {
        const start = this.pos;
        while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
            this.pos++;
        }
        const value = this.input.slice(start, this.pos);
        return new NbtToken(NbtTokenType.Whitespace, value, start, this.pos);
    }

    /**
     * 扫描单字符Token（如{}[]:,）
     */
    private scanSingleCharToken(type: NbtTokenType): NbtToken {
        const start = this.pos;
        this.pos++;
        const value = this.input[start];
        return new NbtToken(type, value, start, this.pos);
    }

    /**
     * 扫描带引号的字符串（支持转义符\"）
     */
    private scanString(): NbtToken {
        const start = this.pos;
        this.pos++; // 跳过开头的"
        let value = '"';
        let escaped = false;

        while (this.pos < this.input.length) {
            const char = this.input[this.pos];
            value += char;

            // 处理转义符
            if (escaped) {
                escaped = false;
                this.pos++;
                continue;
            }

            // 遇到结束引号（包括空字符串的""）
            if (char === '"' && !escaped) {
                this.pos++;
                break;
            }

            // 遇到转义符\
            if (char === '\\') {
                escaped = true;
            }

            this.pos++;
        }

        // 确保空字符串也能正确返回（比如""）
        if (value === '"' && this.pos > start) {
            value += '"'; // 补全空字符串的闭合引号（兼容解析）
        }

        return new NbtToken(NbtTokenType.String, value, start, this.pos);
    }

    /**
     * 扫描数值（支持整数、浮点数、MC后缀：b/s/l/f/d）
     */
    private scanNumber(): NbtToken {
        const start = this.pos;

        // 处理负号
        if (this.input[this.pos] === '-') {
            this.pos++;
        }

        // 处理整数部分
        while (this.pos < this.input.length && /\d/.test(this.input[this.pos])) {
            this.pos++;
        }

        // 处理小数点（浮点数）
        if (this.pos < this.input.length && this.input[this.pos] === '.') {
            this.pos++;
            // 处理小数部分
            while (this.pos < this.input.length && /\d/.test(this.input[this.pos])) {
                this.pos++;
            }
        }

        // 处理MC数值后缀（b/s/l/f/d，大小写兼容）
        if (
            this.pos < this.input.length &&
            /[bslfdBSLFD]/.test(this.input[this.pos])
        ) {
            this.pos++;
        }

        const value = this.input.slice(start, this.pos);
        return new NbtToken(NbtTokenType.Number, value, start, this.pos);
    }

    /**
     * 关键修改：扫描标识符或布尔值（true/false）
     */
    private scanIdentifierOrBoolean(): NbtToken {
        const start = this.pos;
        // 扫描标识符字符（字母、数字、下划线、$）
        while (
            this.pos < this.input.length &&
            /[a-zA-Z0-9_$]/.test(this.input[this.pos])
        ) {
            this.pos++;
        }
        const value = this.input.slice(start, this.pos);

        // 核心新增逻辑：判断是否是布尔值关键字
        const lowerValue = value.toLowerCase(); // 兼容大小写（True/TRUE/FALSE等）
        if (lowerValue === 'true' || lowerValue === 'false') {
            return new NbtToken(NbtTokenType.Boolean, value, start, this.pos);
        }

        // 不是布尔值则返回标识符
        return new NbtToken(NbtTokenType.Identifier, value, start, this.pos);
    }

    /**
     * 判断tokens数组中指定索引的token，是否在目标Identifier类型token的字符位置范围内
     * @param tokens 完整的Token数组
     * @param targetTokenIndex 待判断的Token在数组中的索引
     * @param identifierTokenIndex 目标Identifier类型Token在数组中的索引
     * @returns boolean - 目标Token是否在Identifier的字符范围中；参数不合法时返回false
     * @description 这里的"范围内"指：目标Token的字符起始/结束位置 完全落在Identifier Token的字符起始/结束位置区间内
     */
    public static isTokenInIdentifierRange
        (
            tokens: NbtToken[],
            targetTokenIndex: number,
            identifierTokenIndex: number
        ): boolean {
        // 1. 基础参数合法性校验
        /**
         * 判断指定索引的Token是否在目标Identifier（如Tags）直接包裹的括号（[]/{}）范围内
         * 核心逻辑：被Identifier对应的键值对的value括号直接包裹（括号深度为0）
         * @param tokens 完整Token数组
         * @param targetTokenIndex 待判断的Token索引（如最后一个","的索引9）
         * @param identifierTokenIndex 目标Identifier的Token索引（如Tags的索引1）
         * @returns boolean - 符合返回true，否则false；参数不合法返回false
         */
        // 1. 基础参数校验
        if (
            !tokens ||
            tokens.length === 0 ||
            targetTokenIndex < 0 || targetTokenIndex >= tokens.length ||
            identifierTokenIndex < 0 || identifierTokenIndex >= tokens.length ||
            tokens[identifierTokenIndex].type !== NbtTokenType.Identifier
        ) {
            return false;
        }

        // 2. 定位Identifier对应的value起始括号（跳过冒号，找第一个[/{）
        let bracketStartIndex = -1;
        let bracketType: NbtTokenType.SquareBracketOpen | NbtTokenType.CurlyBraceOpen | null = null;

        // 从Identifier下一个Token开始遍历，找冒号后的起始括号
        for (let i = identifierTokenIndex + 1; i < tokens.length; i++) {
            const token = tokens[i];
            // 跳过冒号
            if (token.type === NbtTokenType.Colon) {continue;}
            // 找到起始括号，记录位置和类型
            if (token.type === NbtTokenType.SquareBracketOpen || token.type === NbtTokenType.CurlyBraceOpen) {
                bracketStartIndex = i;
                bracketType = token.type;
                break;
            }
            // 遇到同级逗号/大括号闭合符，说明Identifier无直接括号包裹，终止
            if (token.type === NbtTokenType.Comma || token.type === NbtTokenType.CurlyBraceClose) {
                break;
            }
        }
        // 无起始括号 → 不满足
        if (bracketStartIndex === -1 || !bracketType) {return false;}

        // 3. 确定键值对的有效结束边界（无需闭合括号）
        // 有效范围：从起始括号开始 → 到下一个同级逗号/大括号闭合符为止（无则到数组末尾）
        let keyValueEndIndex = tokens.length - 1; // 默认到末尾
        let bracketDepth = 0;

        for (let i = bracketStartIndex; i < tokens.length; i++) {
            const token = tokens[i];
            // 嵌套括号深度+1
            if (token.type === bracketType) {bracketDepth++;}
            // 闭合括号深度-1
            if (
                (bracketType === NbtTokenType.SquareBracketOpen && token.type === NbtTokenType.SquareBracketClose) ||
                (bracketType === NbtTokenType.CurlyBraceOpen && token.type === NbtTokenType.CurlyBraceClose)
            ) {
                bracketDepth--;
            }

            // 深度为0时，遇到同级逗号/大括号闭合符 → 键值对结束
            if (bracketDepth === 0 && (token.type === NbtTokenType.Comma || token.type === NbtTokenType.CurlyBraceClose)) {
                keyValueEndIndex = i - 1; // 边界前一个Token是有效范围最后一位
                break;
            }
        }

        // 4. 核心判断：目标Token在起始括号之后，且在有效结束边界之内
        return targetTokenIndex > bracketStartIndex && targetTokenIndex <= keyValueEndIndex;
    }
}