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
     * 自动注册命令提供者（优化：异步加载）
     */
    static async autoRegisterProviders(context: vscode.ExtensionContext) {
        const providerDir = join(context.extensionPath, 'out', 'completionProvider', 'command');
        try {
            // 异步读取目录，避免阻塞
            const files = await fs.readdir(providerDir);
            for (const file of files) {
                if (!file.endsWith('.js')) {continue;};
                // 动态导入改为异步
                const fileName = file.slice(0, -3);
                // console.log(fileName);
                const module = await import(`../completionProvider/command/${file}`);
                const providerClass = module[`${fileName}CompletionProvider`];
                if (providerClass) {
                    CommandRegistry.register(fileName.toLowerCase(), new providerClass());
                }

            }
        } catch (error) {
            console.error('自动注册命令提供者时出错：', error);
        }
    }
}
