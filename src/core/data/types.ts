import * as vscode from 'vscode';

// ============================================================
// 共享类型定义
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
    FakePlayer = 4,
    /**
     * 进度资源名。
     *
     * ⚠️ 5 是后加的。旧缓存里没有这个值，因此加载后进度的引用会缺失
     *    （References / Rename 对进度失效）—— INDEX_CACHE_VERSION 已随之 +1，
     *    旧缓存会被整体丢弃并重建。
     */
    Advancement = 5,
}

/** docCache 中每行的索引条目 */
export interface IndexEntry {
    type: DataType;
    value: string;
}
