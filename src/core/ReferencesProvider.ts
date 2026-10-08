/**
 * 引用查找（References，Shift+F12 / Ctrl+Shift+G）。
 *
 * 关键在**先判定光标处的角色**，再按 kind 过滤：
 * 把光标放在 `say mytag` 的 mytag 上不应返回标签引用——
 * `extractSymbols` 对 say 行不产出任何标签符号，天然不会误命中。
 */
import * as vscode from 'vscode';
import { DataLoader } from './DataLoader';
import { SymbolKind, extractSymbols } from './symbols/extractor';
import { invalidateDocCache, resolveSymbol } from './symbols/bridge';

/** 光标处命中的符号 */
interface Hit {
    readonly kind: SymbolKind;
    readonly value: string;
}

export class McFunctionReferencesProvider implements vscode.ReferenceProvider {

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        token: vscode.CancellationToken,
    ): Promise<vscode.Location[]> {
        if (document.languageId !== 'mcfunction') { return []; }

        const hit = symbolAt(document, position);
        if (!hit) { return []; }

        invalidateDocCache(document.uri);
        const locs = await resolveSymbol(hit.kind, hit.value);
        if (token.isCancellationRequested) { return []; }

        const out: vscode.Location[] = [];
        for (const l of locs) {
            let uri: vscode.Uri;
            try { uri = vscode.Uri.parse(l.file); } catch { continue; }
            out.push(new vscode.Location(uri, new vscode.Range(l.line, l.start, l.line, l.end)));
        }
        return out;
    }
}

/**
 * 判定光标处是哪个符号。
 *
 * 导出供 Rename 共用——两者的第一步完全相同，
 * 分开写就会出现「F12 能跳但 F2 说不能改」这类不一致。
 */
export function symbolAt(document: vscode.TextDocument, position: vscode.Position): Hit | null {
    const text = document.lineAt(position.line).text;
    const occs = extractSymbols(text);

    let best: { kind: SymbolKind; value: string; start: number; end: number } | null = null;
    for (const o of occs) {
        // 允许光标落在 token 两端（编辑器里点最后一个字符的右侧仍算选中）
        if (position.character < o.start || position.character > o.end) { continue; }
        // 多个符号重叠时取最短（最具体）的那个
        if (best === null || (o.end - o.start) < (best.end - best.start)) {
            best = { kind: o.kind, value: o.value, start: o.start, end: o.end };
        }
    }
    if (best === null) { return null; }
    return { kind: best.kind, value: best.value };
}

export function registerReferencesProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            { language: 'mcfunction' },
            new McFunctionReferencesProvider(),
        ),
    );
}

/** 供 e2e / 调试：当前 DataLoader 是否可用 */
export function symbolsReady(): boolean {
    return !!DataLoader.getInstance().getLineIndexForSymbols();
}