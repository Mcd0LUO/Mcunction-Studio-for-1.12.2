import * as vscode from 'vscode';

/**
 * 修复 TS/ESLint 错误后的 AST 解析器
 * 解决问题：
 * 1. TS：对象可能为未定义、找不到变量、类型不匹配
 * 2. ESLint：curly 规则（if 条件后缺少大括号）
 */
import { Token, TokenType } from './MacroTokenizer';
import { StringBuilder } from './StringBuilder';
import { TokenStream } from './TokenStream';

// ====================== AST 节点类型 ======================
export interface ASTNode {
    type: string;
    position: Token['position']
}

export interface Program extends ASTNode {
    type: 'Program';
    body: (MacroDefinition | LineComment | MacroInvocation | DOCComment | BlockComment)[]; // 所有顶级节点
    // 可选：文件元信息（如文件名、路径）
    source?: string;
  }


// 1. 宏参数节点（对应 a: score = 1）
export interface MacroParam extends ASTNode {
    type: 'MacroParam';
    name: string; // 参数名：a/b
    paramType: string; // 参数类型：score
    defaultValue?: string; // 默认值：1（可选）
}

// 2. 宏定义节点（核心，对应整个define 取百分比(...) { ... }）
export interface MacroDefinition extends ASTNode {
    type: 'MacroDefinition';
    name: string; // 宏名：取百分比
    namespace?: string; // 扩展：如果后续支持命名空间宏定义，提前预留
    params: MacroParam[]; // 参数列表：[MacroParam, MacroParam]
    body: MacroBody; // 宏体节点
    docComment?: string; // 文档注释：/** 宏函数文档注释... */（可选）
    uid?: string; // 宏定义唯一id namespace:name:params
    uri?: vscode.Uri // 宏定义文件
}

export type MacroInvocationArgType = 'Identifier' | 'MacroParamRef';

// 3. 宏调用节点（对应 $A.交换($(a),b)）
export interface MacroInvocation extends ASTNode {
    type: 'MacroInvocation';
    fullName: string; // 完整宏名（含命名空间）：A.交换
    namespace?: string[]; // 命名空间拆分：['A']（方便后续解析）
    name: string; // 纯宏名：交换
    args: MacroInvocationArg[]; // 调用参数：[MacroParamRef, Identifier]
}


// 4. 宏调用参数节点（区分普通参数/宏引用参数）
export interface MacroInvocationArg extends ASTNode {
    type: 'MacroInvocationArg';
    value: string | MacroParamRef; // 普通值：b / 宏引用：$(a)
    valueType: 'Identifier' | 'MacroParamRef'; // 标记参数类型
}

// 5. 宏参数引用节点（对应 $(a)）
export interface MacroParamRef extends ASTNode {
    type: 'MacroParamRef';
    paramName: string; // 引用的参数名：a/b
}

export interface LineComment extends ASTNode {
    type: 'LineComment';
    value: string; // 注释内容
}

export interface BlockComment extends ASTNode {
    type: 'BlockComment';
    value: string; // 注释内容
}
export interface DOCComment extends ASTNode {
    type: 'DOCComment';
    value: string; // 注释内容
}

// 6. 宏体节点（对应 {} 内的内容）
export interface MacroBody extends ASTNode {
    type: 'MacroBody';
    statements: (CommandStatement | MacroInvocation )[]; // 宏体内的语句/宏调用/注释
}

// 7. 命令语句节点（对应 scoreboard...; / function...;）
export interface CommandStatement extends ASTNode {
    type: 'CommandStatement';
    content: string; // 命令文本：scoreboard players operation @s $(a) /= @s $(b)
    macroRefs: MacroParamRef[]; // 提取命令内的宏引用（方便后续宏展开）
}
enum ErrorType {
    SyntaxError = 'SyntaxError', // 语法错误
    SemanticError = 'SemanticError', // 语义错误
    TypeError = 'TypeError', // 类型错误
    UnknownError = 'UnknownError' // 未知错误
}

