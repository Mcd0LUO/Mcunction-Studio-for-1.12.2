import { start } from "repl";
import { CharStream } from "./CharStream";

/**
 * 终极修复版 Tokenizer：彻底解决Token流生成问题
 * 核心：mcfunction语法级符号合并，无拆分/无重复/无错误归类
 */
export enum TokenType {
    // 基础类型
    IDENTIFIER = "IDENTIFIER",        // 标识符
    PUNCTUATOR = "PUNCTUATOR",        // 纯标点：(){}:,=.#
    LINE_COMMENT = "LINE_COMMENT",    // 行注释 //
    DOC_COMMENT = "DOC_COMMENT",      // 文档注释 /** */
    BLOCK_COMMENT = "BLOCK_COMMENT",   // 块注释
    OPERATOR = "OPERATOR",             // 运算符
    WHITESPACE = "WHITESPACE",         // 空白符
    // 标记专用
    FIELD_START = "FIELD_START",      // 字段开始( {
    FIELD_END = "FIELD_END",          // 字段结束 ) }



    // 宏专用类型
    KEYWORD = "KEYWORD", // 关键字 define
    MACRO_REFERENCE = "MACRO_REFERENCE",     // 参数引用 $(arg)
    MACRO_INVOCATION = "MACRO_INVOCATION",               // 内联宏调用 $name(xxx,xxx)
    // 鲁棒性
    UNKNOWN = "UNKNOWN"
}

export interface Token {
    type: TokenType;
    value: string;
    position: {
        start: Position;
        end: Position;
    };
}

interface Position {
    pos: number;
    line: number;
    column: number;
}

export enum ScanState {
    INIT,
    COMMENT,
    MACRO,
    MACRO_BODY,
}



export class MacroTokenizer {
    private readonly text: string;
    private stream: CharStream;
    private tokens: Token[] = [];
    private state: ScanState = ScanState.INIT;
    private maxParseRound: number = 5e4;
    private isWaitingForBodyOpen: boolean = false;  // 是否等待宏体开始
    private lastCloseParenPos: number | null = null; // 记录上一个右括号位置

    // 配置：可扩展
    private readonly operators = new Set(['=']);
    private readonly keywords = new Set(["define", "import"]);
    private readonly punctuators = new Set(["(", ")", "{", "}", '[', ']', ":", ",", "=", ".", ";"]); // 纯标点
    // 完整变量名
    private readonly VAR_NAME_UNICODE = /^[\u4e00-\u9fa5a-zA-Z_][\u4e00-\u9fa5a-zA-Z0-9_]*$/;
    // 变量名首字符：字母/中文/下划线（禁止数字）
    private readonly VAR_NAME_FIRST_CHAR = /^[\u4e00-\u9fa5a-zA-Z_]$/;
    // 变量名后续字符：字母/中文/数字/下划线
    private readonly VAR_NAME_REST_CHAR = /^[\u4e00-\u9fa5a-zA-Z0-9_]$/;
    // 默认值首字符：数字/字母/中文/下划线（支持数字开头）
    private readonly DEFAULT_VALUE_FIRST_CHAR = /^[\u4e00-\u9fa5a-zA-Z0-9_]$/;
    // 默认值后续字符：同变量名后续字符
    private readonly DEFAULT_VALUE_REST_CHAR = this.VAR_NAME_REST_CHAR;
    constructor(text: string) {
        this.text = text;
        this.stream = new CharStream(text);
    }

    /**
     * 最优的 addToken 实现：消费前记录起始位置，正向记录，无反推/修正
     * @param type Token 类型
     * @param value Token 内容（可选，若不传则自动取消费的字符）
     * @param startPos 可选：手动传入起始位置（默认消费前的当前位置）
     */
    private addToken(type: TokenType, value: string, startPos?: Position): void {
        // 步骤1：消费前记录起始位置（正向记录，无需反推）
        const actualStartPos = startPos || this.stream.getPosition();
        // 步骤2：结束位置 = 消费后的位置（无需修正，因为start是消费前，end是消费后）
        const endPos = this.stream.getPosition();

        this.tokens.push({
            type,
            value,
            position: {
                start: { ...actualStartPos },
                end: { ...endPos }
            }
        });
    }

