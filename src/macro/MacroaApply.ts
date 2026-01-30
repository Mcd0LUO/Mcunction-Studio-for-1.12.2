import * as vscode from 'vscode';
import { MacroRegistry } from './MacroRegistry';
import { StringBuilder } from './StringBuilder';
import { MacroInvocation, MacroParamRef } from './MacroAst';

/**
 * 通用常量定义
 * 抽离常量便于维护，避免魔法值散落在代码中
 */
// 换行符（适配不同系统，统一使用\n）
const LINE_BREAK = '\n';
// 匹配宏参数引用的正则（如 $(scoreboard)）
const PARAM_REF_REGEX = /\$\(([^)]+)\)/g;
// 进度提示标题
const PROGRESS_TITLE = '展开宏调用';
// 宏折叠元信息注释标识（用于标记宏展开的起止位置）
const MACRO_FOLD_MARKER = '@macro';
// mcfunction 注释前缀（符合语法规范，# 开头的行不会被执行）
const COMMENT_PREFIX = '#';

/**
 * 宏展开核心类
 * 功能：解析并展开 mcfunction 中的宏调用，替换文档内容，添加折叠元信息
 * 设计模式：单例模式（确保全局唯一实例）
 */
export class MacroApply {
    // 单例实例（静态初始化，TS 中更简洁且线程安全）
    private static readonly instance = new MacroApply();
    // 私有构造函数（禁止外部实例化）
    private constructor() { }

    /**
     * 获取单例实例
     * @returns MacroApply 唯一实例
     */
    public static getInstance(): MacroApply {
        return this.instance;
    }

    /**
     * 入口方法：遍历文档展开所有宏并替换内容（带折叠元信息）
     * @param document 目标文档（vscode 文本文档对象）
     * @param showProgress 是否显示进度提示（默认：true）
     * @returns 操作是否成功（boolean）
     */
    public async applyMacro(
        document: vscode.TextDocument,
        showProgress: boolean = true
    ): Promise<boolean> {
        // 创建工作区编辑对象（支持批量编辑、撤销）
        const edit = new vscode.WorkspaceEdit();
        // 统计成功/失败行数（用于结果反馈）
        let successCount = 0;
        let failCount = 0;

        /**
         * 进度处理回调函数
         * 遍历文档每一行，调用单行处理逻辑
         */
        const progressHandler = async (progress: vscode.Progress<{ message: string }>) => {
            for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
                // 显示进度提示（可选）
                if (showProgress) {
                    progress.report({ message: `处理第 ${lineNum + 1}/${document.lineCount} 行` });
                }
                // 处理单行宏调用
                await this.processSingleLine(document, edit, lineNum, (success) => {
                    success ? successCount++ : failCount++;
                });
            }
        };

