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
            event.files.forEach(file => {
                // 修正
                const old_res = MinecraftUtils.buildFunctionCall(file.oldUri);
                const new_res = MinecraftUtils.buildFunctionCall(file.newUri);
                const funcData = DataLoader.getInstance().getFunctionData().get(old_res ? old_res : '');
                const edit = new vscode.WorkspaceEdit();
                if (old_res && new_res && funcData) {
                    const entries = Array.from(funcData.ref.entries()).map(([name, lines]) => this.updateFunctionReference(old_res, new_res, name, lines, edit));                    ;
                }
                // 删除文档缓存
                DataLoader.getInstance().clearSingleFileAllCache(file.oldUri);
                // 重新加载
                DataLoader.getInstance().loadSingleFuncFileByUri(file.newUri);
                DataLoader.getInstance().addFunctionRes(file.newUri);

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
            DataLoader.getInstance().loadSingleFuncFileByDoc(document, startLine);
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

