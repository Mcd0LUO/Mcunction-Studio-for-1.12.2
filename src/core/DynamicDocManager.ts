import * as vscode from 'vscode';
import { DataLoader, DataType } from './DataLoader';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import path from 'path';
import { rootDir } from '../extension';



export class DynamicDocManager {
    private static instance: DynamicDocManager;

    private constructor() {
        this.bindEvents();
    }


    private bindEvents() {
        vscode.workspace.onDidCreateFiles(event => {
            // 新增文件时：创建新的函数文件
            event.files.forEach(file => {
                if (file.path.endsWith('.mcfunction')) {
                    DataLoader.getInstance().addFunctionResByUri(file);
                } else if (file.path.endsWith('.json') && "advancements" === path.relative(rootDir.fsPath, file.fsPath).split(path.sep)[0]) {
                    DataLoader.getInstance().addAdvancementResByUri(file);
                }
            });
        });
        // 文档内容变更时：更新受影响行的缓存和标签/计分板数据
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'mcfunction') {
                return;
            }
            event.contentChanges.forEach(change => {
                this.handleSingleChange(change, event.document);
            });
        });
        vscode.workspace.onDidDeleteFiles(event => {
           // 删除文件时：清理缓存和标签/计分板数据
            event.files.forEach(file => {
                // 删除文档缓存
                if (!file.path.endsWith('.mcfunction')) {
                    return;
                }
                DataLoader.getInstance().clearSingleFileAllCache(file);
            });
        });
        // 重命名文件时：清理缓存和标签/计分板数据
        vscode.workspace.onDidRenameFiles(async (event) => {
            event.files.forEach(async file => {
                // 修正
                if (file.oldUri.path.endsWith('.mcfunction')) {
                    const old_res = MinecraftUtils.buildFunctionCall(file.oldUri);
                    const new_res = MinecraftUtils.buildFunctionCall(file.newUri);
                    if (!old_res || !new_res) {
                        return;
                    }
                    const funcData = DataLoader.getInstance().getFunctionData().get(old_res ? old_res : '');
                    // 删除文档缓存
                    DataLoader.getInstance().clearSingleFileAllCache(file.oldUri);

                    // 重新加载
                    DataLoader.getInstance().loadSingleFuncFileByUri(file.newUri);
                    DataLoader.getInstance().addFunctionResByUri(file.newUri);
                }
                else if (file.oldUri.path.endsWith('.json') && "advancements" === path.relative(rootDir.fsPath, file.oldUri.fsPath).split(path.sep)[0]) {
                    const old_res = MinecraftUtils.buildAdvancementCall(file.oldUri);
                    const new_res = MinecraftUtils.buildAdvancementCall(file.newUri);
                    if (!old_res || !new_res) {
                        return;
                    }
                    DataLoader.getInstance().removeAdvancementRes(old_res);
                    DataLoader.getInstance().addAdvancementResByUri(file.newUri);
                }

            });
        });

    }

    public static getInstance(): DynamicDocManager {
        if (!DynamicDocManager.instance) {
            DynamicDocManager.instance = new DynamicDocManager();
        }
        return DynamicDocManager.instance;
    }

    /**
     * 处理单个文档内容变更。
     * - 单行内编辑：只清 + 重解析该行
     * - 任意换行 / 多行选区 / 粘贴多行：从 startLine 清到文件尾并重解析（行号会漂移）
     */
    private handleSingleChange(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): void {
        const startLine = change.range.start.line;
        const textHasNewline = /[\r\n]/.test(change.text);
        const rangeMultiLine = !change.range.isSingleLine;
        // 多行粘贴（即使不以 \n 结尾）、删多行、插入换行 → 需要重排后续行索引
        const needRescanTail = textHasNewline || rangeMultiLine;

        const loader = DataLoader.getInstance();
        if (needRescanTail) {
            loader.clearCache(document, startLine);
            loader.loadSingleFuncFileByDoc(document, startLine);
        } else {
            loader.clearCache(document, startLine, startLine);
            if (startLine < document.lineCount) {
                loader.handleSingleLine(document.uri, document.lineAt(startLine).text, startLine);
            }
        }
    }
}