    /** 唯一解析入口：生成无错误Token流 */
    public parse(): Token[] {
        this.tokens = [];
        let count = 0;

        while (!this.stream.isEOF()) {
            // 根据当前状态处理不同的解析
            if (/\s/.test(this.stream.current())) {
                this.consumeWhitespace();
                continue;
            }
            switch (this.state) {
                case ScanState.INIT:
                    this.parseInit();
                    break;
                case ScanState.MACRO:
                    this.parseMacro();
                    break;
                case ScanState.MACRO_BODY:
                    this.parseMacroBody();
                    break;
                default:
                    throw new Error(`Invalid state: ${this.state}`);

            }
            count += 1;
            if (count >= this.maxParseRound) {
                throw new MacroParseError(`Max parse round reached: ${this.maxParseRound}`);
            }
        }
        return this.tokens;
    }

    private parseInit(): void {
        const current = this.stream.current();
        const startPos = this.stream.getPosition();
        // 处理文档注释 | 块注释
        if (current === '/' && this.stream.peek() === '*') {
            const comment = this.stream.match('/**') ? this.consumeBlockComment() : this.consumeNormalBlockComment();
            const tokenType = this.stream.match('/**') ? TokenType.DOC_COMMENT : TokenType.BLOCK_COMMENT;
            this.addToken(tokenType, comment, this.stream.getPosition());
            return;
        } else if (current === '/' && this.stream.peek() === '/') {
            const comment = this.consumeLineComment();
            this.addToken(TokenType.LINE_COMMENT, comment, startPos);
        }
        else if (this.stream.match('define')) {
            this.addToken(TokenType.KEYWORD, this.stream.consumeN(6), startPos);
            this.state = ScanState.MACRO;
        }
        else {
            this.stream.consume();
        }

    }
    /**
     * 解析宏定义
     */
    private parseMacro(): void {
        const current = this.stream.current();
        const startPos = this.stream.getPosition();
        // 标识符
        if (this.VAR_NAME_FIRST_CHAR.test(current)) {
            const name = this.consumeIdentifier();
            this.addToken(TokenType.IDENTIFIER, name, startPos);
            // 默认值处理
            // 解析标识符后，检查是否需要处理默认值（如 score = 1 中的 = 1）
            this.parseParamDefaultValue();
            return;
        }
        if (this.punctuators.has(current)) {
            this.addToken(TokenType.PUNCTUATOR, this.stream.consume(), startPos);
            if (current === ')') {
                // 宏定义结束
                this.isWaitingForBodyOpen = true;
                this.lastCloseParenPos = startPos.pos;
            } else if (current === '{' && this.isWaitingForBodyOpen && this.lastCloseParenPos) {
                // 宏体开始
                // 获取括号和花括号之间的内容判断是否有语义
                const strBetween = this.getBetweenParenAndCurly(this.lastCloseParenPos + 1, startPos.pos);
                if (!this.isNonSemanticFragment(strBetween)) {
                    throw new MacroParseError(`语法错误：)和{之间只能包含空白/注释，实际包含："${strBetween}"`);
                }
                this.state = ScanState.MACRO_BODY;
                this.isWaitingForBodyOpen = false;
                this.lastCloseParenPos = null;
            }
            return;
        }
        // 1. 处理行内注释
        if (current === '/' && this.stream.peek() === '/') {
            const comment = this.consumeLineComment();
            this.addToken(TokenType.LINE_COMMENT, comment, this.stream.getPosition());
            return;
        }
        if (current === '/' && this.stream.peek() === '*') {
            const comment = this.stream.match('/**') ? this.consumeBlockComment() : this.consumeNormalBlockComment();
            const tokenType = this.stream.match('/**') ? TokenType.DOC_COMMENT : TokenType.BLOCK_COMMENT;
            this.addToken(tokenType, comment, this.stream.getPosition());
            return;
        }
        // 3. 解析运算符（仅处理 =，默认值的等号）
        if (this.operators.has(current)) {
            const opValue = this.stream.consume();
            this.addToken(TokenType.OPERATOR, opValue, startPos);
            return;
        }
        else {
            this.stream.consume();
        }
    }



