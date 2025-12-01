import * as vscode from 'vscode';

interface CommandsInfo {
    isExecute: boolean;       // 是否为 execute 命令
    isComplete: boolean;      // execute 是否完整（参数是否齐全）
    currentCommands: string[];// 当前命令片段
    paramStage: number;       // execute 未完整时的参数阶段（0-3：实体、x、y、z）
}


export class CommandUtils {
    // execute默认参数长度
    private static EXECUTE_PARAM_COUNT = 4;




    public static extraceActiveCommand(command: string): string[] {
        return this.findActiveCommand(this.extractCommand(command)).currentCommands;
    }

    /**
     * 从文本中提取MC命令片段（处理空格、引号、括号等特殊字符）
     * 增强版：正确处理JSON对象/数组、选择器方括号内部的空格，视为单个参数
     * 例如：解析 "tellraw @s {\"text\": \"内容\"}" → ["tellraw", "@s", "{\"text\": \"内容\"}"]
     * 例如：解析 "execute @a[tag=test] ~ ~ ~ say" → ["execute", "@a[tag=test]", "~", "~", "~", "say"]
     * @param text 待解析的文本（MC命令字符串）
     * @returns 命令片段数组（空输入返回空数组）
     */
    public static extractCommand(text: string): string[] {
        const result: string[] = [];
        let currentStart = 0; // 当前片段起始索引（替换原start，命名更直观）
        let isInQuotes = false; // 是否处于引号内
        let needEscapeNext = false; // 下一个字符是否需要转义

        // 状态管理：拆分对象为独立变量，更易读（避免嵌套访问）
        let isSelectorBracketOpen = false; // 选择器方括号 [ ] 是否打开（仅外层，非JSON内）
        let jsonObjectDepth = 0; // JSON对象 { } 嵌套深度（>0 表示处于JSON对象内）
        let jsonArrayDepth = 0; // JSON数组 [ ] 嵌套深度（>0 表示处于JSON数组内）

        // 辅助函数：减少重复逻辑（更新计数器，避免多次写Math.max(0, ...)）
        const decrementDepth = (depth: number) => Math.max(0, depth - 1);

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // 1. 处理转义字符（仅对引号生效，MC命令核心转义场景）
            if (needEscapeNext) {
                needEscapeNext = false;
                continue;
            }
            if (char === '\\') {
                needEscapeNext = true;
                continue;
            }

            // 2. 处理引号（切换引号内状态）
            if (char === '"' && !needEscapeNext) {
                isInQuotes = !isInQuotes;
                continue;
            }

            // 3. 处理特殊括号（仅当不在引号内时才更新状态）
            if (!isInQuotes) {
                // 选择器方括号 [ ]：仅当不在JSON结构内时生效
                const isInJson = jsonObjectDepth > 0 || jsonArrayDepth > 0;
                if (char === '[' && !isInJson) {
                    isSelectorBracketOpen = true;
                } else if (char === ']' && isSelectorBracketOpen) {
                    isSelectorBracketOpen = false;
                }

                // JSON对象 { } 深度管理
                if (char === '{') { jsonObjectDepth++; }
                if (char === '}') { jsonObjectDepth = decrementDepth(jsonObjectDepth); }

                // JSON数组 [ ] 深度管理（仅当不在选择器内时生效）
                if (char === '[' && !isSelectorBracketOpen) {
                    jsonArrayDepth++;
                }
                if (char === ']' && !isSelectorBracketOpen) {
                    jsonArrayDepth = decrementDepth(jsonArrayDepth);
                }
            }

            // 4. 空格分割逻辑：仅当不在任何特殊结构内时才分割
            const isInSpecialStructure = isInQuotes
                || isSelectorBracketOpen
                || jsonObjectDepth > 0
                || jsonArrayDepth > 0;

            if (char === ' ' && !isInSpecialStructure) {
                // 提取非空片段（跳过连续空格）
                const segment = text.slice(currentStart, i).trim();
                if (segment) { result.push(segment); }
                currentStart = i + 1; // 更新下一段起始索引
            }
        }

        // 5. 处理循环结束后的剩余片段
        const remainingSegment = text.slice(currentStart).trim();
        if (remainingSegment) { result.push(remainingSegment); }

        // 6. 保留结尾空格的语义（表示下一个参数位置，如 "say hello " → ["say", "hello", ""]）
        if (text.length > 0 && text.at(-1) === ' ' && currentStart >= text.length) {
            result.push('');
        }

