/**
 * VS Code 适配层 —— 把纯数据 Diagnostic 翻译成 vscode.Diagnostic，
 * 并管理 DiagnosticCollection 的生命周期与增量更新。
 *
 * 这是整个诊断层**唯一**允许 import vscode 的文件（manager.ts 只做调度，可视为纯逻辑）。
 *
 * 性能约定：
 *   · 防抖 300ms —— 用户连续输入时只算最后一次，避免每键全量重算
 *   · 只对**已打开**的 mcfunction 文档计算 —— 数据包几百个文件，全量诊断无意义
 *   · 索引变化（加载完成/文件增删改）时对所有已开启文档重算一次
 */
import * as vscode from 'vscode';
import { ALL_RULES, DiagnosticRunner } from './runner';
import { Diagnostic, RuleLevel, Severity } from './types';
import { createValidationContext, isDiagnosticTarget } from './bridge';
import { EngineValidator } from './rules/syntax';

const DEBOUNCE_MS = 300;

function toVsSeverity(s: Severity): vscode.DiagnosticSeverity {
    switch (s) {
        case Severity.Error: return vscode.DiagnosticSeverity.Error;
        case Severity.Warning: return vscode.DiagnosticSeverity.Warning;
        case Severity.Hint: return vscode.DiagnosticSeverity.Hint;
        default: return vscode.DiagnosticSeverity.Information;
    }
}

export function toVsDiagnostic(d: Diagnostic): vscode.Diagnostic {
    const range = new vscode.Range(d.line, d.span.start, d.line, d.span.end);
    const diag = new vscode.Diagnostic(range, d.message, toVsSeverity(d.severity));
    diag.source = 'mcfunction-studio';
    if (d.code) { diag.code = d.code; }
    return diag;
}

export class DiagnosticsManager implements vscode.Disposable {
    private readonly collection: vscode.DiagnosticCollection;
    private runner: DiagnosticRunner;
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private disposed = false;

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('mcfunction-studio');
        this.runner = new DiagnosticRunner({
            rules: ALL_RULES,
            ctx: createValidationContext(),
            engine: currentEngineValidator(),
            levels: readLevels(),
        });
    }

    /** 配置变更后重建 runner（规则级别可在设置面板里改） */
    reloadConfig(): void {
        this.runner = new DiagnosticRunner({
            rules: ALL_RULES,
            ctx: createValidationContext(),
            engine: currentEngineValidator(),
            levels: readLevels(),
        });
        this.refreshAll();
    }

    /**
     * 立即重算并发布单个文档。
     * 公开给 DataLoader 加载完成后的批量刷新使用。
     */
    refreshNow(doc: vscode.TextDocument): void {
        if (this.disposed || !isDiagnosticTarget(doc)) { return; }
        const diags = this.check(doc);
        this.collection.set(doc.uri, diags);
    }

    /** 防抖刷新 */
    refresh(doc: vscode.TextDocument): void {
        if (this.disposed || !isDiagnosticTarget(doc)) { return; }
        const key = doc.uri.toString();
        const prev = this.timers.get(key);
        if (prev) { clearTimeout(prev); }
        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            this.refreshNow(doc);
        }, DEBOUNCE_MS));
    }

    /** 索引变化后刷新所有已开启的 mcfunction 文档 */
    refreshAll(): void {
        if (this.disposed) { return; }
        for (const doc of vscode.workspace.textDocuments) {
            if (isDiagnosticTarget(doc)) { this.refreshNow(doc); }
        }
    }

    /** 对所有已开启文档取消挂起任务（扩展停用时用） */
    clearAll(): void {
        for (const t of this.timers.values()) { clearTimeout(t); }
        this.timers.clear();
        this.collection.clear();
    }

    /** 丢弃已关闭文档的诊断与挂起任务 */
    disposeDoc(uri: vscode.Uri): void {
        const key = uri.toString();
        const t = this.timers.get(key);
        if (t) { clearTimeout(t); this.timers.delete(key); }
        this.collection.delete(uri);
    }

    private check(doc: vscode.TextDocument): vscode.Diagnostic[] {
        const lines: string[] = new Array(doc.lineCount);
        for (let i = 0; i < doc.lineCount; i++) {
            lines[i] = doc.lineAt(i).text;
        }
        return this.runner.checkDocument(lines).map(toVsDiagnostic);
    }

    dispose(): void {
        this.disposed = true;
        this.clearAll();
        this.collection.dispose();
    }
}

function currentEngineValidator(): EngineValidator | undefined {
    // 延迟 require 以避免 diagnostics → dsl/engine 的静态加载环
    const { CompletionEngine } = require('../../dsl/engine') as typeof import('../../dsl/engine');
    const e = CompletionEngine.getCurrent();
    return e === undefined ? undefined : e as unknown as EngineValidator;
}

function readLevels(): Record<string, RuleLevel> {
    const cfg = vscode.workspace.getConfiguration('mcfStudio');
    const obj = cfg.get<Record<string, RuleLevel>>('diagnostics.rules');
    return obj ?? {};
}

/** 单例 + 注册辅助 */
let manager: DiagnosticsManager | undefined;

export function registerDiagnostics(context: vscode.ExtensionContext): DiagnosticsManager {
    manager = new DiagnosticsManager();
    context.subscriptions.push(manager);

    // 编辑时防抖重算
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.contentChanges.length === 0) { return; }
            manager?.refresh(e.document);
        }),
        // 打开文档立即算一次（不等输入）
        vscode.workspace.onDidOpenTextDocument(doc => {
            manager?.refreshNow(doc);
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            // 关闭即清除，避免 Problems 面板堆积已关闭文件的诊断
            manager?.disposeDoc(doc.uri);
        }),
        // 索引重载完成后统一刷新
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (isDiagnosticTarget(doc)) { manager?.refreshNow(doc); }
        }),
    );

    // 已有打开的文档（插件在窗口已有 mcfunction 时才激活）
    for (const doc of vscode.workspace.textDocuments) {
        if (isDiagnosticTarget(doc)) { manager.refreshNow(doc); }
    }

    return manager;
}

export function getDiagnosticsManager(): DiagnosticsManager | undefined {
    return manager;
}

/** DataLoader 加载完成后的外部刷新入口 */
export function onIndexReady(): void {
    manager?.refreshAll();
}