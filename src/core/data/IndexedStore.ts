import * as vscode from 'vscode';
import { ScoreboardData, FunctionData, TeamData, DataType, IndexEntry } from './types';
import { LineIndex, LineIndexExport } from '../LineIndex';

/** 磁盘 index-cache 中 IndexedStore 的快照 */
export interface IndexedStoreExport {
    scoreboards: Array<[string, { type: string; desc: string; defUri: string; defLine: number }]>;
    teams: Array<[string, { color?: string; rule?: string; defUri: string; defLine: number }]>;
    funcDefs: Array<[string, Array<[string, number[]]>]>;
    docIndex: Array<[string, Array<[number, IndexEntry[]]>]>;
    fileKeyByRes: Array<[string, string]>;
    lineIndex: LineIndexExport;
}

// ============================================================
// IndexedStore — 委托 LineIndex 做行级追踪 + 引用计数
// ============================================================

const T = {
    Scoreboard: 'scoreboard',
    Team: 'team',
    Tag: 'tag',
    Function: 'function',
    FakePlayer: 'fake_player',
} as const;

export class IndexedStore {

    private index = new LineIndex();

    // ---- 类型特有元数据 ----
    private scoreboards = new Map<string, ScoreboardData>();
    private teams = new Map<string, TeamData>();
    private funcDefs = new Map<string, Map<string, number[]>>();

    // ---- 行级元数据（resName → line → entries）----
    private _docIndex = new Map<string, Map<number, IndexEntry[]>>();

    /** resName → uri.toString()，保证 LineIndex 清理键一致 */
    private _fileKeyByRes = new Map<string, string>();

    // ================================================================
    // 内部
    // ================================================================

    private f(file: vscode.Uri): string { return file.toString(); }

    private rememberFile(resName: string, uri: vscode.Uri): void {
        if (resName) {
            this._fileKeyByRes.set(resName, this.f(uri));
        }
    }

    private resolveFileKey(resName: string, uri?: vscode.Uri): string | undefined {
        if (uri) {
            const key = this.f(uri);
            if (resName) {
                this._fileKeyByRes.set(resName, key);
            }
            return key;
        }
        return this._fileKeyByRes.get(resName);
    }

    // ================================================================
    // 写入
    // ================================================================

    addScoreboard(resName: string, name: string, line: number, uri: vscode.Uri, type: string, desc: string = ''): void {
        this.rememberFile(resName, uri);
        if (this.scoreboards.has(name)) {
            vscode.window.showWarningMessage(`重复定义记分板目标：${name} 在 ${resName} : ${line}`);
            return;
        }
        this.scoreboards.set(name, { type, desc, def: [uri, line] });
        this._indexLine(resName, line, DataType.Scoreboard, name);
    }

    addTeam(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.rememberFile(resName, uri);
        this.teams.set(name, { def: [uri, line] });
        this._indexLine(resName, line, DataType.Team, name);
    }

    addTag(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.rememberFile(resName, uri);
        this.index.appendEntries(this.f(uri), line, [{ type: T.Tag, value: name }]);
        this._indexLine(resName, line, DataType.Tag, name);
    }

    /** 同行批量加 Tag（单次写入路径，避免覆盖） */
    addTags(resName: string, names: string[], line: number, uri: vscode.Uri): void {
        if (names.length === 0) { return; }
        this.rememberFile(resName, uri);
        this.index.appendEntries(
            this.f(uri),
            line,
            names.map(name => ({ type: T.Tag, value: name })),
        );
        for (const name of names) {
            this._indexLine(resName, line, DataType.Tag, name);
        }
    }

    addFakePlayer(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.rememberFile(resName, uri);
        this.index.appendEntries(this.f(uri), line, [{ type: T.FakePlayer, value: name }]);
        this._indexLine(resName, line, DataType.FakePlayer, name);
    }

    addFunctionRef(resName: string, funcName: string, line: number, uri: vscode.Uri): void {
        if (!funcName) { return; }
        this.rememberFile(resName, uri);
        let defs = this.funcDefs.get(funcName);
        if (!defs) {
            defs = new Map();
            this.funcDefs.set(funcName, defs);
        }
        const lines = defs.get(resName) ?? [];
        lines.push(line);
        defs.set(resName, lines);
        this.index.appendEntries(this.f(uri), line, [{ type: T.Function, value: funcName }]);
        this._indexLine(resName, line, DataType.Function, funcName);
    }

    // ================================================================
    // 清除
    // ================================================================