    private parseMacroBody(): void {
        const current = this.stream.current();
        const startPos = this.stream.getPosition();
        // 1. 处理宏体内注释（单独生成Comment Token）
        if (current === '/' && this.stream.peek() === '/') {
            const comment = this.consumeLineComment();
            this.addToken(TokenType.LINE_COMMENT, comment, this.stream.getPosition());
            return;
        }
        if (current === '/' && this.stream.peek() === '*') {
            const comment = this.stream.match('/**') ? this.consumeBlockComment() : this.consumeNormalBlockComment();
            const tokenType = this.stream.match('/**') ? TokenType.DOC_COMMENT : TokenType.BLOCK_COMMENT;
            this.addToken(tokenType, comment, this.stream.getPosition());
            return;
        }
        // 2. 处理宏引用 $(xxx) → 独立Token
        // 4. 处理 $ 开头的语法（核心：区分宏引用/宏调用）
        if (current === '$') {
            // 4.1 $(xxx) → 宏变量引用
            if (this.stream.peek() === '(') {
                const macroRef = this.consumeMacroReference(); // 原方法：解析$(a)
                this.addToken(TokenType.MACRO_REFERENCE, macroRef, this.stream.getPosition());
                return;
            }
            // 4.2 $宏名(...) → 嵌套宏调用
            else if (this.VAR_NAME_FIRST_CHAR.test(this.stream.peek())) {
                const macroInvoke = this.consumeMacroInvocation(); // 新增：解析$宏名(参数,参数)
                this.addToken(TokenType.MACRO_INVOCATION, macroInvoke, this.stream.getPosition());
                return;
            }
        }
        // 3. 处理标点（,/;/(/)/}）→ 独立Token
        if (this.punctuators.has(current)) {
            // 分号/} 特殊处理（终止符/宏体结束）
            if (current === ';') {
                this.addToken(TokenType.PUNCTUATOR, this.stream.consume(), this.stream.getPosition());
                return;
            }
            if (current === '}') {
                this.addToken(TokenType.PUNCTUATOR, this.stream.consume(), this.stream.getPosition());
                this.state = ScanState.INIT; // 切回初始状态
                return;
            }
            // 普通标点（,/(/)）
            this.addToken(TokenType.PUNCTUATOR, this.stream.consume(), this.stream.getPosition());
            return;
        }
        // 5. 处理普通命令文本（运算符/@s/字母等 → 合并为IDENTIFIER）
        const cmdText = this.consumeMacroBodyText(); // 消费直到$、}、注释、EOF
        if (cmdText) {
            this.addToken(TokenType.IDENTIFIER, cmdText, this.stream.getPosition());
        }
    }

    // 
    private consumeIdentifier(): string {
        const name = this.stream.consumeIf(char => this.VAR_NAME_FIRST_CHAR.test(char));
        return name;

    }

    /**
 * 消费宏参数默认值：支持数字开头（如1、100、num1）
 * @returns 合法的默认值字符串
 */
    private consumeDefaultValue(): string {
        let defaultValue = '';
        const firstChar = this.stream.current();
        // 首字符支持数字/字母/中文/下划线
        if (!this.DEFAULT_VALUE_FIRST_CHAR.test(firstChar)) {
            throw new MacroParseError(`宏参数默认值非法首字符：${firstChar}（位置：${this.stream.getPosition().pos}）`);
        }
        // 消费首字符
        defaultValue += this.stream.consume();
        // 消费后续字符
        while (!this.stream.isEOF()) {
            const char = this.stream.current();
            if (this.DEFAULT_VALUE_REST_CHAR.test(char)) {
                defaultValue += this.stream.consume();
            } else {
                break;
            }
        }
        return defaultValue;
    }

    /**
 * 解析宏参数的默认值（如 score = 1 中的 = 1）
 * 仅在参数类型（如score）解析后调用
 */
    private parseParamDefaultValue(): void {
        // 跳过类型和等号之间的空白符
        this.consumeWhitespace();
        const current = this.stream.current();

        // 检测到等号 → 解析默认值
        if (current === '=' && this.operators.has(current)) {
            // 1. 生成等号的 OPERATOR Token
            const eqStartPos = this.stream.getPosition();
            this.addToken(TokenType.OPERATOR, this.stream.consume(), eqStartPos);

            // 2. 跳过等号和默认值之间的空白符
            this.consumeWhitespace();
            const defaultValueStartPos = this.stream.getPosition();
            const defaultValueChar = this.stream.current();
            // 3. 解析默认值（数字/标识符等，按IDENTIFIER处理）
            if (this.VAR_NAME_FIRST_CHAR.test(defaultValueChar) || /\d/.test(defaultValueChar)) {
                const defaultValue = this.consumeDefaultValue(); // 复用consume，支持数字/字母/中文
                this.addToken(TokenType.IDENTIFIER, defaultValue, defaultValueStartPos);
            } else {
                throw new MacroParseError(`宏参数默认值非法字符：${defaultValueChar}（位置：${this.stream.getPosition().pos}）`);
            }

            // 4. 跳过默认值后的空白符（如默认值和逗号之间的空格）
            this.consumeWhitespace();
        }
    }

