/**
 * YAML 数据提取器 — 从函数文件中按规则提取自定义数据。
 * 委托 LineIndex 做行级追踪 + 引用计数。
 */

import { YamlExtractRule } from './types';
import { LineIndex } from '../../core/LineIndex';
import { DataLoader } from '../../core/DataLoader';

interface ParsedRule {
    command: string;
    type: string;
    types?: string[];
    tokens: (string | { capture: true })[];
}

const rulesByCommand = new Map<string, ParsedRule[]>();

function getIndex(): LineIndex {
    return DataLoader.getInstance().store.getLineIndex();
}

// ================================================================
// 规则注册
// ================================================================

export function registerExtractRule(command: string, rule: YamlExtractRule, _source: string): void {
    const tokens = parsePattern(rule.pattern);
    if (!tokens) {
        console.warn(`[YAML] ${_source}: 无效的 extract pattern "${rule.pattern}"`);
        return;
    }
    const parsed: ParsedRule = { command, type: rule.type, types: rule.types, tokens };
    const existing = rulesByCommand.get(command);
    if (existing) { existing.push(parsed); }
    else { rulesByCommand.set(command, [parsed]); }
}

export function unregisterCommandRules(command: string): void {
    rulesByCommand.delete(command);
}

// ================================================================
// 提取
// ================================================================

export function applyExtractForFile(cmdName: string, commands: string[], fileUri: string, line: number = 0): void {
    const rules = rulesByCommand.get(cmdName);
    if (!rules) { return; }

    const index = getIndex();
    if (!index) { return; }

    for (const rule of rules) {
        const args = commands.slice(1);
        const captured: string[] = [];
        let matched = true;
        for (let i = 0; i < rule.tokens.length; i++) {
            const token = rule.tokens[i];
            if (typeof token === 'string') {
                if (i >= args.length || args[i] !== token) { matched = false; break; }
            } else {
                if (i >= args.length || !args[i]) { matched = false; break; }
                captured.push(args[i]);
            }
        }
        if (!matched || captured.length === 0) { continue; }

        const entries: { type: string; value: string }[] = [];
        if (rule.types && rule.types.length > 0) {
            for (let i = 0; i < captured.length && i < rule.types.length; i++) {
                entries.push({ type: rule.types[i], value: captured[i] });
            }
        } else {
            for (const v of captured) { entries.push({ type: rule.type, value: v }); }
        }

        index.addLine(fileUri, line, entries);
    }
}

// ================================================================
// 查询
// ================================================================

export function getCustomData(type: string): string[] {
    const index = getIndex();
    return index ? index.getValues(type) : [];
}

export function clearFileExtract(fileUri: string): void {
    const index = getIndex();
    if (index) { index.clearFile(fileUri); }
}

export function clearAllCustomData(): void {
    // LineIndex.clear() 由 IndexedStore.clear() 统一调用，这里不需要独立操作
}

// ================================================================
// 工具
// ================================================================

function parsePattern(pattern: string): (string | { capture: true })[] | null {
    const parts = pattern.trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === '') { return null; }
    const tokens: (string | { capture: true })[] = [];
    for (const part of parts) {
        tokens.push(part.match(/^<.+>$/) ? { capture: true } : part);
    }
    return tokens;
}
