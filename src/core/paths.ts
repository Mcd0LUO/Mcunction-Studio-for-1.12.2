/**
 * paths — 工作区根目录的唯一持有者
 *
 * 存在意义：切断循环依赖。
 *
 * 此前 rootDir 定义在 extension.ts，core/ 下的模块（DataLoader、
 * MinecraftUtils、IndexCache、CodeLens、DynamicDocManager）反向 import 它，
 * 形成 6 节点循环：
 *
 *   DataLoader → extension → Minecraft → Base → engine → CompletionContext → DataLoader
 *
 * 其中 Base.ts 的类字段初始化器 `ctx = new CompletionContext(DataLoader.getInstance())`
 * 在模块加载期立即执行，此时 DataLoader 尚未完成初始化 → 直接崩溃，
 * 导致 engine.ts / DataLoader 无法脱离 VS Code 宿主独立测试。
 *
 * 本模块无任何 import 依赖（除 vscode 类型），只做纯粹的变量存取，
 * 因此 core/ → paths 是单向的，循环从根部断开。
 */

import * as vscode from 'vscode';

/** 工作区根目录（data 目录）。由 extension.ts 的 activate() 设置。 */
export let rootDir: vscode.Uri | undefined;

/** 设置工作区根目录；重复设置以最后一次为准。 */
export function setRootDir(uri: vscode.Uri | undefined): void {
    rootDir = uri;
}
