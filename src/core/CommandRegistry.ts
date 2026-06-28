import { join } from 'path';
import { BaseCompletionProvider } from '../completionProvider/Base';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';

export class CommandRegistry {
    private static providers: Map<string, BaseCompletionProvider> = new Map();

    // 注册命令提供者
    static register(command: string, provider: BaseCompletionProvider) {
        this.providers.set(command, provider);
    }

    // 获取命令提供者
    static getProvider(command: string): BaseCompletionProvider | undefined {
        return this.providers.get(command);
    }

    // 获取所有根命令
    static getRootCommands(): string[] {
        return Array.from(this.providers.keys());
    }

        /**
     * 自动注册命令提供者（优化：异步加载，支持子目录）
     * subDirs 中 '' 表示 command/ 根目录，其余为子目录名
     */
    static async autoRegisterProviders(context: vscode.ExtensionContext) {
        const commandDir = join(context.extensionPath, 'out', 'completionProvider', 'command');
        // 相对于 command/ 的子目录列表（可扩展）
        const subDirs: string[] = ['vanilla', 'easycber'];

        for (const subDir of subDirs) {
            const providerDir = subDir ? join(commandDir, subDir) : commandDir;
            try {
                const files = await fs.readdir(providerDir);
                for (const file of files) {
                    if (!file.endsWith('.js')) { continue; }
                    const fileName = file.slice(0, -3);
                    const importPath = subDir
                        ? `../completionProvider/command/${subDir}/${file}`
                        : `../completionProvider/command/${file}`;
                    const module = await import(importPath);
                    const providerClass = module[`${fileName}CompletionProvider`];
                    if (providerClass) {
                        CommandRegistry.register(fileName.toLowerCase(), new providerClass());
                    }
                }
            } catch (error) {
                console.error(`自动注册命令提供者时出错 (${subDir || 'command'})：`, error);
            }
        }
    }
}