export interface ParseError {
    /** 错误类型（如 SyntaxError / SemanticError） */
    type: ErrorType;
    /** 错误提示信息 */
    message: string;
    /** 错误位置（精准定位到 Token 位置） */
    loc: Token['position'];
    /** 错误发生时的 Token（可选，便于调试） */
    token?: Token;
  }

enum BuildState {
    INIT,
    MACRO_DEF,
}

// ====================== 解析器核心实现 ======================
export class MacroASTBuilder {
    private readonly tokens: Token[]; // 你的 Token 数组
    private parseErrors: ParseError[];
    private stream: TokenStream;
    private current_state: BuildState = BuildState.INIT;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.parseErrors = [];
        this.stream = new TokenStream(tokens);
    }

    // -------------------- 错误管理核心方法 --------------------
    /**
     * 添加解析错误到错误列表
     * @param type 错误类型
     * @param message 错误信息
     * @param loc 错误位置
     * @param token 关联的 Token（可选）
     */
    private addParseError(
        type: ParseError['type'],
        message: string,
        loc: Token['position'],
        token?: Token
    ): void {
        this.parseErrors.push({
            type,
            message,
            loc,
            token,
        });
    }

    /**
     * 检查是否有解析错误
     * @returns true=有错误，false=无错误
     */
    public hasErrors(): boolean {
        return this.parseErrors.length > 0;
    }

    /**
     * 获取所有解析错误（对外只读）
     * @returns 错误列表副本（避免外部修改）
     */
    public getParseErrors(): ParseError[] {
        return [...this.parseErrors];
    }

    /**
     * 入口方法：构建整个文件的 AST（根节点为 Program）
     * @param source 可选：文件名/路径（用于元信息）
     * @returns Program 根节点 | null（有错误时返回 null）
     */
    public build(source?: string): Program | null {
        const programBody: Program['body'] = [];
        // 记录 Program 节点的起始/结束位置
        let programStartPos = this.stream.current()?.position.start || { line: 0, column: 0, pos: 0 };
        let programEndPos = programStartPos;

        // 遍历整个 Token 流，解析所有顶级节点
        while (!this.stream.isEOF()) {
            const currentToken = this.stream.current();
            if (!currentToken) {break;}

            // 更新 Program 结束位置
            programEndPos = currentToken.position.end;


            // 解析顶级节点类型
            switch (currentToken.type) {
                // 1. 解析宏定义（define）
                case TokenType.KEYWORD:
                    if (currentToken.value === 'define') {
                        const macroDef = this.buildMacroDefinition();
                        if (macroDef) {
                            programBody.push(macroDef);
                            // 更新 Program 结束位置为宏定义的结束位置
                            programEndPos = macroDef.position.end;
                        }
                    } else {
                        this.addParseError(
                            ErrorType.SyntaxError,
                            `不支持的顶级关键字：${currentToken.value}`,
                            currentToken.position,
                            currentToken
                        );
                        this.stream.consume(); // 消费错误 Token，继续解析后续内容
                    }
                    break;

                // 3. 解析顶级行注释（保留到 AST 中）
                case TokenType.LINE_COMMENT:
                    const commentNode: LineComment = {
                        type: 'LineComment',
                        value: currentToken.value,
                        position: currentToken.position
                    };
                    // programBody.push(commentNode);
                    this.stream.consume(); 
                    programEndPos = commentNode.position.end;
                    break;
                case TokenType.BLOCK_COMMENT: 
                    const blockCommentNode: BlockComment = {
                        type: 'BlockComment',
                        value: currentToken.value,
                        position: currentToken.position
                    };
                    // programBody.push(blockCommentNode);
                    this.stream.consume();
                    programEndPos = blockCommentNode.position.end;
                    break;
                case TokenType.DOC_COMMENT:
                    const docCommentNode: DOCComment = {
                        type: 'DOCComment',
                        value: currentToken.value,
                        position: currentToken.position
                    };
                    programBody.push(docCommentNode);
                    this.stream.consume(); // 消费注释 Token
                    programEndPos = docCommentNode.position.end;
                    break;  
                // 4. 未知的顶级 Token（报错但继续解析）
                default:
                    this.addParseError(
                        ErrorType.SyntaxError,
                        `不支持的顶级 Token 类型：${currentToken.type}（值：${currentToken.value}）`,
                        currentToken.position,
                        currentToken
                    );
                    this.stream.consume(); // 消费错误 Token，避免死循环
                    break;
            }
        }

        // 构建 Program 根节点
        const program: Program = {
            type: 'Program',
            body: programBody,
            source: source,
            position: {
                start: programStartPos,
                end: programEndPos
            }
        };

        return this.hasErrors() ? null : program;
    }

    public buildMacroDefinition(): MacroDefinition | null {
        const defineToken = this.stream.skipToToken(TokenType.KEYWORD, "define");
        if (!defineToken) {
            this.addParseError(
                ErrorType.SyntaxError,
                '未找到宏定义关键字（define）',
                this.stream.current()?.position || { start: { line: 0, column: 0, pos: 0 }, end: { line: 0, column: 0, pos: 0 } },
                this.stream.current()
            );
            return null;
          }
        this.stream.consume(); // 消费define

        // 解析宏名
        this.stream.skipWhitespaceAndComment();
        const macroNameToken = this.stream.current();
        if (!macroNameToken || macroNameToken.type !== TokenType.IDENTIFIER) {
            this.addParseError(
                ErrorType.SyntaxError,
                `宏定义后期望宏名（IDENTIFIER），实际找到：${macroNameToken?.type || 'EOF'}`,
                macroNameToken?.position || defineToken.position,
                macroNameToken
            );
              return null;
        }
        const macroName = macroNameToken.value;
        this.stream.consume(); // 消费宏名 Token
        // 3. 解析参数列表（(a: score = 1, b: score)）
        this.stream.skipWhitespaceAndComment();
        const leftParenToken = this.stream.current();
        if (!leftParenToken || leftParenToken.type !== TokenType.PUNCTUATOR || leftParenToken.value !== '(') {
            this.addParseError(
                ErrorType.SyntaxError,
                `宏名后期望左括号 "("，实际找到：${leftParenToken?.value || 'EOF'}`,
                leftParenToken?.position || macroNameToken.position,
                leftParenToken
            );
            return null;
        }
        this.stream.consume(); // 消费 (

        // 解析参数列表
        const params = this.buildMacroParams();

        // 4. 消费右括号 )
        this.stream.skipWhitespaceAndComment();
        const rightParenToken = this.stream.current();
        if (!rightParenToken || rightParenToken.type !== TokenType.PUNCTUATOR || rightParenToken.value !== ')') {
            this.addParseError(
                ErrorType.SyntaxError,
                `参数列表后期望右括号（)），实际找到：${rightParenToken?.value || 'EOF'}`,
                rightParenToken?.position || leftParenToken.position,
                rightParenToken
            );
            return null;
        }
        this.stream.consume(); // 消费 )

        // 5. 解析宏体（{ ... }）
        this.stream.skipWhitespaceAndComment();
        const leftBraceToken = this.stream.current();
        if (!leftBraceToken || leftBraceToken.type !== TokenType.PUNCTUATOR || leftBraceToken.value !== '{') {
            this.addParseError(
                ErrorType.SyntaxError,
                `参数列表后期望左花括号（{），实际找到：${leftBraceToken?.value || 'EOF'}`,
                leftBraceToken?.position || rightParenToken.position,
                leftBraceToken
            );
            return null;
        }
        const macroBody = this.buildMacroBody(leftBraceToken);

        // 6. 构建宏定义节点
        return {
            type: 'MacroDefinition',
            name: macroName,
            params: params,
            body: macroBody,
            position: {
                start: defineToken.position.start,
                end: macroBody.position.end,
            },
        };


        
    }
    /**
     * 构建宏参数列表（a: score = 1, b: score）
     * @returns MacroParam[]  参数列表（解析失败返回空数组）
     */
    private buildMacroParams(): MacroParam[] {
        const params: MacroParam[] = [];
        this.stream.skipWhitespaceAndComment();

        // 循环解析参数，直到遇到 )
        while (!this.stream.match(TokenType.PUNCTUATOR, ')') && !this.stream.isEOF()) {
            // 解析参数名（如 a）
            const paramNameToken = this.stream.current();
            if (!paramNameToken || paramNameToken.type !== TokenType.IDENTIFIER) {
                this.addParseError(
                    ErrorType.SyntaxError,
                    `期望参数名（IDENTIFIER），实际找到：${paramNameToken?.value || 'EOF'}`,
                    paramNameToken?.position || this.stream.current()?.position || { start: { line: 0, column: 0, pos: 0 }, end: { line: 0, column: 0, pos: 0 } },
                    paramNameToken
                );
                break;
            }
            const paramName = paramNameToken.value;
            this.stream.consume(); // 消费参数名

            // 解析冒号 :
            this.stream.skipWhitespaceAndComment();
            const colonToken = this.stream.current();
            if (!colonToken || colonToken.type !== TokenType.PUNCTUATOR || colonToken.value !== ':') {
                this.addParseError(
                    ErrorType.SyntaxError,
                    `参数名后期望冒号（:），实际找到：${colonToken?.value || 'EOF'}`,
                    colonToken?.position || paramNameToken.position,
                    colonToken
                );
                break;
            }
            this.stream.consume(); // 消费 :

            // 解析参数类型（如 score）
            this.stream.skipWhitespaceAndComment();
            const paramTypeToken = this.stream.current();
            if (!paramTypeToken || paramTypeToken.type !== TokenType.IDENTIFIER) {
                this.addParseError(
                    ErrorType.SyntaxError,
                    `冒号后期望参数类型（IDENTIFIER），实际找到：${paramTypeToken?.type || 'EOF'}`,
                    paramTypeToken?.position || colonToken.position,
                    paramTypeToken
                );
                break;
            }
            const paramType = paramTypeToken.value;
            this.stream.consume(); // 消费参数类型

            // 解析默认值（可选：= 1）
            let defaultValue: string | undefined;
            this.stream.skipWhitespaceAndComment();
            const eqToken = this.stream.current();
            if (eqToken && eqToken.type === TokenType.OPERATOR && eqToken.value === '=') {
                this.stream.consume(); // 消费 =
                this.stream.skipWhitespaceAndComment();
                const defaultValueToken = this.stream.current();
                if (defaultValueToken && defaultValueToken.type === TokenType.IDENTIFIER) {
                    defaultValue = defaultValueToken.value;
                    this.stream.consume(); // 消费默认值
                } else {
                    this.addParseError(
                        ErrorType.SyntaxError,
                        `等号后期望默认值（IDENTIFIER），实际找到：${defaultValueToken?.type || 'EOF'}`,
                        defaultValueToken?.position || eqToken.position,
                        defaultValueToken
                    );
                }
            }
            // 添加参数到列表
            params.push({
                type: 'MacroParam',
                name: paramName,
                paramType: paramType,
                defaultValue: defaultValue,
                position: {
                    start: paramNameToken.position.start,
                    end: defaultValue ? (this.stream.prev()?.position.end || paramNameToken.position.end) : paramTypeToken.position.end,
                },
            });

            // 跳过逗号（,），准备解析下一个参数
            this.stream.skipWhitespaceAndComment();
            const commaToken = this.stream.current();
            if (commaToken && commaToken.type === TokenType.PUNCTUATOR && commaToken.value === ',') {
                this.stream.consume(); // 消费 ,
                this.stream.skipWhitespaceAndComment();
            }
        }

        return params;
    }

    /**
     * 构建宏体节点（{ ... } 内的内容）
     * @param leftBraceToken 左花括号 Token（定位宏体起始位置）
     * @returns MacroBody
     */
    private buildMacroBody(leftBraceToken: Token): MacroBody {
        this.stream.consume(); // 消费 { Token
        const statements: (CommandStatement | MacroInvocation)[] = [];
        let macroBodyEndPos = leftBraceToken.position; // 初始化结束位置

        // 循环解析宏体内的语句，直到遇到 }
        while (!this.stream.isEOF() && !this.stream.match(TokenType.PUNCTUATOR, '}')) {
            this.stream.skipWhitespaceAndComment();
            const currentToken = this.stream.current();
            if (!currentToken) {break;}

            // 解析行注释
            if (currentToken.type === TokenType.LINE_COMMENT) {
                const commentNode: LineComment = {
                    type: 'LineComment',
                    value: currentToken.value,
                    position: currentToken.position,
                };
                this.stream.consume();
                continue;
            }

            // 解析宏调用（$开头）
            if (currentToken.type === TokenType.MACRO_INVOCATION) {
                // 宏调用解析逻辑可后续补全，先占位
                const macroCallNode: MacroInvocation | null = this.buildMacroInvocation();
                if (macroCallNode) {
                    statements.push(macroCallNode);
                }
                continue;
            }

            // 解析命令语句（默认）
            const commandTokens = this.stream.consumeUntil((t) => t.type === TokenType.PUNCTUATOR && t.value === ';');
            const commandContent = this.reconstructCommandContent(commandTokens);
            // 提取命令内的宏引用（简化版，后续可完善）
            const macroRefs: MacroParamRef[] = commandTokens
                .filter((t) => t.type === TokenType.MACRO_REFERENCE)
                .map((t) => ({
                    type: 'MacroParamRef',
                    paramName: t.value.replace(/\$\(|\)/g, ''),
                    position: t.position,
                }));
            // 消费分号 ;
            if (this.stream.match(TokenType.PUNCTUATOR, ';')) {
                this.stream.consume();
            }

            // 构建命令语句节点
            const commandNode: CommandStatement = {
                type: 'CommandStatement',
                content: commandContent,
                macroRefs: macroRefs,
                position: {
                    start: commandTokens[0]?.position.start || currentToken.position.start,
                    end: this.stream.prev()?.position.end || currentToken.position.end,
                },
            };
            statements.push(commandNode);
        }

        // 消费右花括号 }
        if (this.stream.match(TokenType.PUNCTUATOR, '}')) {
            macroBodyEndPos = this.stream.current()!.position;
            this.stream.consume();
        }

        // 构建宏体节点
        return {
            type: 'MacroBody',
            statements: statements,
            position: {
                start: leftBraceToken.position.start,
                end: macroBodyEndPos.end,
            },
        };
    }

    // -------------------- 新增：构建单个宏调用（顶级/宏体内都能用） --------------------
    private buildMacroInvocation(): MacroInvocation | null {
        const callToken = this.stream.current();
        if (!callToken || callToken.type !== TokenType.MACRO_INVOCATION) {
            this.addParseError(
                ErrorType.SyntaxError,
                `期望宏调用 Token（MACRO_CALL），实际找到：${callToken?.type || 'EOF'}`,
                callToken?.position || { start: { line: 0, column: 0, pos: 0 }, end: { line: 0, column: 0, pos: 0 } },
                callToken
            );
            return null;
        }

        // 解析宏调用的完整名称（含命名空间）
        const fullName = callToken.value.replace(/^\$/, '').replace(/\(.*$/, '');
        // 拆分命名空间（如 A.交换 → ['A'], 交换 → []）
        const namespaceParts = fullName.split('.').filter(part => part.trim() !== '');
        const name = namespaceParts.pop() || '';
        const namespace = namespaceParts.length > 0 ? namespaceParts : undefined;

        // 解析宏调用参数（简化版，可后续完善）
        const args: MacroInvocationArg[] = [];
        const paramMatch = callToken.value.match(/\((.*)\)/);
        const rawParams = paramMatch ? paramMatch[1].trim() : '';
        // 有参数时解析参数（无参数则 args 为空数组）
        if (rawParams) {
            // 拆分参数（按逗号分割，兼容多空格/制表符）
            const paramList = rawParams.split(/\s*,\s*/).filter(param => param !== ''); // 过滤空参数（如 a,,b → [a,b]）
            // 计算参数的起始位置（基于宏调用 Token 的位置精准推导）
            const callStartPos = callToken.position.start;
            const paramStartOffset = callToken.value.indexOf('(') + 1; // 括号后第一个字符的偏移量
            let currentParamStartPos = {
                line: callStartPos.line,
                column: callStartPos.column + paramStartOffset,
                pos: callStartPos.pos + paramStartOffset
            };

            // 遍历解析每个参数
            paramList.forEach((paramValue, index) => {
                // 计算当前参数的结束位置（简单推导，精准版可结合 Token 流的字符偏移）
                const currentParamEndPos = {
                    line: currentParamStartPos.line,
                    column: currentParamStartPos.column + paramValue.length,
                    pos: currentParamStartPos.pos + paramValue.length
                };

                // 判定参数类型
                let valueType: MacroInvocationArgType;
                if (/^\$\(.*\)$/.test(paramValue)) {
                    // 宏参数引用：如 $(a)
                    valueType = 'MacroParamRef';
                } else {
                    valueType = 'Identifier';
                }
                // 构建参数节点
                args.push({
                    type: 'MacroInvocationArg',
                    valueType: valueType,
                    value: paramValue,
                    position: {
                        start: { ...currentParamStartPos },
                        end: { ...currentParamEndPos }
                    }
                });
                // 更新下一个参数的起始位置（加逗号+空格的偏移）
                currentParamStartPos = {
                    line: currentParamEndPos.line,
                    column: currentParamEndPos.column + 2, // 逗号+空格（, ）
                    pos: currentParamEndPos.pos + 2
                };
            });
        }


        // 构建宏调用节点
        const macroCall: MacroInvocation = {
            type: 'MacroInvocation',
            fullName: fullName,
            namespace: namespace,
            name: name,
            args: args,
            position: callToken.position
        };

        this.stream.consume(); // 消费宏调用 Token
        return macroCall;
    }

    /**
 * 计算两个相邻 Token 之间需要补充的空格数（基于 pos 偏移量）
 * @param prevToken 前一个 Token
 * @param currToken 当前 Token
 * @returns 空格数（>=0）
 */
    private calculateSpacesBetweenTokens(prevToken: Token, currToken: Token): number {
        // prevToken.end.pos：前一个 Token 最后一个字符的偏移量
        // currToken.start.pos：当前 Token 第一个字符的偏移量
        // 中间空格数 = 当前 Token 起始位置 - 前一个 Token 结束位置 - 1
        const spaceCount = currToken.position.start.pos - prevToken.position.end.pos;
        // 防止负数（Token 重叠/异常时返回 0）
        return Math.max(0, spaceCount);
    }

    /**
     * 重构命令内容（基于 Token 位置还原原始空格）
     * @param commandTokens 命令相关的 Token 数组
     * @returns 带正确空格的命令字符串
     */
    private reconstructCommandContent(commandTokens: Token[]): string {
        if (commandTokens.length === 0) {return '';}

        // 初始化构建器，传入第一个 Token 的 value
        const builder = new StringBuilder(commandTokens[0].value);

        // 遍历后续 Token，链式追加空格 + value
        for (let i = 1; i < commandTokens.length; i++) {
            const prevToken = commandTokens[i - 1];
            const currToken = commandTokens[i];
            const spaceCount = this.calculateSpacesBetweenTokens(prevToken, currToken);

            // 链式调用：追加空格 → 追加 Token value
            builder.appendRepeat(' ', spaceCount).append(currToken.value);
        }

        // 生成最终字符串
        return builder.toString();
      }



}

