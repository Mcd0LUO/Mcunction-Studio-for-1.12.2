/**
 * YAML 命令加载器 — 扫描 + 解析 + 转换 + 注册 + 热重载
 */
import * as vscode from 'vscode';
import { CompletionEngine } from '../engine';
import { RootNode, ForwardNode } from '../nodes';
import { literal, argument } from '../builder';
import * as yaml from 'js-yaml';
import { YamlCommandDef, YamlLiteral, YamlArgument } from './types';
import { resolveSuggest } from './suggests';

export class YamlCommandLoader {
    private static dirWatcher: vscode.FileSystemWatcher | null = null;
    /** 追踪从 YAML 加载的命令名，热重载时先清除 */
    private static loadedCommands = new Set<string>();

    /**
     * 启动：扫描 rootDir/commands/*.yml，加载命令并监听文件变更热重载。
     */
    static async load(engine: CompletionEngine, rootDir: vscode.Uri): Promise<void> {
        if (!rootDir) { return; }

        const commandsDir = vscode.Uri.joinPath(rootDir, 'commands');

        // 检查目录是否存在
        try { await vscode.workspace.fs.stat(commandsDir); }
        catch { return; } // 目录不存在，静默跳过

        // 初始扫描
        await YamlCommandLoader.reloadAll(engine, commandsDir);

        // 热重载：监听 YAML 文件的增/删/改
        YamlCommandLoader.dirWatcher?.dispose();
        const pattern = new vscode.RelativePattern(commandsDir, '**/*.yml');
        YamlCommandLoader.dirWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const onReload = () => YamlCommandLoader.reloadAll(engine, commandsDir);
        YamlCommandLoader.dirWatcher.onDidCreate(onReload);
        YamlCommandLoader.dirWatcher.onDidChange(onReload);
        YamlCommandLoader.dirWatcher.onDidDelete(onReload);

        console.log('[YAML] 热重载已启用，监听 data/commands/*.yml');
    }

    /** 清除旧 YAML 命令 → 重新扫描 → 注册新命令 */
    private static async reloadAll(engine: CompletionEngine, dir: vscode.Uri): Promise<void> {
        // 1. 清除上次加载的 YAML 命令
        for (const name of YamlCommandLoader.loadedCommands) {
            engine.unregister(name);
        }
        YamlCommandLoader.loadedCommands.clear();

        // 2. 重新扫描
        try {
            const files = await vscode.workspace.fs.readDirectory(dir);
            let count = 0;

            for (const [name, type] of files) {
                if (type !== vscode.FileType.File || !name.endsWith('.yml')) { continue; }

                const fileUri = vscode.Uri.joinPath(dir, name);
                const raw = await vscode.workspace.fs.readFile(fileUri);
                const text = new TextDecoder('utf-8').decode(raw);

                try {
                    const def = yaml.load(text) as YamlCommandDef;
                    const root = YamlCommandLoader.convert(def);
                    engine.register(root);
                    YamlCommandLoader.loadedCommands.add(root.commandName);
                    count++;
                } catch (err) {
                    vscode.window.showWarningMessage(
                        `YAML 命令解析失败: ${name} — ${(err as Error).message}`
                    );
                }
            }

            if (count > 0) {
                console.log(`[YAML] 加载了 ${count} 条命令: ${[...YamlCommandLoader.loadedCommands].join(', ')}`);
            }
        } catch (err) {
            console.error('[YAML] 扫描目录失败', err);
        }
    }

    /** YAML 命令定义 → DSL RootNode */
    private static convert(def: YamlCommandDef): RootNode {
        const root = new RootNode(def.command);
        if (def.description) { root.description = def.description; }
        if (def.children) {
            root.then(...def.children.map(YamlCommandLoader.convertNode));
        }
        return root;
    }

    private static convertNode(node: YamlLiteral | YamlArgument | { forward: true }): import('../nodes').CommandNode {
        if ('forward' in node) { return new ForwardNode(); }
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
}
