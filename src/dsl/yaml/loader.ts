/**
 * YAML 命令加载器 — 扫描 + 解析 + 转换 + 注册
 * 仅在 workspace reload 时触发，不监听文件变更。
 */
import * as vscode from 'vscode';
import { CompletionEngine } from '../engine';
import { RootNode, ForwardRootNode, JumpNode } from '../nodes';
import { literal, argument } from '../builder';
import * as yaml from 'js-yaml';
import { YamlCommandDef, YamlLiteral, YamlArgument, YamlForwardRoot, YamlJump, YamlForward, YamlExtractRule } from './types';
import { resolveSuggest } from './suggests';
import { registerExtractRule, unregisterCommandRules } from './extractor';

export class YamlCommandLoader {
    /** 追踪从 YAML 加载的命令名，reload 时先清除 */
    private static loadedCommands = new Set<string>();

    /**
     * 启动加载。
     * 1. 全局 YAML（扩展自带 out/dsl/global/）
     * 2. 用户 YAML（workspace .McfStudio/extra_command/，递归）
     */
    static async load(engine: CompletionEngine, rootDir: vscode.Uri, extensionPath: string): Promise<void> {
        // 1. 全局 YAML
        if (extensionPath) {
            const globalDir = vscode.Uri.joinPath(vscode.Uri.file(extensionPath), 'out', 'dsl', 'global');
            await YamlCommandLoader.scanDir(engine, globalDir);
        }

        // 2. 用户 YAML
        if (!rootDir) { return; }
        const extraDir = vscode.Uri.joinPath(rootDir, '.McfStudio', 'extra_command');
        try { await vscode.workspace.fs.stat(extraDir); }
        catch { return; }

        await YamlCommandLoader.reloadScan(engine, extraDir);

    }

    private static watcher: vscode.FileSystemWatcher | null = null;

    /** 重新加载用户 YAML（供 reloadWorkspace 命令调用） */
    static async reloadUser(engine: CompletionEngine, rootDir: vscode.Uri): Promise<void> {
        if (!rootDir) {
            console.warn('[YAML] reloadUser: rootDir 为 undefined');
            return;
        }
        const extraDir = vscode.Uri.joinPath(rootDir, '.McfStudio', 'extra_command');
        try { await vscode.workspace.fs.stat(extraDir); } catch {
            console.warn(`[YAML] reloadUser: 目录不存在 ${extraDir.fsPath}`);
            return;
        }
        console.log(`[YAML] 重新加载用户命令: ${extraDir.fsPath}`);
        await YamlCommandLoader.reloadScan(engine, extraDir);
    }

    // ================================================================
    // 内部
    // ================================================================

    /** 一次性扫描静态目录 */
    private static async scanDir(engine: CompletionEngine, dir: vscode.Uri): Promise<void> {
        try { await vscode.workspace.fs.stat(dir); }
        catch { return; }
        const yamls = await YamlCommandLoader.collectYaml(dir);
        let count = 0;
        for (const uri of yamls) {
            try {
                const raw = await vscode.workspace.fs.readFile(uri);
                const text = new TextDecoder('utf-8').decode(raw);
                const def = yaml.load(text) as YamlCommandDef;
                engine.register(YamlCommandLoader.convert(def));
                if (def.extract) { YamlCommandLoader.registerExtractRules(def.command, def.extract, uri.fsPath); }
                count++;
            } catch { /* skip bad files */ }
        }
        if (count > 0) { console.log(`[YAML] 从全局目录加载了 ${count} 条命令`); }
    }

    /** 清除旧用户 YAML → 递归扫描 → 注册 */
    private static async reloadScan(engine: CompletionEngine, dir: vscode.Uri): Promise<void> {
        for (const name of YamlCommandLoader.loadedCommands) {
            engine.unregister(name);
            unregisterCommandRules(name);
        }
        YamlCommandLoader.loadedCommands.clear();

        const yamls = await YamlCommandLoader.collectYaml(dir);
        let count = 0;
        for (const uri of yamls) {
            try {
                const raw = await vscode.workspace.fs.readFile(uri);
                const text = new TextDecoder('utf-8').decode(raw);
                const def = yaml.load(text) as YamlCommandDef;
                const root = YamlCommandLoader.convert(def);
                engine.register(root);
                YamlCommandLoader.loadedCommands.add(root.commandName);
                if (def.extract) { YamlCommandLoader.registerExtractRules(def.command, def.extract, uri.fsPath); }
                count++;
            } catch (err) {
                vscode.window.showWarningMessage(
                    `YAML 命令解析失败: ${uri.fsPath} — ${(err as Error).message}`
                );
            }
        }
        if (count > 0) {
            console.log(`[YAML] 加载了 ${count} 条用户命令: ${[...YamlCommandLoader.loadedCommands].join(', ')}`);
        }
    }

    /** 递归收集目录下所有 .yml 文件 */
    private static async collectYaml(dir: vscode.Uri): Promise<vscode.Uri[]> {
        const result: vscode.Uri[] = [];
        const stack = [dir];
        while (stack.length > 0) {
            const current = stack.pop()!;
            try {
                const entries = await vscode.workspace.fs.readDirectory(current);
                for (const [name, type] of entries) {
                    const uri = vscode.Uri.joinPath(current, name);
                    if (type === vscode.FileType.Directory) {
                        stack.push(uri);
                    } else if (type === vscode.FileType.File && name.endsWith('.yml')) {
                        result.push(uri);
                    }
                }
            } catch { /* skip */ }
        }
        return result;
    }

    /** YAML 命令定义 → DSL RootNode */
    private static convert(def: YamlCommandDef): RootNode {
        const root = new RootNode(def.command);
        if (def.description) { root.description = def.description; }
        if (def.children) { root.then(...def.children.map(YamlCommandLoader.convertNode)); }
        return root;
    }

    private static convertNode(
        node: YamlLiteral | YamlArgument | YamlForwardRoot | YamlJump | YamlForward
    ): import('../nodes').CommandNode {
        if ('jump' in node) { return new JumpNode(); }
        if ('forward_root' in node) { return new ForwardRootNode(); }
        if ('forward' in node) { return new ForwardRootNode(); } // 兼容旧语法
        if ('literal' in node) {
            const y = node as YamlLiteral;
            const lit = literal(y.literal.name);
            if (y.literal.description) { lit.description = y.literal.description; }
            if (y.literal.children) { lit.then(...y.literal.children.map(YamlCommandLoader.convertNode)); }
            return lit;
        }
        if ('argument' in node) {
            const y = node as YamlArgument;
            const suggest = resolveSuggest(y.argument.suggest);
            const arg = argument(y.argument.name, suggest, { optional: y.argument.optional ?? false });
            if (y.argument.children) { arg.then(...y.argument.children.map(YamlCommandLoader.convertNode)); }
            return arg;
        }
        throw new Error(`未知节点类型: ${JSON.stringify(node)}`);
    }

    private static registerExtractRules(command: string, rules: YamlExtractRule[], source: string): void {
        for (const rule of rules) { registerExtractRule(command, rule, source); }
    }
}
