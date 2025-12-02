import * as vscode from 'vscode';
import { DataLoader, DataType } from './DataLoader';
import { MinecraftUtils } from '../utils/MinecraftUtils';



export class DynamicDocManager {
    private static instance: DynamicDocManager;

    private constructor() {
        this.bindEvents();
    }


    private bindEvents() {
        vscode.workspace.onDidCreateFiles(event => {
            // 新增文件时：创建新的函数文件
            event.files.forEach(file => {
                console.log(file);
                DataLoader.getInstance().addFunctionRes(file);
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
                DataLoader.getInstance().clearSingleFileAllCache(file);
            });
        });
        // 重命名文件时：清理缓存和标签/计分板数据
        vscode.workspace.onDidRenameFiles(event => {
            const edit = new vscode.WorkspaceEdit();
            // 删除文件时：清理缓存和标签/计分板数据
            event.files.forEach(file => {
                // 修改相关函数的引用
                const resName = MinecraftUtils.buildFunctionCall(file.oldUri) ?? '';
                const newResName = MinecraftUtils.buildFunctionCall(file.newUri) ?? '';
                const funcData = DataLoader.getInstance().getFunctionData().get(resName);
                // 遍历函数
                funcData?.ref.forEach(async (lines, funcName) => {
                    const funcUri = MinecraftUtils.buildFunctionUri(funcName);
                    if (!funcUri) { return; };
                    // 读取文档内容
                    const doc = await vscode.workspace.openTextDocument(funcUri);
                    // 遍历行替换
                    for (const i of lines) {
                        const line = doc.lineAt(i);
                        const newContent = line.text.replace(resName, newResName);
                        edit.replace(funcUri, line.range, newContent);
                        const success = await vscode.workspace.applyEdit(edit);
                        if (!success) {
                            vscode.window.showErrorMessage(`Failed to update function reference at ${funcName}`);
                        }
                    }
                    doc.save();

                });
                // 删除文档缓存
                DataLoader.getInstance().clearSingleFileAllCache(file.oldUri);
                // 重建文档缓存
                DataLoader.getInstance().loadSingleFileByUri(file.newUri);
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
     * 处理单个文档内容变更
     * @param change 文档内容变更参数
     * @param document 文档
     */
    private handleSingleChange(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): void {
        const startLine = change.range.start.line;
        // 清理缓存
        // 如果change 是回车或退格且换行

        const isInsertNewLine = change.range.isEmpty && (change.text.endsWith('\n') || change.text.endsWith('\r'));
        const isDeleteNewLine = !change.range.isEmpty && !change.text.length && !change.range.isSingleLine;
        const needAdjustLineOrder = isInsertNewLine || isDeleteNewLine;
        if (needAdjustLineOrder) {
            DataLoader.getInstance().clearCache(document, startLine);
            DataLoader.getInstance().loadSingleFileByDoc(document, startLine);
        }
        else {
            DataLoader.getInstance().clearCache(document, startLine, startLine);
            DataLoader.getInstance().handleSingleLine(document.uri, document.lineAt(startLine).text, startLine);
        }

    }
    /**
     * 修改函数引用
     * @param oldFuncCall 旧函数调用
     * @param newFuncCall 新函数调用
     * @param funcName 指定修改的函数
     * @param lineNumbers 指定函数行号
     * @param edit 编辑对象
     * @returns 修改的文档uri
     */
    private async updateFunctionReference(
        oldFuncCall: string,
        newFuncCall: string,
        funcName: string,
        lineNumbers: number[],
        edit: vscode.WorkspaceEdit
    ): Promise<vscode.Uri[]> {
        const modifiedUris: vscode.Uri[] = [];
        const funcUri = MinecraftUtils.buildFunctionUri(funcName);

        if (!funcUri || !oldFuncCall || !newFuncCall) {
            return modifiedUris;
        }

        try {
            const doc = await vscode.workspace.openTextDocument(funcUri);

            // 收集当前文件的所有编辑操作
            lineNumbers.forEach(lineNum => {
                if (lineNum < 0 || lineNum >= doc.lineCount) {
                    return; // 跳过无效行号
                }
                const line = doc.lineAt(lineNum);
                const newContent = line.text.replace(oldFuncCall, newFuncCall);
                edit.replace(funcUri, line.range, newContent);
            });

            modifiedUris.push(funcUri);
        } catch (error) {
            vscode.window.showErrorMessage(`处理函数 ${funcName} 失败: ${(error as Error).message}`);
        }

        return modifiedUris;
    }

}

