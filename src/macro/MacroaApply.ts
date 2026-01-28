import * as vscode from 'vscode';
import { MacroRegistry } from './MacroRegistry';


export class MacroApply {
    private static instance: MacroApply;
    private constructor() {}
    public static getInstance(): MacroApply {
        if (!MacroApply.instance) {
            MacroApply.instance = new MacroApply();
        }
        return MacroApply.instance;
    }

    public async applyMacro(document: vscode.TextDocument): Promise<void> { 
        const edit = new vscode.WorkspaceEdit();
        // 遍历doc行
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text.trimStart();
            if (!text.startsWith('$')) {continue;}
            const newBody = this.replaceCommand(MacroApply.parseCommand(text));
            if (!newBody) { continue; }
            newBody.unshift(`#@macro ${text}`);
            const newString = newBody.join('\n');
            // 应用修改
            edit.replace(document.uri, line.range, newString);
            const success = await vscode.workspace.applyEdit(edit);

        }
    }

    /**
     * 宏展开核心逻辑：适配 McFunctionStatement 接口（content 字段）
     * @param commands 解析后的宏调用数组 [namespace, name, params[]]
     * @returns string[] | undefined 仅返回修改后的 content 字符串数组（不修改原宏）
     */
    public replaceCommand(commands: (string[] | string)[]): string[] | undefined {
        // 1. 基础校验
        if (commands.length <= 2) { return undefined; }
        const macro = MacroRegistry.getInstance().getMacroByNameSpaceAndName(commands[0] as string, commands[1] as string);
        if (!macro) { return undefined; }

        // 2. 类型&长度校验
        const params = commands[2] as string[];
        if (!Array.isArray(params) || macro.params.length !== params.length) { return undefined; }

        // 3. 直接处理并提取 content，无需创建完整的 McFunctionStatement 对象
        const expandedContent: string[] = macro.body.map((statement) => {
            // 先拷贝原始 content 避免修改原数据
            let content = statement.content;

            // 遍历所有参数，替换当前语句中的占位符
            macro.params.forEach((paramDef, index) => {
                const paramName = paramDef.name;
                const paramValue = params[index];
                const placeholderRegex = new RegExp(`\\$\\(${paramName}\\)`, 'g');
                content = content.replace(placeholderRegex, paramValue);
            });

            return content;
        });

        // 4. 直接返回仅包含修改后 content 的字符串数组
        return expandedContent;
    }

    /**
     * 解析宏调用字符串为按需拆分的数组（无冗余内容）
     * 规则：
     * - $test → ["test"]
     * - $test.foo → ["test.foo"]
     * - $test.foo.交换 → ["test.foo", "交换"]
     * - $test.foo.交换(a,b) → ["test.foo", "交换", ["a","b"]]
     * - $交换(a,b) → ["交换", ["a","b"]]
     * - $test.foo( → ["test", "foo", ""]（无闭合括号，加""标识输入参数阶段）
     * - $test.foo() → ["test", "foo", []]（有闭合括号，纯空参数为[]）
     * - $test.foo(a,) → ["test", "foo", ["a",""]]（保留末尾空占位符）
     * - $test.foo(,) → ["test", "foo", ["",""]]（保留所有空占位符）
     * @param text 宏调用字符串（支持中英文括号/逗号）
     * @returns 拆分后的数组（按需包含命名空间/宏名/参数）
     */
    public static parseCommand(text: string): string[] | (string | string[])[] {
        // 空值/非宏调用直接返回空数组
        if (!text || !text.startsWith('$')) {
            return [];
        }

        // 1. 去除前缀 $，清理首尾空格
        const content = text.slice(1).trim();
        if (!content) {
            return [];
        }

        const result: (string | string[])[] = [];
        let mainPart = content; // 命名空间+宏名部分（排除参数）
        let paramPart = "";     // 参数部分（括号内）
        let hasCloseBracket = false; // 标记是否有闭合括号

        // 2. 分离参数部分（兼容中英文括号）
        const paramStart = content.search(/[(（]/);
        if (paramStart !== -1) {
            mainPart = content.slice(0, paramStart).trim(); // 提取命名空间+宏名
            // 提取括号内的参数（到 ) 或 ）结束，兼容无闭合括号的情况
            const paramEnd = content.search(/[)）]/);
            hasCloseBracket = paramEnd !== -1; // 标记是否找到闭合括号

            if (hasCloseBracket) {
                paramPart = content.slice(paramStart + 1, paramEnd).trim();
            } else {
                paramPart = content.slice(paramStart + 1).trim(); // 无闭合括号，提取所有括号后内容
            }
        }

        // 3. 拆分命名空间和宏名（按最后一个 . 分割，无冗余）
        const lastDotIdx = mainPart.lastIndexOf('.');
        if (lastDotIdx === -1) {
            // 无 . → 整体作为一项（如 test / 交换）
            result.push(mainPart);
        } else {
            // 有 . → 前半部分（命名空间）+ 后半部分（宏名）
            result.push(mainPart.slice(0, lastDotIdx).trim());
            result.push(mainPart.slice(lastDotIdx + 1).trim());
        }

        // 4. 解析参数（关键修改：保留空参数占位符）
        if (paramStart !== -1) { // 只要有左括号，就添加参数相关项
            if (hasCloseBracket) {
                // 有闭合括号：区分纯空参数和带占位符的参数
                let params: string[];
                if (paramPart === "") {
                    // 纯空参数（()）→ 空数组
                    params = [];
                } else {
                    // 带占位符的参数（如a, / , / a,,b）→ 拆分后trim，保留空字符串
                    params = paramPart
                        .split(/[,，]/) // 兼容中英文逗号
                        .map(p => p.trim()); // 仅清理空格，不过滤空项
                }
                result.push(params);
            } else {
                // 无闭合括号：添加""表示处于输入参数阶段
                result.push("");
            }
        }

        return result;
    }

}