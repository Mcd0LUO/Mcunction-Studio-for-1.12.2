import * as vscode from 'vscode';
import { MacroTokenizer } from './MacroTokenizer'; // 之前的词法分析器
import { McFunctionStatement } from './MacroAst';
import { MacroApply } from './MacroaApply';

/** 宏参数类型 */
export interface MacroParam {
    name: string;
    type: string; // 如 "score"
}

/** 宏定义信息（包含位置、内容、命名空间） */
export interface MacroDefinition {
    /** 宏完整标识：命名空间.宏名(参数1,参数2) */
    fullId: string;
    /** 宏名（如 c） */
    name: string;
    /** 命名空间（如 player.skill） */
    namespace: string;
    /** 参数列表 */
    params: MacroParam[];
    /** 参数签名（如 "a,b"，用于判断参数是否一致） */
    paramSignature: string;
    /** 宏体内容（AST节点） */
    body: McFunctionStatement[]; // 替换为你定义的McFunctionStatement[]类型
    /** 宏文件路径 */
    filePath: string;
    /** 宏定义在文件中的位置 */
    position: vscode.Position;
}

/** 宏注册表（单例） */
export class MacroRegistry {
    private static instance: MacroRegistry;
    /** 全局宏注册表：key=fullId，value=宏定义 */
    private macros: Map<string, MacroDefinition> = new Map();
    /** 冲突处理策略：strict=严格（报错），override=覆盖，ignore=忽略 */
    private conflictStrategy: 'strict' | 'override' | 'ignore' = 'strict';

    private constructor() { }

    /** 获取单例实例 */
    public static getInstance(): MacroRegistry {
        if (!MacroRegistry.instance) {
            MacroRegistry.instance = new MacroRegistry();
        }
        return MacroRegistry.instance;
    }

    /** 设置冲突处理策略 */
    public setConflictStrategy(strategy: 'strict' | 'override' | 'ignore'): void {
        this.conflictStrategy = strategy;
    }

    /** 注册宏定义 */
    public registerMacro(macro: MacroDefinition): boolean {
        const existing = this.macros.get(macro.fullId);
        // 无冲突，直接注册
        if (!existing) {
            this.macros.set(macro.fullId, macro);
            return true;
        }

        // 处理冲突
        switch (this.conflictStrategy) {
            case 'strict':
                vscode.window.showWarningMessage(
                    `宏冲突：${macro.fullId} 已在 ${existing.filePath} 中定义，当前文件 ${macro.filePath} 中的定义被忽略`
                );
                return false;
            case 'override':
                vscode.window.showInformationMessage(
                    `宏覆盖：${macro.fullId} 被 ${macro.filePath} 覆盖原有定义（${existing.filePath}）`
                );
                this.macros.set(macro.fullId, macro);
                return true;
            case 'ignore':
                return false;
        }
    }

    /** 根据命名空间+宏名+参数签名查找宏 */
    public getMacro(namespace: string, name: string, paramSignature: string): MacroDefinition | undefined {
        const fullId = `${namespace}.${name}(${paramSignature})`;
        return this.macros.get(fullId);
    }

    /** 获取所有宏定义 */
    public getAllMacros(): MacroDefinition[] {
        return Array.from(this.macros.values());
    }

    /**
     * 获取所有已注册的命名空间（去重）
     * @returns string[] 命名空间列表（如 ["default", "player", "player.skill"]）
     */
    public getAllNamespaces(): string[] {
        const namespaces = new Set<string>();
        // 遍历所有宏，提取namespace并去重
        this.macros.forEach(macro => {
            namespaces.add(macro.namespace);
        });
        // 转为数组返回，保持有序（可选：排序）
        return Array.from(namespaces).sort();
    }

    /**
     * 获取指定命名空间下的所有宏名（去重，忽略参数签名）
     * @param namespace 目标命名空间（如 "player"）
     * @returns string[] 宏名列表（如 ["c", "d"]）
     */
    public getMacroNamesByNamespace(namespace: string): string[] {
        const macroNames = new Set<string>();
        this.macros.forEach(macro => {
            // 匹配指定命名空间
            if (macro.namespace === namespace) {
                macroNames.add(macro.name);
            }
        });
        return Array.from(macroNames).sort();
    }

    /**
     * 扩展：获取指定命名空间下的所有宏定义（包含完整信息）
     * @param namespace 目标命名空间
     * @returns MacroDefinition[] 宏定义列表
     */
    public getMacrosByNamespace(namespace: string): MacroDefinition[] {
        const result: MacroDefinition[] = [];
        this.macros.forEach(macro => {
            if (macro.namespace === namespace) {
                result.push(macro);
            }
        });
        // 按宏名+参数签名排序，方便查看
        return result.sort((a, b) => {
            if (a.name !== b.name) {
                return a.name.localeCompare(b.name);
            }
            return a.paramSignature.localeCompare(b.paramSignature);
        });
    }

    public getMacroByNameSpaceAndName(namespace: string, name: string): MacroDefinition | null {
        for (const macro of this.macros.values()) {
            if (macro.namespace === namespace && macro.name === name) {
                return macro;
            }
        }
        return null;
    }

    /** 清空注册表（重新加载时调用） */
    public clear(): void {
        this.macros.clear();
    }
}



/**
 * 注册mcfunction的运行/调试配置模板
 */
export function registerMcfunctionDebugConfigProvider(context: vscode.ExtensionContext) {
    // 注册“运行 mcfunction 文件”命令（和package.json中的command ID对应）
    const runCommand = vscode.commands.registerCommand('mcf-studio.runFile', () => {
        // 仅做基础校验 + 提示（你可后续替换为自己的逻辑）
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'mcfunction') {
            vscode.window.showErrorMessage('请打开 .mcfunction 文件后再运行！');
            return;
        }
        MacroApply.getInstance().applyMacro(editor.document);

    });

    // 将命令加入插件生命周期，确保插件销毁时清理
    context.subscriptions.push(runCommand);
}