    /**
     * 消费嵌套宏调用：$宏名(参数1,参数2)（支持命名空间，如$A.交换(a,b)）
     * @returns 完整宏调用字符串（如$A.交换(a,b)）
     */
    private consumeMacroInvocation(): string {
        if (this.stream.current() !== '$') { return ''; }
        const startPos = this.stream.getPosition();
        let invokeStr = '$';

        // 1. 消费$
        this.stream.consume();

        // 2. 消费宏名（支持命名空间：A.交换 / awa.test.取百分比）
        // 第一步：先消费第一段标识符（命名空间/宏名的首段，不能以点开头）
        if (!this.VAR_NAME_FIRST_CHAR.test(this.stream.current())) {
            throw new MacroParseError(`宏调用名非法：${this.stream.current()}（位置：${this.stream.getPosition().pos}）`);
        }
        invokeStr += this.consumeIdentifier();

        // 第二步：循环消费“点+标识符”（处理多层命名空间）
        while (!this.stream.isEOF()) {
            const char = this.stream.current();
            // 遇到点（.）→ 校验后消费
            if (char === '.') {
                // 校验1：点后必须是合法标识符首字符（避免 A..B / A.123 这种非法情况）
                const nextChar = this.stream.peek();
                if (!this.VAR_NAME_FIRST_CHAR.test(nextChar)) {
                    throw new MacroParseError(`宏命名空间点后非法字符：${nextChar}（位置：${this.stream.getPosition().pos + 1}）`);
                }
                // 消费点并拼接到宏名
                invokeStr += this.stream.consume();
                // 消费点后的标识符
                invokeStr += this.consumeIdentifier();
                continue;
            }
            // 遇到( → 宏名结束，退出循环（准备处理参数列表）
            if (char === '(') {
                break;
            }
            // 既不是点也不是( → 宏名非法（如包含空格/逗号等）
            throw new MacroParseError(`宏名非法字符：${char}（位置：${this.stream.getPosition().pos}）`);
        }

        // 3. 消费(参数列表)（原有逻辑不变，仅复用）
        if (this.stream.current() !== '(') {
            throw new MacroParseError(`宏调用缺少(：${invokeStr}（位置：${this.stream.getPosition().pos}）`);
        }
        invokeStr += this.stream.consume(); // 消费(

        // 4. 消费参数列表（支持标识符、宏引用、逗号）（原有逻辑完全不变）
        while (!this.stream.isEOF() && this.stream.current() !== ')') {
            const char = this.stream.current();
            // 消费空白符（参数间的空格）
            if (/\s/.test(char)) {
                invokeStr += this.consumeWhitespace();
                continue;
            }
            // 消费宏引用（参数里的$(a)）
            if (char === '$' && this.stream.peek() === '(') {
                invokeStr += this.consumeMacroReference();
                continue;
            }
            // 消费逗号（标点，直接拼接）
            if (char === ',') {
                invokeStr += this.stream.consume();
                continue;
            }
            // 消费参数名（标识符）
            if (this.VAR_NAME_FIRST_CHAR.test(char)) {
                invokeStr += this.consumeIdentifier();
                continue;
            }
            // 非法字符
            throw new MacroParseError(`宏调用参数非法字符：${char}（位置：${this.stream.getPosition().pos}）`);
        }

        // 5. 消费)（原有逻辑不变）
        if (this.stream.current() !== ')') {
            throw new MacroParseError(`宏调用未闭合)：${invokeStr}（起始位置：${startPos.pos}）`);
        }
        invokeStr += this.stream.consume();

        return invokeStr;
    }
    /**
 * 消费宏体普通文本（运算符、@s、字母、数字等），直到遇到$、}、注释、EOF
 */
    private consumeMacroBodyText(): string {
        let text = '';
        while (!this.stream.isEOF()) {
            const char = this.stream.current();
            // 终止条件：新增 ; 作为终止符（分号单独处理）
            if (char === '$' || char === '}' || char === ';' ||
                (char === '/' && (this.stream.peek() === '/' || this.stream.peek() === '*'))) {
                break;
            }
            // 所有非终止字符合并为普通文本（运算符/@s等）
            text += this.stream.consume();
        }
        return text;
    }

