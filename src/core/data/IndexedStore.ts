import * as vscode from 'vscode';
import { ScoreboardData, FunctionData, TeamData, DataType, IndexEntry } from './types';
import { LineIndex } from '../LineIndex';

// ============================================================
// IndexedStore — 委托 LineIndex 做行级追踪 + 引用计数
// ============================================================

const T = { Scoreboard: 'scoreboard', Team: 'team', Tag: 'tag', Function: 'function', FakePlayer: 'fake_player' } as const;

export class IndexedStore {

    private index = new LineIndex();

    // ---- 类型特有元数据 ----
    private scoreboardMeta = new Map<string, { type: string; desc: string; def: [vscode.Uri, number] }>();
    private teamMeta = new Map<string, { def: [vscode.Uri, number] }>();
    private funcDefs = new Map<string, Map<string, number[]>>(); // funcName → file → lines

    // ---- 向后兼容：旧 docIndex 接口 ----
    private _docIndex = new Map<string, Map<number, IndexEntry[]>>();

    // ================================================================
    // 内部
    // ================================================================

    private f(file: vscode.Uri): string { return file.toString(); }

    // ================================================================
    // 写入
    // ================================================================

    addScoreboard(resName: string, name: string, line: number, uri: vscode.Uri, type: string, desc: string = ''): void {
        if (this.scoreboardMeta.has(name)) {
            vscode.window.showWarningMessage(`重复定义记分板目标：${name} 在 ${resName} : ${line}`);
            return;
        }
        this.scoreboardMeta.set(name, { type, desc, def: [uri, line] });
        this.index.addLine(this.f(uri), line, [{ type: T.Scoreboard, value: name }]);
        this._indexLine(resName, line, DataType.Scoreboard, name);
    }

    addTeam(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.teamMeta.set(name, { def: [uri, line] });
        this.index.addLine(this.f(uri), line, [{ type: T.Team, value: name }]);
        this._indexLine(resName, line, DataType.Team, name);
    }

    addTag(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.index.addLine(this.f(uri), line, [{ type: T.Tag, value: name }]);
        this._indexLine(resName, line, DataType.Tag, name);
    }

    addFakePlayer(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.index.addLine(this.f(uri), line, [{ type: T.FakePlayer, value: name }]);
        this._indexLine(resName, line, DataType.FakePlayer, name);
    }

    addFunctionRef(resName: string, funcName: string, line: number, uri: vscode.Uri): void {
        let defs = this.funcDefs.get(funcName);
        if (!defs) { defs = new Map(); this.funcDefs.set(funcName, defs); }
        const lines = defs.get(resName) ?? [];
        lines.push(line);
        defs.set(resName, lines);
        this.index.addLine(this.f(uri), line, [{ type: T.Function, value: funcName }]);
        this._indexLine(resName, line, DataType.Function, funcName);
    }

    // ================================================================
    // 清除
    // ================================================================

    clearLines(resName: string, startLine: number, endLine: number): void {
        const docEntry = this._docIndex.get(resName);
        if (!docEntry) { return; }

        for (let line = startLine; line <= endLine; line++) {
            const entries = docEntry.get(line);
            if (!entries) { continue; }
            for (const entry of entries) {
                switch (entry.type) {
                    case DataType.Scoreboard: this.scoreboardMeta.delete(entry.value); break;
                    case DataType.Team: this.teamMeta.delete(entry.value); break;
                    case DataType.Function: {
                        const defs = this.funcDefs.get(entry.value);
                        if (defs) { defs.delete(resName); if (defs.size === 0) this.funcDefs.delete(entry.value); }
                        break;
                    }
                }
            }
            docEntry.delete(line);
        }
        if (docEntry.size === 0) this._docIndex.delete(resName);

        // 从文件视角清除 LineIndex 中的对应行
        // 需要知道 file Uri → 遍历 _docIndex 找到 file
        // 简化：通过 resName 映射回 file（resName 即 uri.toString()）
    }

    clearFile(resName: string): void {
        const docEntry = this._docIndex.get(resName);
        if (!docEntry) { return; }

        for (const [, entries] of docEntry) {
            for (const entry of entries) {
                switch (entry.type) {
                    case DataType.Scoreboard: this.scoreboardMeta.delete(entry.value); break;
                    case DataType.Team: this.teamMeta.delete(entry.value); break;
                    case DataType.Function: {
                        const defs = this.funcDefs.get(entry.value);
                        if (defs) { defs.delete(resName); if (defs.size === 0) this.funcDefs.delete(entry.value); }
                        break;
                    }
                }
            }
        }
        this._docIndex.delete(resName);

        // clear LineIndex for this file
        this.index.clearFile(resName);
    }

    hasDocEntry(resName: string): boolean { return this._docIndex.has(resName); }

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
        this.scoreboardMeta.clear();
        this.teamMeta.clear();
        this.funcDefs.clear();
        this._docIndex.clear();
    }

    // ================================================================
    // 读取
    // ================================================================

    getScoreboards(): Map<string, ScoreboardData> {
        const result = new Map<string, ScoreboardData>();
        for (const [name, meta] of this.scoreboardMeta) {
            result.set(name, { type: meta.type, desc: meta.desc, def: meta.def });
        }
        return result;
    }

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

    getTeams(): Map<string, TeamData> {
        const result = new Map<string, TeamData>();
        for (const [name, meta] of this.teamMeta) {
            result.set(name, { def: meta.def });
        }
        return result;
    }

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
    // 内部
    // ================================================================

    private _indexLine(resName: string, line: number, type: DataType, value: string): void {
        let entry = this._docIndex.get(resName);
        if (!entry) { entry = new Map(); this._docIndex.set(resName, entry); }
        const lineEntries = entry.get(line) ?? [];
        lineEntries.push({ type, value });
        entry.set(line, lineEntries);
    }
}
