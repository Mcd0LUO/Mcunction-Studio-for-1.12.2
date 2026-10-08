/**
 * 符号能力的 VS Code 桥接 —— 把 DataLoader 的行号级索引接成列级符号。
 *
 * 与 `core/diagnostics/bridge.ts` 同一思路：规则/算法层不认识 vscode，
 * 这里负责组装。这里多一层异步：读行文本要 await workspace.fs。
 */
import * as vscode from 'vscode';
import { DataLoader } from '../DataLoader';
import { SymbolKind, SymbolOccurrenceWithHash, extractSymbols } from './extractor';
import { SymbolLocation } from './resolver';

/** 文档文本缓存：一个请求生命周期内复用 */
export type DocCache = Map<string, string>;

/** 按 uri 缓存的整文档行数组 */
const docLines = new Map<string, string[]>();

/** 提取某个 mcfunction 文档的全部符号（同步，供 Provider 直接用） */
export function symbolsOfDocument(doc: vscode.TextDocument): SymbolOccurrenceWithHash[] {
    const out: SymbolOccurrenceWithHash[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
        out.push(...extractSymbols(doc.lineAt(i).text));
    }
    return out;
}

/**
 * 索引是否可用。
 *
 * 未打开数据包目录时 rootDir 为空、DataLoader 未加载，
 * 此时索引里什么都没有 —— 若照样跑「未定义引用」类检查，
 * 会把整个文件里所有引用都判成"未定义"（实测 good.mcfunction 满屏红线）。
 * 因此所有**依赖索引**的能力都必须先过这道闸。
 */
export function isIndexReady(): boolean {
    try {
        const loader = DataLoader.getInstance();
        // 有 rootDir 才会 init()；索引非空才说明真的加载过
        return loader.getFunctionResNames().length > 0;
    } catch {
        return false;
    }
}

/** 从工作区索引取某个符号的全部位置（跨文件，含列区间） */
export async function resolveSymbol(
    kind: SymbolKind,
    value: string,
): Promise<SymbolLocation[]> {
    if (!isIndexReady()) { return []; }
    const loader = DataLoader.getInstance();
    const index = loader.getLineIndexForSymbols();
    const raw = index.getLocations(kind, value);
    if (raw.length === 0) { return []; }

    // 按文件分组，只读一次每个文件
    const byFile = new Map<string, number[]>();
    for (const r of raw) {
        const arr = byFile.get(r.file);
        if (arr) { arr.push(r.line); } else { byFile.set(r.file, [r.line]); }
    }

    const roleWanted = new Set(['definition', 'reference']);
    const out: SymbolLocation[] = [];

    for (const [file, lines] of byFile) {
        const texts = await readFileLines(file, lines);
        if (!texts) { continue; }
        for (const lineNo of lines) {
            const text = texts.get(lineNo);
            if (text === undefined) { continue; }
            for (const o of extractSymbols(text)) {
                if (o.kind !== kind || o.value !== value) { continue; }
                if (!roleWanted.has(o.role)) { continue; }
                out.push({
                    file,
                    line: lineNo,
                    start: o.start,
                    end: o.end,
                    role: o.role,
                    hashStart: o.hashStart,
                });
            }
        }
    }

    out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.start - b.start);
    return out;
}

/** 读一个文件里若干行的文本；整文件读一次并缓存 */
async function readFileLines(file: string, lines: number[]): Promise<Map<number, string> | null> {
    const cached = docLines.get(file);
    if (cached) {
        const m = new Map<number, string>();
        for (const l of lines) {
            const t = cached[l];
            if (t !== undefined) { m.set(l, t); }
        }
        return m;
    }

    let uri: vscode.Uri;
    try { uri = vscode.Uri.parse(file); } catch { return null; }

    // 已打开的文档优先（编辑中内容与磁盘可能不一致）
    const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === file);
    try {
        const arr: string[] = open
            ? Array.from({ length: open.lineCount }, (_, i) => open.lineAt(i).text)
            : (await vscode.workspace.fs.readFile(uri)).toString().split(/\r?\n/u);
        docLines.set(file, arr);
        const m = new Map<number, string>();
        for (const l of lines) {
            const t = arr[l];
            if (t !== undefined) { m.set(l, t); }
        }
        return m;
    } catch {
        return null;
    }
}

/** 清空文档缓存（文件保存/切换后调用，避免读到过期内容） */
export function invalidateDocCache(uri?: vscode.Uri): void {
    if (uri) { docLines.delete(uri.toString()); return; }
    docLines.clear();
}