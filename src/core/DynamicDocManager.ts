import * as vscode from 'vscode';
import { DataLoader } from './DataLoader';



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

    public handleChanges(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'mcfunction') {
            return;
        }
        event.contentChanges.forEach(change => {
            this.handleSingleChange(change, event.document);
        });

    }

    private handleSingleChange(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): void {
        const startLine = change.range.start.line;
        DataLoader.getInstance().loadSingleFunctionData(document.uri, startLine);
    
    }

}