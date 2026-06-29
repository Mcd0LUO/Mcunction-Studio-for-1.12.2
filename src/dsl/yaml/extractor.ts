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
    /** 每个 token 要么是字面量字符串，要么是 { capture: true } */
    tokens: (string | { capture: true })[];
    source: string; // YAML 文件名（调试用）
}

/** 存储自定义提取数据: type → values */
const customData = new Map<string, Set<string>>();

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

    const parsed: ParsedRule = { command, type: rule.type, tokens, source };

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

/** 对所有已注册规则逐条匹配，提取数据 */
export function applyExtract(cmdName: string, commands: string[]): void {
    const rules = rulesByCommand.get(cmdName);
    if (!rules) { return; }

    for (const rule of rules) {
        // commands[0] 是命令名，commands[1+] 是参数
        const args = commands.slice(1);

        // 匹配字面量 + 提取捕获值
        const captured: string[] = [];
        let matched = true;

        for (let i = 0; i < rule.tokens.length; i++) {
            const token = rule.tokens[i];
            if (typeof token === 'string') {
                // 字面量：必须精确匹配
                if (i >= args.length || args[i] !== token) {
                    matched = false;
                    break;
                }
            } else {
                // 捕获组 <name>：取当前位置的值
                if (i >= args.length || !args[i]) {
                    matched = false;
                    break;
                }
                captured.push(args[i]);
            }
        }

        if (matched && captured.length > 0) {
            let values = customData.get(rule.type);
            if (!values) {
                values = new Set();
                customData.set(rule.type, values);
            }
            for (const v of captured) {
                values.add(v);
            }
        }
    }
}

/** 获取某类型的所有已提取值 */
export function getCustomData(type: string): string[] {
    const values = customData.get(type);
    return values ? [...values] : [];
}

/** 清除所有自定义提取数据（DataLoader reload 时调用） */
export function clearAllCustomData(): void {
    customData.clear();
}

/** 清除所有规则 */
export function clearAllRules(): void {
    rulesByCommand.clear();
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
