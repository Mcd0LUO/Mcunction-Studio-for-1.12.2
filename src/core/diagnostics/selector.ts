/**
 * 选择器解析（纯函数，零依赖）。
 *
 * 1.12.2 的选择器语法**与 1.13+ 完全不同**，这是本扩展最易出错的地方：
 *
 *   1.12.2：[score_<name>=<SCORE>]       分数 <= SCORE
 *           [score_<name>_min=<SCOREMIN>] 分数 >= SCOREMIN
 *   1.13+ ：[scores={<name>=<range>}]     支持 .. 范围
 *
 * 1.12.2 里两个 predicate 可以并存，构成区间：
 *   @a[score_points_min=30,score_points=39]  →  30 <= 分数 <= 39
 *
 * 已核对 wiki 2018-05-31 版本（1.12.2 发布前）的 Commands 页面原文确认，
 * 不可凭记忆书写。详见 docs/plans/2026-07-20-diagnostics-design.md §5.2
 */

export interface SelectorPredicate {
    /** 原始键，如 "score_points_min"、"c"、"type" */
    readonly key: string;
    readonly value: string;
    /** 该 predicate 在选择器字符串中的字符起点（相对整个 token） */
    readonly start: number;
    readonly end: number;
}

export interface ParsedSelector {
    /** '@' 后紧跟的基础选择器：a/s/p/e/r；不是选择器则为 null */
    readonly base: string | null;
    /** token 中 '@' 的下标，用于把 span 映射回原行 */
    readonly atIndex: number;
    readonly predicates: readonly SelectorPredicate[];
}

/**
 * 解析一个选择器 token。
 *
 * @returns 不以 @ 开头或格式非法的返回 null（调用方据此跳过）
 */
export function parseSelector(token: string): ParsedSelector | null {
    const at = token.indexOf('@');
    if (at < 0) { return null; }
    const baseChar = token[at + 1];
    if (!baseChar || !'asper'.includes(baseChar)) { return null; }
    if (at + 2 < token.length && !'['.includes(token[at + 2])) { return null; }

    const open = token.indexOf('[', at);
    if (open < 0) {
        return { base: baseChar, atIndex: at, predicates: [] };
    }
    const close = token.lastIndexOf(']');
    if (close <= open) { return null; }

    const inner = token.slice(open + 1, close);
    const predicates: SelectorPredicate[] = [];
    let i = 0;
    while (i < inner.length) {
        const eq = inner.indexOf('=', i);
        if (eq < 0) { break; }
        const key = inner.slice(i, eq).trim();
        let j = eq + 1;
        while (j < inner.length && inner[j] !== ',') { j++; }
        const value = inner.slice(eq + 1, j).trim();
        if (key !== '') {
            predicates.push({
                key,
                value,
                start: open + 1 + i,
                end: open + 1 + j,
            });
        }
        i = j + 1;
    }

    return { base: baseChar, atIndex: at, predicates };
}

/**
 * 从 key 中取出记分板目标名。
 *
 * `score_points_min` → `points`
 * `score_points`     → `points`
 * 其他键返回 null。
 *
 * 注意 objective 名可以含下划线，所以只能按**最后一个** `_min` 判定后缀。
 */
export function scoreObjectiveOf(key: string): { name: string; isMin: boolean } | null {
    if (!key.startsWith('score_')) { return null; }
    const rest = key.slice('score_'.length);
    if (rest.endsWith('_min')) {
        const name = rest.slice(0, -'_min'.length);
        return name === '' ? null : { name, isMin: true };
    }
    return { name: rest, isMin: false };
}

/** 32 位有符号整数边界（NBT 中 score 存为 int，超出即溢出） */
export const INT32_MIN = -2147483648;
export const INT32_MAX = 2147483647;

/** 严格解析十进制整数；返回 null 表示不是合法整数（支持前导 +/-） */
export function parseInt32Strict(text: string): number | null {
    if (!/^[+-]?\d+$/u.test(text)) { return null; }
    const n = Number(text);
    if (!Number.isSafeInteger(n)) { return null; }
    return n;
}

export function inInt32Range(n: number): boolean {
    return n >= INT32_MIN && n <= INT32_MAX;
}

/** 遍历一行里所有选择器 token（带 token 下标） */
export interface TokenSelector {
    readonly tokenIndex: number;
    readonly parsed: ParsedSelector;
}

export function selectorsOf(tokens: readonly string[]): TokenSelector[] {
    const out: TokenSelector[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const p = parseSelector(tokens[i]);
        if (p) { out.push({ tokenIndex: i, parsed: p }); }
    }
    return out;
}