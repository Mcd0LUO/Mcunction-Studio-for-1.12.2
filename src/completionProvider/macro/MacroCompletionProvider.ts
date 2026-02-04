import {
    CancellationToken,
    CompletionContext,
    CompletionItem,
    CompletionItemKind,
    Position,
    TextDocument,
    Range
} from "vscode";
import { MacroManager } from "../../macro/MacroManager";
import { BaseCompletionProvider } from "../Base";
import { MinecraftCompletionProvider } from "../Minecraft";
import * as vscode from 'vscode';
import { MacroApply } from "../../macro/MacroaApply";

/**
 * 宏调用补全提供器
 * 功能：
 * 1. 匹配以 $ 开头的宏调用，补全宏名（支持命名空间+宏名）
 * 2. 补全宏参数提示（显示参数名+类型）
 * 3. 精准匹配参数位置，支持参数级别的补全
 */
export class MacroCompletionProvider {
    // 宏调用关键字（$ 开头）
    protected commandKeyword: string = '$';
    // 单例实例
    private static instance: MacroCompletionProvider;
    // 补全项创建器（复用Minecraft的创建逻辑）
    private completionCreator: CallableFunction = MinecraftCompletionProvider.instance.createCompletionItem;

    // 私有构造函数（单例模式）
    private constructor() { }

    /**
     * 获取单例实例
     */
    public static getInstance(): MacroCompletionProvider {
        if (!MacroCompletionProvider.instance) {
            MacroCompletionProvider.instance = new MacroCompletionProvider();
        }
        return MacroCompletionProvider.instance;
    }