        // 显示进度窗口并执行处理逻辑
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification, // 通知栏显示进度
            title: PROGRESS_TITLE,
            cancellable: true // 允许用户取消操作
        }, progressHandler);

        // 应用编辑到文档并保存
        const applySuccess = await vscode.workspace.applyEdit(edit);
        if (applySuccess) {
            await document.save();
            // 提示用户处理结果
            vscode.window.showInformationMessage(
                `宏展开完成：成功${successCount}行 | 失败${failCount}行`
            );
        } else {
            vscode.window.showErrorMessage('宏展开失败：无法应用编辑');
        }

        return applySuccess;
    }

    /**
     * 处理单行：展开宏 + 添加折叠元信息 + 替换文档内容
     * @param document 目标文档
     * @param edit 工作区编辑对象
     * @param lineNum 当前行号
     * @param onProcessed 处理完成回调（传递是否成功）
     */
    private async processSingleLine(
        document: vscode.TextDocument,
        edit: vscode.WorkspaceEdit,
        lineNum: number,
        onProcessed: (success: boolean) => void
    ): Promise<void> {
        // 获取当前行对象
        const line = document.lineAt(lineNum);
        // 原始行文本（保留所有空格/缩进）
        const rawLineText = line.text;
        // 去除开头空格的行文本（用于判断是否是宏调用）
        const trimmedLineText = rawLineText.trimStart();

        // 非宏调用行（不以 $ 开头）直接跳过
        if (!trimmedLineText.startsWith('$')) {
            onProcessed(true);
            return;
        }

        try {
            // 1. 提取原始宏调用文本（去除首尾空格，保留核心调用）
            const originalMacroCall = rawLineText.trim();
            // 2. 核心：展开宏内容
            const expandedContent = this.expandMacro(trimmedLineText);
            // 展开失败则标记为处理失败
            if (!expandedContent) {
                onProcessed(false);
                return;
            }

            // 3. 提取原行缩进（保持文档格式统一）
            const indent = rawLineText.substring(0, rawLineText.indexOf(trimmedLineText));
            // 4. 构建带折叠元信息的最终内容
            const finalContent = this.buildContentWithFoldMarker(
                expandedContent,
                originalMacroCall,
                indent
            );

            // 5. 替换文档中当前行的内容
            edit.replace(document.uri, line.range, finalContent);
            // 标记为处理成功
            onProcessed(true);
        } catch (error) {
            // 捕获异常并提示用户（定位到具体行号）
            vscode.window.showWarningMessage(
                `第${lineNum + 1}行宏展开失败：${(error as Error).message}`
            );
            onProcessed(false);
        }
    }

    /**
     * 构建带折叠元信息的内容
     * 核心逻辑：在展开内容前后添加 #@macro 注释，记录原始宏调用，便于后续折叠
     * @param expandedContent 展开后的宏内容
     * @param originalMacroCall 原始宏调用文本（如 $set_num(score1, 20)）
     * @param indent 原行缩进（空格/制表符）
     * @returns 带注释的最终内容
     */
    private buildContentWithFoldMarker(
        expandedContent: string,
        originalMacroCall: string,
        indent: string
    ): string {
        // 折叠开始注释（标记宏展开的起始位置）
        const foldStartLine = `${indent}${COMMENT_PREFIX}${MACRO_FOLD_MARKER} start: ${originalMacroCall}`;
        // 折叠结束注释（标记宏展开的结束位置）
        const foldEndLine = `${indent}${COMMENT_PREFIX}${MACRO_FOLD_MARKER} end`;
        // 为展开内容添加缩进（保持格式对齐）
        const indentedExpanded = this.indentExpandedContent(expandedContent, indent);
        // 拼接最终内容：开始注释 + 展开内容 + 结束注释
        return [
            foldStartLine,
            indentedExpanded,
            foldEndLine
        ].join(LINE_BREAK);
    }

    /**
     * 为展开的多行内容添加缩进
     * @param expandedContent 展开后的宏内容
     * @param indent 缩进字符串（空格/制表符）
     * @returns 带缩进的展开内容
     */
    private indentExpandedContent(expandedContent: string, indent: string): string {
        return expandedContent
            .split(LINE_BREAK) // 按行拆分
            .map(line => `${indent}${line}`) // 每行添加缩进
            .join(LINE_BREAK); // 重新拼接
    }

    // ---------------- 核心宏展开逻辑 ----------------

    /**
     * 宏展开核心入口（单条宏文本）
     * 流程：解析宏调用 → 匹配宏定义 → 构建参数映射 → 展开宏体
     * @param macroText 宏调用文本（如 $test.scale_num($(scoreboard), $(num))）
     * @returns 展开后的字符串 | null（展开失败）
     * @throws 展开失败时抛出错误（含具体原因）
     */
    private expandMacro(macroText: string): string | null {
        // 1. 解析宏调用基础信息（命名空间、宏名、参数文本）
        const { namespace, macroName, paramText } = this.parseMacroCall(macroText);
        if (!macroName) { throw new Error(`格式错误：${macroText}`); }

        // 2. 查找匹配的宏定义（按命名空间+宏名）
        const targetMacro = this.findMatchedMacro(namespace, macroName, paramText);
        if (!targetMacro) { throw new Error(`未找到匹配宏：${namespace ? `${namespace}.` : ''}${macroName}`); }
        // 示例：在expandMacro中调用findMatchedMacro后，填充默认值
        const inputParams = this.parseInputParams(paramText);
        const finalParams = [...inputParams];

        // 填充默认值（仅补充缺失的可选参数）
        for (let i = inputParams.length; i < targetMacro.params.length; i++) {
            const param = targetMacro.params[i];
            if (param.defaultValue) {
                finalParams.push(param.defaultValue); // 填充默认值
            } else {
                // 理论上不会走到这里，因为findMatchedMacro已保证输入≥必填数
                throw new Error(`参数 ${param.name} 为必填，未传入`);
            }
        }

        // 3. 构建参数映射表（宏参数名 → 输入参数值）
        const paramMap = this.buildParamMap(targetMacro.params, finalParams);
        // 4. 展开宏体所有语句
        return this.expandMacroBody(targetMacro, paramMap, namespace, macroName);
    }


    /**
     * 解析宏调用文本，提取基础信息（增强鲁棒性版）
     * 核心逻辑：
     * 1. 兼容无括号/不完整括号场景，优先提取有效信息
     * 2. 处理嵌套括号，精准拆分宏名和参数
     * 3. 即使输入不完整，也理性返回命名空间/宏名（而非空对象）
     * @param macroText 宏调用文本（支持完整/不完整格式：$foo.bar、$foo.bar()、$foo.bar(abc)、$foo.bar(abc$(x))）
     * @returns 解析结果（命名空间、宏名、参数文本）
     */
    public parseMacroCall(macroText: string): {
        namespace: string;
        macroName: string;
        paramText: string;
    } {
        // 边界处理：空文本直接返回空结果
        if (!macroText || typeof macroText !== 'string') {
            return { namespace: '', macroName: '', paramText: '' };
        }

        // 清洗文本（去除首尾空格）
        const cleanText = macroText.trim();
        // 去除开头的 $ 符号（核心：先提取宏名部分，再处理括号）
        const macroContent = cleanText.startsWith('$') ? cleanText.slice(1) : cleanText;

        // 找到第一个左括号位置（分割宏名和参数）
        const firstParenIdx = macroContent.indexOf('(');
        let macroNamePart = macroContent;
        let paramText = '';

        // 场景1：存在左括号（完整/不完整括号都处理）
        if (firstParenIdx !== -1) {
            // 提取宏名部分（$ 后到 ( 前的内容）
            macroNamePart = macroContent.slice(0, firstParenIdx).trim();

            // 提取参数部分：
            // - 有匹配的右括号：取 ( 和 ) 之间的内容
            // - 无匹配的右括号：取 ( 到文本末尾的内容（兼容不完整输入）
            const lastParenIdx = this.findMatchingClosingParen(macroContent, firstParenIdx);
            const paramEndIdx = lastParenIdx !== -1 ? lastParenIdx : macroContent.length;
            paramText = macroContent.slice(firstParenIdx + 1, paramEndIdx).trim();
        }

        // 场景2：无左括号（如 $foo.bar）→ 直接使用 macroContent 作为宏名部分，参数文本为空
        // 拆分命名空间和宏名（核心逻辑保留，兼容无命名空间场景：如 $bar → namespace=''，macroName='bar'）
        const [namespace, macroName] = this.splitNamespaceAndMacroName(macroNamePart);

        // 最终返回：即使参数文本不完整，也返回有效命名空间/宏名
        return {
            namespace: namespace.trim(),
            macroName: macroName.trim(),
            paramText: paramText.trim()
        };
    }

    /**
     * 查找参数个数匹配的宏定义（支持参数重载 + 参数默认值）
     * 匹配规则：
     * 1. 优先匹配参数数量完全一致的宏；
     * 2. 若输入参数数量 ≥ 宏的必填参数数量 且 ≤ 宏的总参数数量（含默认值参数），也视为匹配；
     * 3. 无默认值的参数为必填，有defaultValue的为可选。
     * @param namespace 宏命名空间（如 test）
     * @param macroName 宏名（如 scale_num）
     * @param paramText 参数文本（如 $(scoreboard), $(num)）
     * @returns 匹配的宏定义 | null
     * @throws 参数个数不匹配时抛出错误（明确必填/可选数量）
     */
    public findMatchedMacro(namespace: string, macroName: string, paramText: string) {
        // 从注册表获取指定命名空间+宏名的所有宏定义
        const macros = MacroRegistry.getInstance().getMacroByNameInNamespace(namespace, macroName);
        if (macros.length === 0) { return null; }

        // 解析输入参数个数（清洗空参数、处理嵌套括号）
        const inputParamCount = this.parseInputParams(paramText).length;

        // 步骤1：优先查找参数数量完全一致的宏（最优先匹配）
        let targetMacro = macros.find(macro => {
            return macro.params.length === inputParamCount;
        });

        // 步骤2：若无完全匹配的，查找支持默认值的兼容宏
        if (!targetMacro) {
            targetMacro = macros.find(macro => {
                // 计算该宏的必填参数数量（无默认值的参数）
                const requiredParamCount = macro.params.filter(param => !param.defaultValue).length;
                // 兼容条件：输入参数数 ≥ 必填数 且 ≤ 总参数数
                return inputParamCount >= requiredParamCount && inputParamCount <= macro.params.length;
            });
        }

        // 步骤3：无匹配的宏，抛出友好错误（提示必填/可选数量）
        if (!targetMacro) {
            // 整理所有重载的参数信息（必填数/总数）
            const overloadInfo = macros.map(macro => {
                const required = macro.params.filter(p => !p.defaultValue).length;
                const total = macro.params.length;
                return required === total ? `${total}个（必填）` : `${required}~${total}个（必填~总）`;
            }).join('/');

            throw new Error(
                `参数不匹配：输入了${inputParamCount}个参数，该宏的重载版本支持：${overloadInfo}，请检查参数数量`
            );
        }

        return targetMacro;
    }

    /**
     * 展开宏体所有语句
     * 核心逻辑：遍历宏体语句，分别处理命令语句和嵌套宏调用
     * @param targetMacro 匹配的宏定义
     * @param paramMap 参数映射表（宏参数名 → 输入值）
     * @param namespace 宏命名空间
     * @param macroName 宏名
     * @returns 展开后的宏体内容 | null
     * @throws 语句展开失败时抛出错误
     */
    private expandMacroBody(targetMacro: any, paramMap: Map<string, string>, namespace: string, macroName: string): string | null {
        const strBuilder = new StringBuilder();

        // 遍历宏体的每个语句
        targetMacro.body.statements.forEach((statement: any, stmtIndex: number) => {
            // 语句描述（用于错误提示，定位到具体语句）
            const stmtDesc = `${namespace ? `${namespace}.` : ''}${macroName} 第${stmtIndex + 1}句`;
            let expandedStmt: string | null = null;

            // 根据语句类型处理
            switch (statement.type) {
                case 'CommandStatement':
                    // 展开普通命令语句（替换参数引用）
                    expandedStmt = this.expandCommandStatement(statement, paramMap);
                    break;
                case 'MacroInvocation':
                    // 展开嵌套宏调用（递归）
                    expandedStmt = this.expandNestedMacro(statement, paramMap);
                    break;
                default:
                    // 不支持的语句类型
                    throw new Error(`不支持的语句类型：${(statement as any).type}`);
            }

            // 语句展开为空则抛出错误
            if (!expandedStmt) { throw new Error(`${stmtDesc} 展开为空`); }
            // 拼接展开后的语句（加换行）
            strBuilder.append(expandedStmt).append(LINE_BREAK);
        });

        // 去除末尾多余换行并返回
        return strBuilder.toString().trimEnd() || null;
    }

    /**
     * 展开命令语句（替换参数引用）
     * 核心逻辑：反向排序参数引用，避免短参数覆盖长参数（如 $(a1) 先于 $(a) 替换）
     * @param statement 命令语句节点
     * @param paramMap 参数映射表
     * @returns 替换后的命令字符串 | null
     */
    private expandCommandStatement(statement: { content: string; macroRefs: MacroParamRef[] }, paramMap: Map<string, string>): string | null {
        if (!statement.content) { return null; }
        // 反向排序参数引用（按参数名长度降序）
        const sortedRefs = [...statement.macroRefs].sort((a, b) => b.paramName.length - a.paramName.length);

        // 替换所有参数引用
        return sortedRefs.reduce((cmd, ref) => {
            const placeholder = `$(${ref.paramName})`;
            const replacement = paramMap.get(ref.paramName) || placeholder;
            // 全局替换（正则转义避免特殊字符报错）
            return cmd.replace(new RegExp(this.escapeRegExp(placeholder), 'g'), replacement);
        }, statement.content);
    }

    /**
     * 展开嵌套宏调用（递归）
     * 流程：构建嵌套宏文本 → 替换参数引用 → 递归展开
     * @param statement 嵌套宏调用节点
     * @param paramMap 参数映射表
     * @returns 展开后的嵌套宏内容 | null
     */
    private expandNestedMacro(statement: MacroInvocation, paramMap: Map<string, string>): string | null {
        // 1. 构建原始嵌套宏文本（如 $test.scale_num($(scoreboard), $(num))）
        let nestedText = this.buildMacroInvocationText(statement);
        // 2. 替换嵌套宏文本中的参数引用（如 $(scoreboard) → score1）
        nestedText = this.replaceParamRefs(nestedText, paramMap);
        // 3. 递归展开替换后的嵌套宏
        return this.expandMacro(nestedText);
    }

    /**
     * 回溯（折叠）宏展开内容：将带 #@macro 标记的展开内容恢复为原始宏调用
     * @param document 目标文档
     * @param showProgress 是否显示进度提示（默认：true）
     * @returns 操作是否成功（boolean）
     */
    /**
     * 回溯（折叠）宏展开内容：将带 #@macro 标记的展开内容恢复为原始宏调用
     * 修复点：解决宏调用含空格/逗号时参数被截断的问题
     * @param document 目标文档
     * @param showProgress 是否显示进度提示（默认：true）
     * @returns 操作是否成功（boolean）
     */
    public async foldMacro(
        document: vscode.TextDocument,
        showProgress: boolean = true
    ): Promise<boolean> {
        const edit = new vscode.WorkspaceEdit();
        let successCount = 0;
        let failCount = 0;

        // 进度处理回调
        const progressHandler = async (progress: vscode.Progress<{ message: string }>) => {
            let lineNum = 0;
            while (lineNum < document.lineCount) {
                if (showProgress) {
                    progress.report({ message: `回溯第 ${lineNum + 1}/${document.lineCount} 行` });
                }

                const line = document.lineAt(lineNum);
                // 🔥 修复正则：匹配完整的宏调用（支持括号内的空格/逗号）
                // 匹配规则：#@macro start: 开头 + 任意字符 + 括号闭合的完整宏调用
                const foldStartMatch = line.text.match(
                    new RegExp(`^\\s*${COMMENT_PREFIX}${MACRO_FOLD_MARKER} start: (\\$[^;]+?\\))`)
                );

                if (foldStartMatch) {
                    // 提取完整的原始宏调用文本（不再被空格截断）
                    const originalMacroCall = foldStartMatch[1].trim();
                    // 查找对应的结束标记行
                    const endLineNum = this.findFoldEndLine(document, lineNum, originalMacroCall);

                    if (endLineNum !== -1) {
                        // 提取原缩进（保持格式统一）
                        const indent = line.text.substring(0, line.text.indexOf(COMMENT_PREFIX));
                        // 构建替换范围（从开始标记到结束标记的所有行）
                        const foldRange = new vscode.Range(
                            lineNum, 0,
                            endLineNum, document.lineAt(endLineNum).text.length
                        );
                        // 替换为完整的原始宏调用（带缩进）
                        edit.replace(document.uri, foldRange, `${indent}${originalMacroCall}`);

                        successCount++;
                        // 跳过已处理的行
                        lineNum = endLineNum + 1;
                    } else {
                        // 无匹配的结束标记
                        vscode.window.showWarningMessage(`第${lineNum + 1}行未找到匹配的宏结束标记：${originalMacroCall}`);
                        failCount++;
                        lineNum++;
                    }
                } else {
                    // 非宏展开标记行，直接跳过
                    lineNum++;
                }
            }
        };

        // 执行进度处理
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '回溯宏调用',
            cancellable: true
        }, progressHandler);

        // 应用编辑并保存
        const applySuccess = await vscode.workspace.applyEdit(edit);
        if (applySuccess) {
            await document.save();
            vscode.window.showInformationMessage(
                `宏回溯完成：成功${successCount}处 | 失败${failCount}处`
            );
        } else {
            vscode.window.showErrorMessage('宏回溯失败：无法应用编辑');
        }

        return applySuccess;
    }

    /**
     * 辅助方法：查找宏展开结束标记行（兼容带空格/逗号的宏调用）
     * @param document 目标文档
     * @param startLineNum 开始标记行号
     * @param originalMacroCall 完整的原始宏调用文本
     * @returns 结束标记行号 | -1（未找到）
     */
    private findFoldEndLine(
        document: vscode.TextDocument,
        startLineNum: number,
        originalMacroCall: string
    ): number {
        // 构建结束标记匹配正则（转义宏调用中的特殊字符）
        const endMarkerPattern = `${COMMENT_PREFIX}${MACRO_FOLD_MARKER} end`;
        const endMarkerRegex = new RegExp(endMarkerPattern);

        // 从开始标记下一行开始查找
        for (let i = startLineNum + 1; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            if (lineText.match(endMarkerRegex)) {
                return i;
            }
            // 防止无限循环：遇到其他宏开始标记则终止
            if (lineText.match(new RegExp(`^\\s*${COMMENT_PREFIX}${MACRO_FOLD_MARKER} start:`))) {
                break;
            }
        }
        return -1;
    }

    // ---------------- 工具方法 ----------------

    /**
     * 解析输入参数（拆分括号外的逗号，清洗空值，剥离外层引号）
     * @param paramText 参数文本（如 $(scoreboard), "\"100\""）
     * @returns 清洗后的参数数组
     */
    private parseInputParams(paramText: string): string[] {
        return paramText
            .split(/,(?![^()]*\))/)
            .map(p => p.trim())
            .filter(Boolean)
            .map(p => this.parseStringLiteral(p));
    }
    /**
     * 构建参数映射表
     * @param paramDefs 宏定义的参数列表（如 [{name: 'scoreboard'}, {name: 'num'}]）
     * @param inputParams 输入参数数组（如 ['score1', '20']）
     * @returns 参数映射表（宏参数名 → 输入值）
     */
    private buildParamMap(paramDefs: { name: string }[], inputParams: string[]): Map<string, string> {
        const map = new Map<string, string>();
        // 遍历参数定义，构建映射关系
        paramDefs.forEach((p, i) => map.set(p.name, inputParams[i] || ''));
        return map;
    }

    /**
     * 替换文本中的参数引用（$(xxx) → 实际值）
     * @param text 待替换文本
     * @param paramMap 参数映射表
     * @returns 替换后的文本
     */
    private replaceParamRefs(text: string, paramMap: Map<string, string>): string {
        return text.replace(PARAM_REF_REGEX, (_, name) => {
            // 替换为实际值，无匹配则保留原引用
            return paramMap.get(name.trim()) || _;
        });
    }

    /**
     * 构建宏调用文本（AST 节点 → 字符串）
     * @param invocation 宏调用 AST 节点
     * @returns 宏调用文本（如 $test.scale_num(score1, 20)）
     */
    private buildMacroInvocationText(invocation: MacroInvocation): string {
        // 拼接命名空间+宏名
        const fullName = invocation.namespace
            ? `${invocation.namespace.join('.')}.${invocation.name}`
            : invocation.name;
        // 拼接参数
        const args = invocation.args.map(a => a.value).join(',');
        // 构建完整宏调用文本
        return `$${fullName}(${args})`;
    }

    /**
     * 查找匹配的闭合括号（处理嵌套括号）
     * 核心逻辑：括号计数法，避免被参数内的括号干扰
     * @param text 完整文本
     * @param openIndex 左括号位置
     * @returns 匹配的右括号位置 | -1（无匹配）
     */
    public findMatchingClosingParen(text: string, openIndex: number): number {
        if (openIndex === -1 || text[openIndex] !== '(') { return -1; }
        let count = 1; // 括号计数器（初始为1，对应左括号）
        for (let i = openIndex + 1; i < text.length; i++) {
            if (text[i] === '(') { count++; } // 嵌套左括号，计数+1
            else if (text[i] === ')') {
                count--; // 右括号，计数-1
                if (count === 0) { return i; } // 计数为0，找到匹配的右括号
            }
        }
        return -1; // 无匹配的右括号
    }

    /**
     * 拆分命名空间和宏名（兼容无命名空间场景）
     * @param part 宏名部分（如 test.scale_num / scale_num）
     * @returns [命名空间, 宏名]
     */
    private splitNamespaceAndMacroName(part: string): [string, string] {
        const dotIdx = part.lastIndexOf('.');
        // 无命名空间（如 scale_num）
        if (dotIdx === -1) { return ['', part.trim()]; }
        // 有命名空间（如 test.scale_num → 命名空间test，宏名scale_num）
        const namespace = part.slice(0, dotIdx).trim();
        const macroName = part.slice(dotIdx + 1).trim();
        return [namespace, macroName];
    }

    /**
     * 正则特殊字符转义
     * 避免替换参数引用时，特殊字符（如 $、(、)）导致正则报错
     * @param str 待转义字符串
     * @returns 转义后的字符串
     */
    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 适配VS Code扩展的字符串字面量解析（用户自主编写/运行，极简优先）
     * 核心：纯原生解析，无冗余校验，所有转义/引号由JS引擎处理
     * 场景：用户自负责的宏参数解析，无需安全兜底
     */
    private parseStringLiteral(paramValue: string): string {
        if (!paramValue) {return paramValue;}

        try {
            // 直接调用JS引擎原生解析字符串字面量，无任何额外逻辑
            return new Function(`return ${paramValue};`)();
        } catch (e) {
            // 仅做解析失败降级，避免扩展崩溃（比如用户写了未闭合的引号）
            console.warn(`宏参数字符串解析失败：${paramValue}，错误：${e}`);
            return paramValue;
        }
    }

}