    /**
     * 清除 resName 文档 [startLine, endLine] 的索引。
     * @param uri 可选；传入时用于解析 LineIndex 文件键（优先）
     */
    clearLines(resName: string, startLine: number, endLine: number, uri?: vscode.Uri): void {
        const fileKey = this.resolveFileKey(resName, uri);
        const docEntry = this._docIndex.get(resName);

        for (let line = startLine; line <= endLine; line++) {
            const entries = docEntry?.get(line);
            if (entries) {
                for (const entry of entries) {
                    this.removeMeta(entry, resName, line);
                }
                docEntry!.delete(line);
            }
            // Tag / FakePlayer / Function / YAML 均挂在 LineIndex 上，必须按 uri 键清理
            if (fileKey) {
                this.index.clearLine(fileKey, line);
            }
        }

        if (docEntry && docEntry.size === 0) {
            this._docIndex.delete(resName);
        }
    }

    clearFile(resName: string, uri?: vscode.Uri): void {
        const fileKey = this.resolveFileKey(resName, uri);
        const docEntry = this._docIndex.get(resName);

        if (docEntry) {
            for (const [line, entries] of docEntry) {
                for (const entry of entries) {
                    this.removeMeta(entry, resName, line);
                }
            }
            this._docIndex.delete(resName);
        }

        if (fileKey) {
            this.index.clearFile(fileKey);
        }
        this._fileKeyByRes.delete(resName);
    }

    private removeMeta(entry: IndexEntry, resName: string, line: number): void {
        switch (entry.type) {
            case DataType.Scoreboard: {
                this.scoreboards.delete(entry.value);
                break;
            }
            case DataType.Team: {
                this.teams.delete(entry.value);
                break;
            }
            case DataType.Function: {
                const defs = this.funcDefs.get(entry.value);
                if (!defs) { break; }
                const lines = defs.get(resName);
                if (!lines) { break; }
                const idx = lines.indexOf(line);
                if (idx >= 0) {
                    lines.splice(idx, 1);
                }
                if (lines.length === 0) {
                    defs.delete(resName);
                }
                if (defs.size === 0) {
                    this.funcDefs.delete(entry.value);
                }
                break;
            }
            // Tag / FakePlayer：引用计数由 LineIndex.clearLine 处理
            default:
                break;
        }
    }

    hasDocEntry(resName: string): boolean {
        return this._docIndex.has(resName) || this._fileKeyByRes.has(resName);
    }

    getMaxLine(resName: string): number {
        const docEntry = this._docIndex.get(resName);
        if (!docEntry || docEntry.size === 0) { return -1; }
        return Math.max(...docEntry.keys());
    }

    // ================================================================
    // 全局
    // ================================================================

    clear(): void {
        this.index.clear();
        this.scoreboards.clear();
        this.teams.clear();
        this.funcDefs.clear();
        this._docIndex.clear();
        this._fileKeyByRes.clear();
    }

    // ================================================================
    // 读取
    // ================================================================

    getScoreboards(): Map<string, ScoreboardData> { return this.scoreboards; }

    getFunctions(): Map<string, FunctionData> {
        const result = new Map<string, FunctionData>();
        for (const [name, defs] of this.funcDefs) {
            result.set(name, { ref: defs });
        }
        return result;
    }

    getTags(): Map<string, number> {
        const result = new Map<string, number>();
        for (const v of this.index.getByType(T.Tag)) {
            result.set(v.value, v.count);
        }
        return result;
    }

    getTeams(): Map<string, TeamData> { return this.teams; }

    getFakePlayers(): Map<string, number> {
        const result = new Map<string, number>();
        for (const v of this.index.getByType(T.FakePlayer)) {
            result.set(v.value, v.count);
        }
        return result;
    }

    getDocIndex(): Map<string, Map<number, IndexEntry[]>> { return this._docIndex; }
    getLineIndex(): LineIndex { return this.index; }

    // ================================================================
    // 序列化（磁盘 index-cache）
    // ================================================================