    /**
     * 核心方法：提供宏补全项
     * @param document 当前文档
     * @param position 光标位置
     * @param token 取消令牌
     * @param context 补全上下文
     * @param text 光标所在行的文本（预处理后的）
     * @returns 补全项数组
     */
    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken,
        context: CompletionContext,
        text: string
    ): Promise<CompletionItem[]> {
        // 过滤非宏调用的场景（不以 $ 开头则返回空）
        const trimText = text.trimStart();
        if (!trimText.startsWith(this.commandKeyword)) {
            return [];
        }

        // 解析当前宏调用的输入状态（宏名/参数阶段）
        const {
            isInMacroNamePhase,  // 是否在输入宏名阶段（未输入 (）
            isInParamPhase,      // 是否在输入参数阶段（已输入 (）
            macroNamePrefix,     // 宏名前缀（如 test.set_）
            namespacePrefix,     // 命名空间前缀（如 test.）
            paramIndex,          // 当前输入的参数索引
            paramText            // 参数文本
        } = this.parseMacroInputState(trimText);

        // 根据不同阶段提供补全项
        if (isInMacroNamePhase) {
            // 阶段1：补全宏名（支持命名空间过滤）
            return this.provideMacroNameCompletions(macroNamePrefix, namespacePrefix, document, position);
        } else if (isInParamPhase) {
            // 阶段2：补全宏参数（根据当前参数索引提示）
            // return this.provideMacroParamCompletions(macroNamePrefix, paramIndex, document, position);
        }

        return [];
    }

    /**
     * 解析宏输入状态（区分宏名/参数阶段）
     * @param trimText 预处理后的行文本
     * @returns 输入状态对象
     */
    private parseMacroInputState(trimText: string): {
        isInMacroNamePhase: boolean;
        isInParamPhase: boolean;
        macroNamePrefix: string;
        namespacePrefix: string;
        paramIndex: number;
        paramText: string;
    } {
        // 移除开头的 $ 符号
        const macroInput = trimText.substring(1);
        // 查找第一个 ( 的位置
        const leftParenIndex = macroInput.indexOf("(");
        // 查找匹配的 ) 位置（处理嵌套括号）
        const rightParenIndex = MacroApply.getInstance().findMatchingClosingParen(macroInput, leftParenIndex);

        // 阶段1：未输入 (，处于宏名输入阶段
        if (leftParenIndex === -1) {
            // 拆分命名空间和宏名前缀（如 test.set_num → 命名空间test，宏名set_num）
            const lastDotIndex = macroInput.lastIndexOf(".");
            const namespacePrefix = lastDotIndex > -1 ? macroInput.substring(0, lastDotIndex + 1) : "";
            const macroNamePrefix = lastDotIndex > -1 ? macroInput.substring(lastDotIndex + 1) : macroInput;

            return {
                isInMacroNamePhase: true,
                isInParamPhase: false,
                macroNamePrefix: macroNamePrefix.trim(),
                namespacePrefix: namespacePrefix.trim(),
                paramIndex: -1,
                paramText: ""
            };
        }

        // 阶段2：已输入 (，处于参数输入阶段
        const macroNamePrefix = macroInput.substring(0, leftParenIndex).trim();
        const paramText = macroInput.substring(
            leftParenIndex + 1,
            rightParenIndex === -1 ? macroInput.length : rightParenIndex
        ).trim();

        // 计算当前输入的参数索引（拆分括号外的逗号）
        const paramParts = paramText.split(/,(?![^()]*\))/).map(p => p.trim());
        const paramIndex = paramText.endsWith(",")
            ? paramParts.length  // 末尾是逗号，下一个参数
            : paramParts.length - 1; // 否则是当前参数

        return {
            isInMacroNamePhase: false,
            isInParamPhase: true,
            macroNamePrefix,
            namespacePrefix: "", // 参数阶段无需命名空间前缀
            paramIndex,
            paramText
        };
    }

    /**
     * 提供宏名补全项（支持前缀过滤）
     * @param macroNamePrefix 宏名前缀（如 set_）
     * @param namespacePrefix 命名空间前缀（如 test.）
     * @returns 宏名补全项数组
     */
    private provideMacroNameCompletions(macroNamePrefix: string, namespacePrefix: string, document: vscode.TextDocument, position: vscode.Position): CompletionItem[] {
        const completions: CompletionItem[] = [];
        const macroRegistry = MacroManager.getInstance();

        // 获取所有宏定义（过滤命名空间前缀）
        const allMacros = macroRegistry.getAllMacros().filter(macro => {
            // 拼接完整宏名（命名空间.宏名）
            const fullMacroName = macro.namespace
                ? `${macro.namespace}.${macro.name}`
                : macro.name;
            // 过滤条件：包含命名空间前缀 + 宏名前缀
            return fullMacroName.startsWith(`${namespacePrefix}${macroNamePrefix}`);
        });
        // 生成补全项
        allMacros.forEach(macro => {
            const fullMacroName = macro.namespace
                ? `${macro.namespace}.${macro.name}`
                : macro.name;
            completions.push(
                MinecraftCompletionProvider.instance.createCompletionItem(
                    fullMacroName,
                    macro.docComment? macro.docComment : "",
                    fullMacroName,
                    true,
                    vscode.CompletionItemKind.Function,
                    MinecraftCompletionProvider.instance.getWordRange(document, position, 1),

                )
            );

        });

        return completions;
    }

    /**
     * 提供宏参数补全项（根据参数索引提示）
     * @param macroFullName 宏完整名称（如 test.set_num）
     * @param paramIndex 当前参数索引
     * @param document 当前文档
     * @param position 光标位置
     * @returns 参数补全项数组
     */
    private provideMacroParamCompletions(
        macroFullName: string,
        paramIndex: number,
        document: TextDocument,
        position: Position
    ): CompletionItem[] {
        const completions: CompletionItem[] = [];
        const macroRegistry = MacroManager.getInstance();

        // 拆分命名空间和宏名
        const [namespace, macroName] = this.splitNamespaceAndMacroName(macroFullName);
        // 获取宏定义
        const macros = macroRegistry.getMacroByNameInNamespace(namespace, macroName);
        if (macros.length === 0) {
            return [];
        }

        // 取第一个匹配的宏（参数个数匹配优先）
        const targetMacro = macros[0];
        // 检查参数索引是否有效
        if (paramIndex < 0 || paramIndex >= targetMacro.params.length) {
            return [];
        }

        // 获取当前参数定义
        const currentParam = targetMacro.params[paramIndex];
        // 生成参数补全项
        const completion = new CompletionItem(
            `${currentParam.name}`, // 参数占位符格式
            CompletionItemKind.Variable // 参数作为变量类型展示
        );

        completion.range = this.getExactParamRange(document, position);

        completions.push(completion);
        return completions;
    }

    /**
     * 精准匹配参数范围（优化版）
     * @param document 文本文档
     * @param position 光标位置
     * @param customRegex 自定义正则（默认匹配参数占位符）
     * @returns 精准的参数Range
     */
    private getExactParamRange(
        document: TextDocument,
        position: Position,
        customRegex: RegExp = /\$\([^)]+\)|[^(,，\s)\）]+/
    ): Range | undefined {
        // 调整光标位置（确保准确性）
        const adjustedPosition = position.with(position.line, position.character);
        // 获取当前单词范围（匹配参数占位符或普通参数）
        let paramRange = document.getWordRangeAtPosition(adjustedPosition, customRegex);

        // 空参数场景：返回光标位置的空Range
        if (!paramRange) {
            paramRange = new Range(adjustedPosition, adjustedPosition);
        }

        return paramRange;
    }

    /**
     * 拆分命名空间和宏名（复用逻辑）
     * @param fullName 完整宏名（如 test.set_num）
     * @returns [命名空间, 宏名]
     */
    private splitNamespaceAndMacroName(fullName: string): [string, string] {
        const lastDotIndex = fullName.lastIndexOf(".");
        if (lastDotIndex === -1) {
            return ["", fullName.trim()];
        }
        return [
            fullName.substring(0, lastDotIndex).trim(),
            fullName.substring(lastDotIndex + 1).trim()
        ];
    }
}