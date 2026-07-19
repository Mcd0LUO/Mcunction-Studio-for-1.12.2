import * as vscode from 'vscode';
import { MinecraftCompletionProvider } from './completionProvider/Minecraft';
import { DataLoader } from './core/DataLoader';
import { MinecraftUtils } from './utils/MinecraftUtils';
import { registerSignatureHelp } from './core/Signature';
import { registerConfigFileCodeLens } from './core/CodeLens';
import { registerFunctionDefinitionProvider } from './core/McFunctionDefinitionProvider';
import { registerHoverProvider } from './core/HoverProvider';
import { DynamicDocManager } from './core/DynamicDocManager';
import { LinePreviewManager } from './core/LinePreviewManager';
import { VsCommandProcessor } from './core/VsCommandProcessor';
import { CompletionEngine } from './dsl/engine';
import { registerDemoCommands } from './dsl/demo';
import { YamlCommandLoader } from './dsl/yaml/loader';


export let rootDir: vscode.Uri;

export function activate(context: vscode.ExtensionContext) {
	// 获取data目录
	rootDir = MinecraftUtils.getRootDir();
	console.log('[McfunctionStudio] rootDir 已设置', rootDir.fsPath);

	// 注册代码补全提供者
	const code_provider = vscode.languages.registerCompletionItemProvider(
		'mcfunction',
		MinecraftCompletionProvider.instance,
		' ', '[','(', ',', '=','.', '{','"','$'
	);
	context.subscriptions.push(code_provider);

	// 读取函数数据（init() 必须在 rootDir 设置后调用）
	const dataloader =  DataLoader.getInstance();
	dataloader.init();
	// 注册命令

	// 初始化 DSL 引擎 + 注册 Demo 命令
	const engine = new CompletionEngine(dataloader);
	registerDemoCommands(engine);
	YamlCommandLoader.load(engine, rootDir, context.extensionPath);
	// 注册 YAML 命令文件补全
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
			// forceFull=false：按 mtime 增量跳过未改文件
			await dataloader.loadData(true, dataloader.getConfig().FileProcessing.MaxConcurrentReads, false);
			await YamlCommandLoader.reloadUser(engine, rootDir);
		}),
		// 新建函数文件
		vscode.commands.registerCommand('mcf-studio.createFunctionFile', VsCommandProcessor.createNewFunctionFile),
		// 快速debug tellraw
		vscode.commands.registerCommand('mcf-studio.fastScoreboardDebug', VsCommandProcessor.fastScoreboardDebug),
		// DSL 调试：切换管线日志
		vscode.commands.registerCommand('mcf-studio.toggleDslDebug', () => {
			CompletionEngine.debug = !CompletionEngine.debug;
			vscode.window.showInformationMessage(`DSL 管线日志: ${CompletionEngine.debug ? 'ON' : 'OFF'}（查看 Developer Tools Console）`);
		})
	);
	// 注册json预览
	const linePre = new LinePreviewManager(); 

}


export function deactivate() {

}
