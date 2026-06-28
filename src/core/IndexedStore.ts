import * as vscode from 'vscode';

// ============================================================
// 类型定义（从 DataLoader 迁移）
// ============================================================

export interface ScoreboardData {
    type: string;
    desc: string;
    def: [vscode.Uri, number];
}

export interface FunctionData {
    ref: Map<string, number[]>;          // resName → 行号列表
}

export interface TeamData {
    color?: string;
    rule?: string;
    def: [vscode.Uri, number];
}

export enum DataType {
    Scoreboard = 0,
    Function = 1,
    Tag = 2,
    Team = 3,
    FakePlayer = 4
}

/** docCache 中每行的索引条目 */
interface IndexEntry {
    type: DataType;
    value: string;
}

// ============================================================
// IndexedStore — 统一数据 + 反向索引管理
// ============================================================

export class IndexedStore {

    // ---- 主数据存储 ----
    private scoreboards = new Map<string, ScoreboardData>();
    private functions = new Map<string, FunctionData>();
    private tags = new Map<string, number>();          // value = 引用计数
    private teams = new Map<string, TeamData>();
    private fakePlayers = new Map<string, number>();   // value = 引用计数

    // ---- 反向索引: resName → 行号 → IndexEntry[] ----
    private docIndex = new Map<string, Map<number, IndexEntry[]>>();

    // ================================================================
    // 内部工具
    // ================================================================

    /** 确保 resName 在 docIndex 中有条目 */
    private ensureDocEntry(resName: string): Map<number, IndexEntry[]> {
        let entry = this.docIndex.get(resName);
        if (!entry) {
            entry = new Map();
            this.docIndex.set(resName, entry);
        }
        return entry;
    }

    /** 向 docIndex 中某行追加一条索引 */
    private indexLine(resName: string, line: number, type: DataType, value: string): void {
        const docEntry = this.ensureDocEntry(resName);
        const lineEntries = docEntry.get(line) ?? [];
        lineEntries.push({ type, value });
        docEntry.set(line, lineEntries);
    }

    // ================================================================
    // 写入 —— 每个方法原子地更新：数据 Map + docIndex
    // ================================================================

    /** 添加记分板定义 */
    addScoreboard(resName: string, name: string, line: number, uri: vscode.Uri, type: string, desc: string = ''): void {
        const existing = this.scoreboards.get(name);
        if (existing) {
            const def = existing.def;
            if (def) {
                const callName = resName;
                vscode.window.showWarningMessage(`重复定义记分板目标：${name} 在 ${callName} : ${line}`);
            }
            return;
        }
        this.scoreboards.set(name, { type, desc, def: [uri, line] });
        this.indexLine(resName, line, DataType.Scoreboard, name);
    }

    /** 添加标签（引用计数 +1） */
    addTag(resName: string, name: string, line: number, uri: vscode.Uri): void {
        const current = this.tags.get(name) ?? 0;
        this.tags.set(name, current + 1);
        this.indexLine(resName, line, DataType.Tag, name);
    }

    /** 添加队伍定义 */
    addTeam(resName: string, name: string, line: number, uri: vscode.Uri): void {
        this.teams.set(name, { def: [uri, line] });
        this.indexLine(resName, line, DataType.Team, name);
    }

    /** 添加假玩家（引用计数 +1） */
    addFakePlayer(resName: string, name: string, line: number, uri: vscode.Uri): void {
        const current = this.fakePlayers.get(name) ?? 0;
        this.fakePlayers.set(name, current + 1);
        this.indexLine(resName, line, DataType.FakePlayer, name);
    }

    /** 添加函数引用 */
    addFunctionRef(resName: string, funcName: string, line: number, uri: vscode.Uri): void {
        let funcData = this.functions.get(funcName);
        if (!funcData) {
            funcData = { ref: new Map() };
            this.functions.set(funcName, funcData);
        }
        const lines = funcData.ref.get(resName) ?? [];
        lines.push(line);
        funcData.ref.set(resName, lines);
        this.indexLine(resName, line, DataType.Function, funcName);
    }

