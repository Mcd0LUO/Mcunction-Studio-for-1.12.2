import * as vscode from 'vscode';
import { CommandRegistry } from './core/CommandRegistry';
import { MinecraftCompletionProvider } from './completionProvider/Minecraft';
import { DataLoader } from './core/DataLoader';
import { MinecraftUtils } from './utils/MinecraftUtils';
import { McFunctionSignatureHelpProvider, registerSignatureHelp } from './core/Signature';
import { registerCodeLens } from './core/CodeLens';
import { registerFunctionDefinitionProvider } from './core/McFunctionDefinitionProvider';
import { registerHoverProvider } from './core/HoverProvider';
import { DynamicDocManager } from './core/DynamicDocManager';

export let rootDir: vscode.Uri;

export function activate(context: vscode.ExtensionContext) {
	// 获取data目录
	rootDir = MinecraftUtils.getRootDir();
	// 注册代码补全提供者
	const code_provider = vscode.languages.registerCompletionItemProvider(
		'mcfunction',
		MinecraftCompletionProvider.instance,
		' ', '[', ',', '=','.', '{'
	);
	context.subscriptions.push(code_provider);

	// 注册命令
	CommandRegistry.autoRegisterProviders(context);
	// 读取函数数据
	const dataloader =  DataLoader.getInstance();
	// 注册嵌入提示
	// 注册Signature Help
	registerSignatureHelp();
	// 注册CodeLens 快速命令
	registerCodeLens();
	// 注册定义跳转
	registerFunctionDefinitionProvider(context);
	// 注册Hover
	registerHoverProvider(context);
	// 注册文档管理
	const docManager = DynamicDocManager.getInstance();



}


export function deactivate() {

}