    /**
 * 消费宏引用 $(xxx)，返回完整的宏引用字符串（如$(a)）
 */
    private consumeMacroReference(): string {
        if (!this.stream.match('$(')) { return ''; }
        const startPos = this.stream.getPosition();
        let ref = '$(', isClosed = false;

        // 消费$和(
        this.stream.consumeN(2);
        // 消费到)为止（支持中文/字母/数字的宏参数名）
        while (!this.stream.isEOF()) {
            const char = this.stream.current();
            if (char === ')') {
                ref += char;
                this.stream.consume();
                isClosed = true;
                break;
            }
            // 仅允许合法的参数名字符（和VAR_NAME_PATTERN_UNICODE匹配）
            if (this.VAR_NAME_UNICODE.test(char) || /\s/.test(char)) {
                ref += this.stream.consume();
            } else {
                throw new MacroParseError(`宏引用内非法字符：${char}（位置：${this.stream.getPosition().pos}）`);
            }
        }

        if (!isClosed) {
            throw new MacroParseError(`宏引用未闭合：$(... （起始位置：${startPos.pos}）`);
        }
        return ref;
    }

    /**
     * 消费所有连续的空白符（空格、制表符、换行、回车等）
     * @returns 被消费的空白符拼接字符串
     */
    public consumeWhitespace(): string {
        return this.stream.consumeIf((char) => {
            // 匹配所有空白字符（\s 包含空格、\t、\n、\r、\f 等）
            return /\s/.test(char);
        });
    }

    /**
     * 消费单行注释（// 开头），若当前位置不是单行注释则返回空
     * @returns 被消费的注释内容（含 //），未匹配则返回空
     */
    public consumeLineComment(): string {
        if (!this.stream.match('//')) { return ''; }

        const commentContent = this.stream.consumeUnless((char) => char === '\n');
        // 消费换行符（若存在），让指针定位到注释下一行开头
        if (this.stream.current() === '\n') {
            this.stream.consume();
        }
        return commentContent;
    }

    /**
     * 消费多行注释（/** ... *\/ 开头），若当前位置不是则返回空
     * @returns 被消费的注释内容（含 /* 和 *\/），未匹配则返回空；若注释未闭合，返回已消费部分
     */
    private consumeBlockComment(): string {
        if (!this.stream.match('/**')) { return ''; }

        const marker = this.stream.savePosition();
        let commentContent = '/**';
        this.stream.consumeN(2); // 消费 /*

        let isClosed = false;
        while (!this.stream.isEOF()) {
            // 匹配 */ 结束符
            if (this.stream.match('*/')) {
                commentContent += '*/';
                this.stream.consumeN(2);
                isClosed = true;
                break;
            }
            commentContent += this.stream.consume();
        }

        // 若注释未闭合，回溯并返回空（避免返回不完整的注释）
        if (!isClosed) {
            this.stream.restorePosition(marker);
            return '';
        }
        return commentContent;
    }

    // 新增：处理普通多行注释（/*）
    private consumeNormalBlockComment(): string {
        if (!this.stream.match('/*')) { return ''; }
        const marker = this.stream.savePosition();
        let commentContent = '/*';
        this.stream.consumeN(2);

        let isClosed = false;
        while (!this.stream.isEOF()) {
            if (this.stream.match('*/')) {
                commentContent += '*/';
                this.stream.consumeN(2);
                isClosed = true;
                break;
            }
            commentContent += this.stream.consume();
        }

        if (!isClosed) {
            this.stream.restorePosition(marker);
            return '';
        }
        return commentContent;
    }
    // 步骤1：移除单行注释（// 直到换行）
    private removeLineComment = (s: string) => s.replace(/\/\/.*$/gm, '');
    // 步骤2：移除多行注释（/* ... */）
    private removeBlockComment = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    // 步骤3：判断字符串是否为非语义片段
    private isNonSemanticFragment(s: string): boolean {
        if (!s || typeof s !== 'string') { return true; }
        const trimmed = s.trim();
        if (trimmed === '') { return true; }

        let clean = this.removeLineComment(s);
        clean = this.removeBlockComment(clean);
        // 修正：用clean而非s做最终判断
        return clean.replace(/\s/g, '') === '';
    }

    /**
 * 截取)和{之间的字符串
 * @param parenEndPos )的结束字符偏移量
 * @param curlyStartPos {的起始字符偏移量
 * @returns 两者之间的字符串
 */
    private getBetweenParenAndCurly(parenEndPos: number, curlyStartPos: number): string {
        // this.text 是构造函数中保存的原始文本，直接截取区间即可
        return this.text.slice(parenEndPos, curlyStartPos);
    }


}




class MacroParseError extends Error {
    // 新增专属属性：错误位置（行列）、Token类型
    public position: { pos: number; line: number; column: number };
    public tokenType?: TokenType;

    constructor(message: string, position?: { pos: number; line: number; column: number }, tokenType?: TokenType) {
        super(message); // 调用父类构造函数
        this.name = "MacroParseError"; // 自定义错误名称（便于catch时识别）
        this.position = position ?? { pos: -1, line: -1, column: -1 };
    }
}