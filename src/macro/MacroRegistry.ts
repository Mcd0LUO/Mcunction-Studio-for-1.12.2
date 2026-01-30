import * as vscode from 'vscode';
import { MacroDefinition } from './MacroAst';
import { rootDir } from '../extension';
import * as path from 'path';
import { MacroApply } from './MacroaApply';

/** 宏注册表（单例）- 聚焦「按命名空间查全量宏」 */
export class MacroRegistry {
    private static instance: MacroRegistry;
    /** 核心：命名空间 → 该空间下的所有宏（无需fullId，直接按命名空间分组） */
    private namespaceMacrosMap: Map<string, MacroDefinition[]> = new Map();
    /** 兜底：全局宏Map（通过fullId精准查单个，非必需） */
    private fullIdMap: Map<string, MacroDefinition> = new Map();
    private macroRootUri: vscode.Uri;
    private conflictStrategy: 'strict' | 'override' | 'ignore' = 'strict';

    private constructor() {
        this.macroRootUri = vscode.Uri.joinPath(rootDir, 'mcmacro');
    }

    public static getInstance(): MacroRegistry {
        if (!MacroRegistry.instance) {
            MacroRegistry.instance = new MacroRegistry();
        }
        return MacroRegistry.instance;
    }

    /**
     * 注册宏（自动按命名空间分组，无需关心fullId）
     * @param macro 宏定义
     * @param uri 宏文件路径（用于推导命名空间）
     */
    public registerMacro(macro: MacroDefinition, uri?: vscode.Uri): void {
        // 1. 推导命名空间（核心：分组的依据）
        const namespace = this.getUriNameSpace(uri ?? this.macroRootUri, this.macroRootUri);
        // 2. 生成fullId（仅用于全局去重，查询时完全不用）
        const fullId = `${namespace}.${macro.name}.${macro.params.map(p => p.paramType).join('|')}`;

        // 3. 冲突处理（避免重复注册）
        if (this.fullIdMap.has(fullId)) {
            switch (this.conflictStrategy) {
                case 'strict': throw new Error(`宏重复：${macro.name}（命名空间${namespace}）`);
                case 'ignore': return;
                case 'override': this.removeMacro(fullId, namespace); break;
            }
        }

        // 4. 补充宏的元信息（非必需，但便于后续使用）
        macro.namespace = namespace;
        macro.uid = fullId;
        macro.uri = uri;

        // 5. 核心：按命名空间分组存储（查询的关键）
        if (!this.namespaceMacrosMap.has(namespace)) {
            this.namespaceMacrosMap.set(namespace, []); // 初始化该命名空间的宏数组
        }
        this.namespaceMacrosMap.get(namespace)!.push(macro);
        this.fullIdMap.set(fullId, macro); // 全局去重用
    }

    /**
     * 🔥 核心方法：无需fullId，仅用命名空间获取所有宏
     * @param namespace 命名空间（如'test'/'builtin'）
     * @returns 该命名空间下所有宏定义（空数组=无）
     */
    public getMacrosByNamespace(namespace: string): MacroDefinition[] {
        // 直接返回该命名空间的宏数组，无需遍历、无需fullId
        return this.namespaceMacrosMap.get(namespace) ?? [];
    }

    /**
     * 🔥 扩展方法：获取所有命名空间（用于遍历/下拉选择等场景）
     * @returns 所有已注册的命名空间数组
     */
    public getAllNamespaces(): string[] {
        return Array.from(this.namespaceMacrosMap.keys());
    }

    /**
     * 🔥 扩展方法：获取命名空间下指定名称的所有宏（无需fullId）
     * @param namespace 命名空间
     * @param macroName 宏名（如'取百分比'）
     * @returns 匹配的宏数组（支持重载：同名不同参数类型）
     */
    public getMacroByNameInNamespace(namespace: string, macroName: string): MacroDefinition[] {
        return this.getMacrosByNamespace(namespace).filter(macro => macro.name === macroName);
    }

    /**
     * 🔥 扩展方法：获取命名空间下指定名称的宏（无需fullId）
     * @param namespace 命名空间
     * @param macroName 宏名（如'取百分比'）
     * @param n 参数个数
     * @returns 匹配的宏数组（支持重载：同名不同参数类型）
     */
    public getMacroByNameParamInNamespace(namespace: string, macroName: string, n: number): MacroDefinition | undefined {
        return this.getMacrosByNamespace(namespace).find(macro => macro.name === macroName && macro.params.length === n);
    }

    public getAllFullId(): string[] {
        return Array.from(this.fullIdMap.keys());
    }

    public getAllMacros(): MacroDefinition[] {
        return Array.from(this.fullIdMap.values());
    }

    public clearAll() {
        this.fullIdMap.clear();
        this.namespaceMacrosMap.clear();
    }

    


    // ---------------- 辅助方法（无需关注） ----------------
    private removeMacro(fullId: string, namespace: string): void {
        const macro = this.fullIdMap.get(fullId);
        if (!macro) {return;}
        // 从命名空间数组中删除
        this.namespaceMacrosMap.set(
            namespace,
            this.namespaceMacrosMap.get(namespace)!.filter(m => m.uid !== fullId)
        );
        // 空数组则删除命名空间
        if (this.namespaceMacrosMap.get(namespace)!.length === 0) {
            this.namespaceMacrosMap.delete(namespace);
        }
        this.fullIdMap.delete(fullId);
    }

    private getUriNameSpace(uri: vscode.Uri, root: vscode.Uri): string {
        const relativePath = path.relative(root.fsPath, uri.fsPath);
        const pathParts = relativePath.split(path.sep);
        return pathParts.length > 1 ? pathParts[0] : 'builtin';
    }

    public setConflictStrategy(strategy: 'strict' | 'override' | 'ignore'): void {
        this.conflictStrategy = strategy;
    }
}


/**
 * 注册mcfunction的运行/调试配置模板
 */
export function registerMcfunctionDebugConfigProvider(context: vscode.ExtensionContext) {
    // 注册“展开函数宏”命令
    const unfoldMacro = vscode.commands.registerCommand('mcf-studio.unfoldMacro', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'mcfunction') {
            vscode.window.showErrorMessage('请打开 .mcfunction 文件后再运行！');
            return;
        }
        MacroApply.getInstance().applyMacro(editor.document);

    });

    const foldMacro = vscode.commands.registerCommand('mcf-studio.foldMacro', () => { 
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'mcfunction') {
            vscode.window.showErrorMessage('请打开 .mcfunction 文件后再运行！');
            return;
        }
        MacroApply.getInstance().foldMacro(editor.document);
    });

    // 将命令加入插件生命周期，确保插件销毁时清理
    context.subscriptions.push(unfoldMacro, foldMacro);
}