    // ================================================================
    // 清除 —— 从 docIndex 逐行反向推导，联动清理数据 Map
    // ================================================================

    /**
     * 清除指定文件的行范围。
     * 从 docIndex 中取出每行的 IndexEntry，根据 DataType 联动清理对应的数据 Map。
     */
    clearLines(resName: string, startLine: number, endLine: number): void {
        const docEntry = this.docIndex.get(resName);
        if (!docEntry) { return; }

        for (let line = startLine; line <= endLine; line++) {
            const entries = docEntry.get(line);
            if (!entries) { continue; }

            for (const entry of entries) {
                switch (entry.type) {
                    case DataType.Scoreboard:
                        this.scoreboards.delete(entry.value);
                        break;
                    case DataType.Team:
                        this.teams.delete(entry.value);
                        break;
                    case DataType.Tag: {
                        const count = this.tags.get(entry.value);
                        if (count && count > 1) {
                            this.tags.set(entry.value, count - 1);
                        } else {
                            this.tags.delete(entry.value);
                        }
                        break;
                    }
                    case DataType.FakePlayer: {
                        const count = this.fakePlayers.get(entry.value);
                        if (count && count > 1) {
                            this.fakePlayers.set(entry.value, count - 1);
                        } else {
                            this.fakePlayers.delete(entry.value);
                        }
                        break;
                    }
                    // Function refs 在 clearFile 中整文件移除
                    default:
                        break;
                }
            }
            docEntry.delete(line);
        }

        // 如果该 resName 下已无任何行数据，移除空壳
        if (docEntry.size === 0) {
            this.docIndex.delete(resName);
        }
    }

    /** 清除整个文件的所有索引 + 数据 */
    clearFile(resName: string): void {
        const docEntry = this.docIndex.get(resName);
        if (!docEntry) { return; }

        // 清理所有行的所有条目
        for (const [, entries] of docEntry) {
            for (const entry of entries) {
                switch (entry.type) {
                    case DataType.Scoreboard:
                        this.scoreboards.delete(entry.value);
                        break;
                    case DataType.Team:
                        this.teams.delete(entry.value);
                        break;
                    case DataType.Tag: {
                        const count = this.tags.get(entry.value);
                        if (count && count > 1) {
                            this.tags.set(entry.value, count - 1);
                        } else {
                            this.tags.delete(entry.value);
                        }
                        break;
                    }
                    case DataType.FakePlayer: {
                        const count = this.fakePlayers.get(entry.value);
                        if (count && count > 1) {
                            this.fakePlayers.set(entry.value, count - 1);
                        } else {
                            this.fakePlayers.delete(entry.value);
                        }
                        break;
                    }
                    case DataType.Function: {
                        const funcData = this.functions.get(entry.value);
                        if (funcData) {
                            funcData.ref.delete(resName);
                            // 如果没有其他文件引用这个函数，清理空壳
                            if (funcData.ref.size === 0) {
                                this.functions.delete(entry.value);
                            }
                        }
                        break;
                    }
                }
            }
        }

        this.docIndex.delete(resName);
    }

    /** 检查 resName 在 docIndex 中是否有条目 */
    hasDocEntry(resName: string): boolean {
        return this.docIndex.has(resName);
    }

    /** 获取 docIndex 中指定 resName 的最大行号（用于 clearCache endLine=-1 的情况） */
    getMaxLine(resName: string): number {
        const docEntry = this.docIndex.get(resName);
        if (!docEntry || docEntry.size === 0) { return -1; }
        return Math.max(...docEntry.keys());
    }

    // ================================================================
    // 读取 —— 返回原始数据结构（向后兼容）
    // ================================================================

    getScoreboards(): Map<string, ScoreboardData> { return this.scoreboards; }
    getFunctions(): Map<string, FunctionData> { return this.functions; }
    getTags(): Map<string, number> { return this.tags; }
    getTeams(): Map<string, TeamData> { return this.teams; }
    getFakePlayers(): Map<string, number> { return this.fakePlayers; }
    getDocIndex(): Map<string, Map<number, IndexEntry[]>> { return this.docIndex; }
}
