import * as vscode from 'vscode';
import { DataLoader } from './DataLoader';
import { CommandUtils } from '../utils/CommandUtils';

interface DocCache {

}


export class DynamicDocManager {
    private static instance: DynamicDocManager;

    private constructor() {
        this.bindEvents();
    }


    private bindEvents() {
        // 文档内容变更时：更新受影响行的缓存和标签/计分板数据
        vscode.workspace.onDidChangeTextDocument(event => {
            this.handleChanges(event);
        });

    }

    public static getInstance(): DynamicDocManager {
        if (!DynamicDocManager.instance) {
            DynamicDocManager.instance = new DynamicDocManager();
        }
        return DynamicDocManager.instance;
    }
    /**
     * 处理文档内容变更
     * @param event 文档内容变更事件
     */
    public handleChanges(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'mcfunction') {
            return;
        }
        event.contentChanges.forEach(change => {
            this.handleSingleChange(change, event.document);
        });

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

        const isInsertNewLine = change.range.isEmpty && (change.text.endsWith ('\n') || change.text.endsWith('\r'));
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

}

