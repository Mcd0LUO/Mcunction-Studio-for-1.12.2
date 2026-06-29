/**
 * YAML 数据提取器 — 从函数文件中按规则提取自定义数据
 *
 * 示例：pattern "set <name>" 应用于命令 /warp set lobby
 * → token[0]="set" 匹配 commands[1]="set"
 * → <name> 对应 commands[2]="lobby" → 提取 "lobby" 存入 type "warp"
 */

import { YamlExtractRule } from './types';

/** 解析后的匹配规则 */
interface ParsedRule {
    command: string;
    type: string;
    types?: string[];     // 按捕获位置指定 type
    tokens: (string | { capture: true })[];
    source: string;
}

/** 存储自定义提取数据: type → values（全局汇总，快速查询） */
const customData = new Map<string, Set<string>>();
/** 文件级索引: fileUri → (type → values)，用于单文件清除 */
const fileEntries = new Map<string, Map<string, Set<string>>>();

/** 解析后的规则: command → rules[] */
const rulesByCommand = new Map<string, ParsedRule[]>();

/** 注册提取规则，返回需要监听的命令名 */
export function registerExtractRule(
    command: string,
    rule: YamlExtractRule,
    source: string
): void {
    const tokens = parsePattern(rule.pattern);
    if (!tokens) {
        console.warn(`[YAML] ${source}: 无效的 extract pattern "${rule.pattern}"`);
        return;
    }

    const parsed: ParsedRule = { command, type: rule.type, types: rule.types, tokens, source };

    const existing = rulesByCommand.get(command);
    if (existing) {
        existing.push(parsed);
    } else {
        rulesByCommand.set(command, [parsed]);
    }
}

/** 清除指定命令的所有提取规则 */
export function unregisterCommandRules(command: string): void {
    rulesByCommand.delete(command);
}

/** 获取某类型的所有已提取值 */
export function getCustomData(type: string): string[] {
    const values = customData.get(type);
    return values ? [...values] : [];
}

/** 删除指定文件的所有提取值（增量重解析时调用） */
export function clearFileExtract(fileUri: string): void {
    const fileData = fileEntries.get(fileUri);
    if (!fileData) { return; }
    for (const [type, fileValues] of fileData) {
        const global = customData.get(type);
        if (global) { for (const v of fileValues) { global.delete(v); } }
    }
    fileEntries.delete(fileUri);
}

/** DataLoader loadData 前清空所有 */
export function clearAllCustomData(): void {
    customData.clear();
    fileEntries.clear();
}

/** 清除所有规则 */
export function clearAllRules(): void {
    rulesByCommand.clear();
}

// ================================================================
// 内部 — 写入同时更新 fileIndex
// ================================================================

function addToType(type: string, value: string, fileUri: string): void {
    // 全局
    let global = customData.get(type);
    if (!global) { global = new Set(); customData.set(type, global); }
    global.add(value);

    // 文件索引
    let ft = fileEntries.get(fileUri);
    if (!ft) { ft = new Map(); fileEntries.set(fileUri, ft); }
    let fvs = ft.get(type);
    if (!fvs) { fvs = new Set(); ft.set(type, fvs); }
    fvs.add(value);
}

/** 对单行命令逐条匹配规则，提取数据到全局 + 文件索引 */
export function applyExtractForFile(cmdName: string, commands: string[], fileUri: string): void {
    const rules = rulesByCommand.get(cmdName);
    if (!rules) { return; }
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
        if (rule.types && rule.types.length > 0) {
            for (let i = 0; i < captured.length && i < rule.types.length; i++) {
                addToType(rule.types[i], captured[i], fileUri);
            }
        } else {
            for (const v of captured) { addToType(rule.type, v, fileUri); }
        }
    }
}

/**
 * 解析 pattern 字符串为 token 数组。
 * "set <name>" → ["set", { capture: true }]
 * "<location>" → [{ capture: true }]
 * 无效 pattern 返回 null
 */
function parsePattern(pattern: string): (string | { capture: true })[] | null {
    const parts = pattern.trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === '') { return null; }

    const tokens: (string | { capture: true })[] = [];
    for (const part of parts) {
        const m = part.match(/^<(.+)>$/);
        if (m) {
            tokens.push({ capture: true });
        } else {
            tokens.push(part);
        }
    }
    return tokens;
}
