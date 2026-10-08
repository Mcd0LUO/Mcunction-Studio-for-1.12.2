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
import { registerDiagnostics, onIndexReady } from './core/diagnostics/vscodeAdapter';
import { setRootDir, rootDir } from './core/paths';

// rootDir 的实际持有者是 core/paths（无副作用模块）。
// 此处仅转出以保持对外 API 不变；core/ 下的模块一律直接 import paths，
// 不再反向依赖本文件，从而断开 DataLoader ↔ extension 的循环依赖。
export { rootDir } from './core/paths';

export function activate(context: vscode.ExtensionContext) {
	// 定位数据包根目录（data/functions）。
	// 这一步可能失败（未打开工作区、打开的不是数据包目录）——此时**不能抛异常**：
	// 抛出会让 activate 整体中断，扩展表现为「完全没反应」。
	// 正确做法是照常注册各类 provider，让补全/Hover/跳转仍可用（只是没有项目数据），
	// 并给出一次明确的提示。
	let rootDirError: string | null = null;
	try {
		setRootDir(MinecraftUtils.getRootDir());
		console.log('[McfunctionStudio] rootDir 已设置', rootDir?.fsPath);
	} catch (err) {
		rootDirError = (err as Error).message;
		console.warn('[McfunctionStudio] 未能定位 data 目录：', rootDirError);
	}

	// 注册代码补全提供者
	const code_provider = vscode.languages.registerCompletionItemProvider(
		'mcfunction',
		MinecraftCompletionProvider.instance,
		' ', '[','(', ',', '=','.', '{','"','$'
	);
	context.subscriptions.push(code_provider);

	// 读取函数数据（init() 必须在 rootDir 设置后调用；无 rootDir 时跳过）
	const dataloader = DataLoader.getInstance();
	if (rootDir) {
		dataloader.init();
	}

	// 初始化 DSL 引擎 + 注册 Demo 命令
	const engine = new CompletionEngine(dataloader);
	// 显式装配为「当前引擎」：补全调度层据此取用。
	// 构造函数不再自动覆盖全局，避免调试/测试中多 new 一个就篡改状态。
	CompletionEngine.setCurrent(engine);
	registerDemoCommands(engine);
	if (rootDir) {
		YamlCommandLoader.load(engine, rootDir, context.extensionPath);
	}
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
	// 注册诊断（红线）
	// 无 rootDir 时**仍然注册**：语法类规则不依赖索引，只依赖命令表。
	// 索引类规则会因 commandTable 为空/查不到定义而自然不报，不会误报。
	registerDiagnostics(context);
	// 注册编辑器命令
	context.subscriptions.push(
		// 重载工作区
		vscode.commands.registerCommand('mcf-studio.reloadWorkspace', async () => {
			if (!rootDir) {
				// 首次定位失败（如用户之后才打开数据包目录）：此处重试一次
				try {
					const resolved = MinecraftUtils.getRootDir();
					setRootDir(resolved);
					rootDirError = null;
					console.log('[McfunctionStudio] rootDir 已设置', resolved.fsPath);
				} catch (err) {
					vscode.window.showWarningMessage(`Mcfunction Studio：仍未找到数据包目录（${(err as Error).message}）`);
					return;
				}
			}
			await dataloader.init();
			await YamlCommandLoader.reloadUser(engine, rootDir!);
			// 索引已更新：重算所有已开启文档的诊断（否则补全里已知的对象仍被判"未定义"）
			onIndexReady();
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
	// 注册json预览（构造函数内部即绑定编辑器事件，此处保留引用避免被过早回收）
	const linePre = new LinePreviewManager();
	context.subscriptions.push({ dispose: () => { void linePre; } });

	// 未能定位数据包目录时给出一次明确提示，而不是让扩展静默无反应
	if (rootDirError) {
		vscode.window.showWarningMessage(
			`Mcfunction Studio 未找到数据包目录：${rootDirError}\n` +
			`命令补全、定义跳转等将不可用。\n` +
			`请打开包含 data/functions 结构的目录后，执行「Mcfunction Studio: 刷新函数|计分板|进度|标签池」重试。`,
		);
	}
}


export function deactivate() {
	// 释放全局引擎引用：热重载/重装扩展时，旧引擎不应继续被调度层引用
	CompletionEngine.setCurrent(undefined);
}
