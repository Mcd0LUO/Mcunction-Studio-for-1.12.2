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
    FakePlayer = 4
}

/** docCache 中每行的索引条目 */
export interface IndexEntry {
    type: DataType;
    value: string;
}
