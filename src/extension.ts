import * as vscode from 'vscode';
import { CommandRegistry } from './core/CommandRegistry';
import { MinecraftCompletionProvider } from './completionProvider/Minecraft';
import { DataLoader } from './core/DataLoader';
import { MinecraftUtils } from './utils/MinecraftUtils';
import {  registerSignatureHelp } from './core/Signature';
import { registerConfigFileCodeLens } from './core/CodeLens';
import { registerFunctionDefinitionProvider } from './core/McFunctionDefinitionProvider';
import { registerHoverProvider } from './core/HoverProvider';
import { DynamicDocManager } from './core/DynamicDocManager';
import { LinePreviewManager } from './core/LinePreviewManager';
import { VsCommandProcessor } from './core/VsCommandProcessor';

export let rootDir: vscode.Uri;

export function activate(context: vscode.ExtensionContext) {
	// 获取data目录
	rootDir = MinecraftUtils.getRootDir();
	// 注册代码补全提供者
	const code_provider = vscode.languages.registerCompletionItemProvider(
		'mcfunction',
		MinecraftCompletionProvider.instance,
		' ', '[', ',', '=','.', '{','"'
	);
	context.subscriptions.push(code_provider);

	// 读取函数数据
	const dataloader =  DataLoader.getInstance();
	// 注册命令
	CommandRegistry.autoRegisterProviders(context);
	// 注册Signature Help
	registerSignatureHelp();
	// 注册CodeLens 快速命令
	registerConfigFileCodeLens(context);
	// 注册定义跳转
	registerFunctionDefinitionProvider(context);
	// 注册Hover
	registerHoverProvider(context);
	// 注册文档管理
	const docManager = DynamicDocManager.getInstance();
	// 注册编辑器命令
	context.subscriptions.push(
		// 重载工作区
		vscode.commands.registerCommand('mcf-studio.reloadWorkspace', async () => {
			await dataloader.loadExtensionConfig();
			dataloader.loadData(true,dataloader.getConfig().FileProcessing.MaxConcurrentReads);
		}),
		// 新建函数文件
		vscode.commands.registerCommand('mcf-studio.createFunctionFile', VsCommandProcessor.createNewFunctionFile),
		// 快速debug tellraw
		vscode.commands.registerCommand('mcf-studio.fastScoreboardDebug', VsCommandProcessor.fastScoreboardDebug)
	);
	// 注册json预览
	const linePre = new LinePreviewManager(); 
	// 注册辅助命令
	vscode.commands.registerCommand('mcf-studio.checkDocCache', () => {
		const docCache = dataloader.getDocCache().get(MinecraftUtils.buildFunctionCall(vscode.workspace.textDocuments[0].uri)??'');
		if (!docCache) {
			console.log('no cache');
			return;
		}
		// 遍历docCache
		for (const [key, value] of docCache) {
			console.log(key + 1,value);
		}
		
	});



}


export function deactivate() {

}