        return result;
    }

    /**
 * 找到当前活跃的命令（最内层需要处理的命令）
 * 递归处理嵌套的 execute，直到找到未完整的 execute 或非 execute 命令
 * @param commands 原始命令片段数组
 * @returns 活跃命令信息（是否为 execute、是否完整、当前片段、参数阶段）
 */
    public static findActiveCommand(commands: string[]): CommandsInfo {
        let currentCommands = [...commands];

        while (true) {
            const commandName = currentCommands[0];

            // 非 execute 命令：直接作为活跃命令
            if (commandName !== 'execute') {
                return {
                    isExecute: false,
                    isComplete: true,
                    currentCommands,
                    paramStage: -1
                };
            }

            // 是 execute 命令：判断是否完整
            const isComplete = this.isExecuteComplete(currentCommands);
            if (!isComplete) {
                // 未完整的 execute：计算当前参数阶段
                const paramStage = this.getExecuteParamStage(currentCommands);
                return {
                    isExecute: true,
                    isComplete: false,
                    currentCommands,
                    paramStage
                };
            }

            // 已完整的 execute：跳过当前 execute，处理子命令
            currentCommands = currentCommands.slice(1 + this.EXECUTE_PARAM_COUNT);
        }
    }

    /**
 * 判断 execute 命令是否完整
 * 完整条件：长度 ≥ 5（含自身）且前4个参数（实体、x、y、z）均非空
 * @param commands 命令片段数组
 * @returns 是否完整
 */
    private static isExecuteComplete(commands: string[]): boolean {
        // 长度不足（至少需要 "execute <实体> <x> <y> <z>" → 5个片段）
        if (commands.length < 1 + this.EXECUTE_PARAM_COUNT) {
            return false;
        }

        // 检查前4个参数是否非空（排除空字符串或纯空格）
        for (let i = 1; i <= this.EXECUTE_PARAM_COUNT; i++) {
            if (!commands[i]?.trim()) {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取 execute 命令当前的参数阶段（未完整时有效）
     * 阶段定义：0=实体选择器，1=x坐标，2=y坐标，3=z坐标
     * @param commands 命令片段数组
     * @returns 参数阶段（0-3）
     */
    private static getExecuteParamStage(commands: string[]): number {
        for (let stage = 0; stage < this.EXECUTE_PARAM_COUNT; stage++) {
            const paramIndex = 1 + stage; // 参数索引：实体=1，x=2，y=3，z=4
            // 若参数未输入或为空，则当前阶段为该参数
            if (paramIndex >= commands.length || !commands[paramIndex]?.trim()) {
                return stage;
            }
        }
        return this.EXECUTE_PARAM_COUNT - 1; // 理论上不会触发
    }


    public static isFakePlayerSelector(selector: string): boolean {
        return !selector.startsWith('@');
    }
    // 获取文本中的选择器
    public static extractSelector(command: string): Map<string, string> | null {
        let startIdx = command.indexOf('@');
        if (startIdx === -1) {
            return null;
        }
        startIdx += 1;
        if (!["s", "p", "e", "r"].includes(command[startIdx])) {
            return null;
        }
        startIdx += 1;
        const selector_unsafe = command.slice(startIdx);
        const endIdx = selector_unsafe.indexOf(']');
        const selector = selector_unsafe.slice(0, endIdx);
        const params = selector.split(',');
        return new Map();

    }

    /**
     * 检查当前光标处是否处于选择器中
     * @param lineText 当前行文本
     * @param currentIdx 光标索引
     * @returns 是否处于选择器中
     */
    public static isInSelector(lineText: string, currentIdx: number): boolean {
        let startIdx = lineText.indexOf('@');
        let endIdx = lineText.indexOf(']',startIdx);

        return (startIdx !== -1 && startIdx <= currentIdx && endIdx >= currentIdx);
    }

    /**
     * 检查选择器是否为简单选择器（a/s/p/e/r）
     * @param selector 选择器
     * @returns 是否为简单选择器
     */
    public static isSimpleSelector(selector: string): boolean {
        return ['@a', '@s', '@p', '@e', '@r'].includes(selector);
    }

    /**
     * 获取当前光标处选择器的文本（支持含/不含[]的选择器）
     * @param lineText 当前行文本
     * @param cursorIdx 光标索引
     * @returns 选择器文本
     */
    public static getCursorFullSelector(lineText: string, cursorIdx: number): string | null {
        let selectorStartIdx = lineText.indexOf('@');

        while (selectorStartIdx !== -1 && selectorStartIdx < cursorIdx + 1) {
            // 检查选择器类型（a/s/p/e/r）
            const selectorType = lineText.charAt(selectorStartIdx + 1);
            if (!['a', 's', 'p', 'e', 'r'].includes(selectorType)) {
                selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
                continue;
            }

            // ===== 处理无[]的情况 =====
            // 确定选择器的结束位置：
            // 1. 若有[，则到[之前结束（无[]时）或到]结束（有[]时）；
            // 2. 若无[，则到行尾/空格/下一个非字母数字符号结束
            let selectorEndIdx: number;
            const bracketStartIdx = lineText.indexOf('[', selectorStartIdx);

            if (bracketStartIdx === -1) {
                // 无[]：选择器结束于下一个非字母数字字符/行尾
                selectorEndIdx = selectorStartIdx + 2; // 初始为@+类型（如@a）
                // 向后延伸，直到遇到非字母数字或行尾
                while (selectorEndIdx < lineText.length && /[a-zA-Z0-9_]/.test(lineText.charAt(selectorEndIdx))) {
                    selectorEndIdx++;
                }
            } else {
                // 有[：先找]的位置
                const bracketEndIdx = lineText.indexOf(']', bracketStartIdx);
                selectorEndIdx = bracketEndIdx === -1 ? bracketStartIdx : bracketEndIdx + 1;
            }

            // 判断光标是否在选择器范围内（@开始到选择器结束之间）
            if (selectorStartIdx <= cursorIdx && cursorIdx <= selectorEndIdx) {
                const selectorStr = lineText.substring(selectorStartIdx, selectorEndIdx).trim();
                return selectorStr;
            }

            // 光标不在当前选择器范围，找下一个@
            selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
        }
        return null;
    }

    /**
     * 获取当前光标处选择器的条件
     * @param lineText 当前行文本
     * @param cursorIdx 光标索引
     * @returns 选择器信息（选择器文本，选择器起始索引）
     */
    public static getCursorSelectorArgs(lineText: string, cursorIdx: number): [string, number] | null {
        let selectorStartIdx = lineText.indexOf('@');
        while (selectorStartIdx !== -1 && selectorStartIdx < cursorIdx) {
            // 检查选择器类型（a/s/p/e/r）
            const selectorType = lineText.charAt(selectorStartIdx + 1);
            if (!['a', 's', 'p', 'e', 'r'].includes(selectorType)) {
                selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
                continue;
            }

            // 找到选择器的[]范围
            const bracketStartIdx = lineText.indexOf('[', selectorStartIdx);
            if (bracketStartIdx === -1 || bracketStartIdx > cursorIdx) {
                selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
                continue;
            }
            const bracketEndIdx = lineText.indexOf(']', bracketStartIdx);
            if (bracketEndIdx === -1 || bracketEndIdx < cursorIdx) {
                selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
                continue;
            }

            // 光标在选择器的[]范围内，解析内部predicate
            const predicatesStr = lineText.substring(bracketStartIdx + 1, bracketEndIdx).trim();
            if (!predicatesStr) {
                selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);
                continue;
            }
            return [predicatesStr, bracketStartIdx];

        }
        return null;
    }

    /**
     * 获取当前光标处selector predicate的信息
     * @param lineText 当前行文本
     * @param cursorIdx 光标索引
     * @returns predicate信息（predicate文本，predicate起始索引，predicate结束索引）
     */
    public static getCursorPredicate(lineText: string, cursorIdx: number): [string, number, number] | null {
        let selectorStartIdx = lineText.indexOf('@');
        const selectorInfo = this.getCursorSelectorArgs(lineText, cursorIdx);
        if (!selectorInfo) { return null; }
        const [predicatesStr, bracketStartIdx] = selectorInfo;
        if (!predicatesStr) { return null; }
        const predicates = predicatesStr.split(',').map(p => p.trim()).filter(p => p);

        let currentPredicateStart = bracketStartIdx + 1;
        for (const predicate of predicates) {
            const actualPredicateStart = lineText.indexOf(predicate, currentPredicateStart);
            if (actualPredicateStart === -1) { break; }

            const actualPredicateEnd = actualPredicateStart + predicate.length;
            if (cursorIdx >= actualPredicateStart && cursorIdx <= actualPredicateEnd) {
                return [predicate, actualPredicateStart, actualPredicateEnd];
            }

            currentPredicateStart = actualPredicateEnd + 1;
        }

        selectorStartIdx = lineText.indexOf('@', selectorStartIdx + 1);

        return null; 
    }

    public static getSelectorMap(selector: string): Map<string, any> | null {
        const args = selector.split(',');
        return new Map(args.map(arg => {
            const [key, value] = arg.split('=');
            return [key, value];
        }));
    }

}