    exportState(): IndexedStoreExport {
        const scoreboards: IndexedStoreExport['scoreboards'] = [];
        for (const [name, data] of this.scoreboards) {
            scoreboards.push([name, {
                type: data.type,
                desc: data.desc,
                defUri: data.def[0].toString(),
                defLine: data.def[1],
            }]);
        }

        const teams: IndexedStoreExport['teams'] = [];
        for (const [name, data] of this.teams) {
            const row: IndexedStoreExport['teams'][0][1] = {
                defUri: data.def[0].toString(),
                defLine: data.def[1],
            };
            if (data.color !== undefined) { row.color = data.color; }
            if (data.rule !== undefined) { row.rule = data.rule; }
            teams.push([name, row]);
        }

        const funcDefs: IndexedStoreExport['funcDefs'] = [];
        for (const [funcName, byRes] of this.funcDefs) {
            const rows: Array<[string, number[]]> = [];
            for (const [resName, lines] of byRes) {
                rows.push([resName, [...lines]]);
            }
            funcDefs.push([funcName, rows]);
        }

        const docIndex: IndexedStoreExport['docIndex'] = [];
        for (const [resName, lineMap] of this._docIndex) {
            const rows: Array<[number, IndexEntry[]]> = [];
            for (const [line, entries] of lineMap) {
                rows.push([line, entries.map(e => ({ type: e.type, value: e.value }))]);
            }
            docIndex.push([resName, rows]);
        }

        return {
            scoreboards,
            teams,
            funcDefs,
            docIndex,
            fileKeyByRes: [...this._fileKeyByRes.entries()],
            lineIndex: this.index.exportState(),
        };
    }

    importState(data: IndexedStoreExport): void {
        this.clear();
        if (!data || typeof data !== 'object') { return; }

        if (Array.isArray(data.scoreboards)) {
            for (const row of data.scoreboards) {
                if (!Array.isArray(row) || row.length < 2) { continue; }
                const [name, meta] = row;
                if (typeof name !== 'string' || !meta) { continue; }
                try {
                    const uri = vscode.Uri.parse(meta.defUri);
                    this.scoreboards.set(name, {
                        type: meta.type ?? '',
                        desc: meta.desc ?? '',
                        def: [uri, meta.defLine ?? 0],
                    });
                } catch { /* 坏 uri 跳过 */ }
            }
        }

        if (Array.isArray(data.teams)) {
            for (const row of data.teams) {
                if (!Array.isArray(row) || row.length < 2) { continue; }
                const [name, meta] = row;
                if (typeof name !== 'string' || !meta) { continue; }
                try {
                    const uri = vscode.Uri.parse(meta.defUri);
                    const t: TeamData = { def: [uri, meta.defLine ?? 0] };
                    if (meta.color !== undefined) { t.color = meta.color; }
                    if (meta.rule !== undefined) { t.rule = meta.rule; }
                    this.teams.set(name, t);
                } catch { /* skip */ }
            }
        }

        if (Array.isArray(data.funcDefs)) {
            for (const row of data.funcDefs) {
                if (!Array.isArray(row) || row.length < 2) { continue; }
                const [funcName, byRes] = row;
                if (typeof funcName !== 'string' || !Array.isArray(byRes)) { continue; }
                const m = new Map<string, number[]>();
                for (const resRow of byRes) {
                    if (!Array.isArray(resRow) || resRow.length < 2) { continue; }
                    const [resName, lines] = resRow;
                    if (typeof resName === 'string' && Array.isArray(lines)) {
                        m.set(resName, lines.map(n => Number(n)).filter(n => !Number.isNaN(n)));
                    }
                }
                if (m.size > 0) {
                    this.funcDefs.set(funcName, m);
                }
            }
        }

        if (Array.isArray(data.docIndex)) {
            for (const row of data.docIndex) {
                if (!Array.isArray(row) || row.length < 2) { continue; }
                const [resName, lineRows] = row;
                if (typeof resName !== 'string' || !Array.isArray(lineRows)) { continue; }
                const lineMap = new Map<number, IndexEntry[]>();
                for (const lr of lineRows) {
                    if (!Array.isArray(lr) || lr.length < 2) { continue; }
                    const [line, entries] = lr;
                    if (typeof line !== 'number' || !Array.isArray(entries)) { continue; }
                    lineMap.set(line, entries.map(e => ({
                        type: e.type as DataType,
                        value: e.value,
                    })));
                }
                if (lineMap.size > 0) {
                    this._docIndex.set(resName, lineMap);
                }
            }
        }

        if (Array.isArray(data.fileKeyByRes)) {
            for (const row of data.fileKeyByRes) {
                if (!Array.isArray(row) || row.length < 2) { continue; }
                const [resName, fileKey] = row;
                if (typeof resName === 'string' && typeof fileKey === 'string') {
                    this._fileKeyByRes.set(resName, fileKey);
                }
            }
        }

        if (data.lineIndex) {
            this.index.importState(data.lineIndex);
        }
    }

    // ================================================================
    // 内部
    // ================================================================

    private _indexLine(resName: string, line: number, type: DataType, value: string): void {
        let entry = this._docIndex.get(resName);
        if (!entry) {
            entry = new Map();
            this._docIndex.set(resName, entry);
        }
        const lineEntries = entry.get(line) ?? [];
        lineEntries.push({ type, value });
        entry.set(line, lineEntries);
    }
}
