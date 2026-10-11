/**
 * 取值类规则 —— 纯解析，不依赖索引。
 *
 * 涉及的游戏事实均已核对 wiki（2018-05 修订，1.12.2 发布前）确认，
 * 不可凭记忆书写：
 *
 *   · 记分板值在 NBT 中存为 int（32 位有符号），范围 [-2147483648, 2147483647]
 *   · 记分板目标 name 最多 16 字符，display name 最多 32 字符
 *   · 1.12.2 选择器 score 谓词为 score_<name>=<上界> / score_<name>_min=<下界>
 *
 * 详见 docs/plans/2026-07-20-diagnostics-design.md §5.2 §5.3
 */
import type { Diagnostic, DiagnosticRule, RuleContext } from '../types';
import { INT32_MAX, INT32_MIN, inInt32Range, parseInt32Strict, scoreObjectiveOf, selectorsOf } from '../selector';
import { DISPLAY_NAME_MAX, NAME_MAX, codePointLength } from '../../symbols/naming';
import { tokenSpan } from './syntax';

/** 记分板操作里出现超出 int32 的整数常量 */
export const scoreOutOfRange: DiagnosticRule = {
    id: 'score/out-of-int32',
    description: '整数常量超出 32 位有符号范围（记分板值上限 2147483647）',
    defaultLevel: 'warning',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        const out: Diagnostic[] = [];

        // 需操作数的位置：players <op> <target> <objective> <value...>
        //                 players operation <t> <op> <o1> <o2> <value>
        let from = 4;
        if (t[1] === 'players') {
            if (t[2] === 'operation') { from = 5; }
            else if (['add', 'remove', 'set', 'reset'].includes(t[2])) { from = 4; }
            else { return out; }   // enable/disable/tag/test 不带数值
        } else if (t[1] !== 'objectives' && t[1] !== 'teams') {
            return out;
        }

        for (let i = from; i < t.length; i++) {
            const v = parseInt32Strict(t[i]);
            if (v === null) { continue; }   // 非整数（如 *= 表达式）跳过
            if (inInt32Range(v)) { continue; }
            const dir = v > 0 ? '超过' : '低于';
            out.push(rc.report(
                scoreOutOfRange,
                tokenSpan(rc, i),
                `数值 ${t[i]} ${dir}记分板可存储范围 [${INT32_MIN}, ${INT32_MAX}]，执行时会溢出`,
            ));
        }
        return out;
    },
};

/** 记分板目标名超 16 字符（上限来源：wiki Commands/scoreboard，见 symbols/naming） */
export const scoreboardNameTooLong: DiagnosticRule = {
    id: 'scoreboard/name-too-long',
    description: '记分板目标名称超过 16 字符（游戏拒绝创建）',
    defaultLevel: 'error',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        if (t[1] !== 'objectives' || (t[2] !== 'add' && t[2] !== 'remove')) { return []; }
        const name = t[3];
        if (!name || codePointLength(name) <= NAME_MAX) { return []; }
        return [rc.report(
            scoreboardNameTooLong,
            tokenSpan(rc, 3),
            `记分板目标名 "${name}" 有 ${codePointLength(name)} 个字符，超过上限 ${NAME_MAX}`,
        )];
    },
};

/** 记分板显示名超 32 字符 */
export const scoreboardDisplayNameTooLong: DiagnosticRule = {
    id: 'scoreboard/display-name-too-long',
    description: '记分板显示名超过 32 字符',
    defaultLevel: 'warning',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        if (t[1] !== 'objectives' || t[2] !== 'add' || t[4] === undefined) { return []; }
        const display = t.slice(4).join(' ');
        if (codePointLength(display) <= DISPLAY_NAME_MAX) { return []; }
        return [rc.report(
            scoreboardDisplayNameTooLong,
            tokenSpan(rc, 4),
            `显示名有 ${codePointLength(display)} 个字符，超过上限 ${DISPLAY_NAME_MAX}`,
        )];
    },
};

/**
 * 选择器记分板范围无效：score_X_min > score_X（下界高于上界，永远选不中任何实体）。
 *
 * 1.12.2 的两个谓词可并存构成区间：
 *   @a[score_points_min=30,score_points=39] → 30 <= s <= 39
 * 若 score_points_min=90 而 score_points=39，该选择器**恒为空集**，
 * 是很隐蔽的逻辑 bug（游戏不报错，只是永远不触发）。
 */
export const invalidScoreRange: DiagnosticRule = {
    id: 'selector/invalid-score-range',
    description: 'score_X_min 的值大于 score_X，该选择器恒为空集',
    defaultLevel: 'error',
    check(rc: RuleContext): readonly Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const { tokenIndex, parsed } of selectorsOf(rc.tokens)) {
            let minKey: string | null = null;
            let maxKey: string | null = null;
            for (const p of parsed.predicates) {
                const obj = scoreObjectiveOf(p.key);
                if (!obj) { continue; }
                if (obj.isMin) { minKey = p.key; } else { maxKey = p.key; }
            }
            if (minKey === null || maxKey === null) { continue; }

            const minVal = parsed.predicates.find(p => p.key === minKey);
            const maxVal = parsed.predicates.find(p => p.key === maxKey);
            if (!minVal || !maxVal) { continue; }
            const min = parseInt32Strict(minVal.value);
            const max = parseInt32Strict(maxVal.value);
            if (min === null || max === null) { continue; }
            if (min <= max) { continue; }

            out.push(rc.report(
                invalidScoreRange,
                tokenSpan(rc, tokenIndex),
                `下界 ${minKey}=${min} 大于上界 ${maxKey}=${max}，该选择器永远不会匹配到实体`,
            ));
        }
        return out;
    },
};

/** 选择器 count 不是正整数 */
export const invalidCount: DiagnosticRule = {
    id: 'selector/invalid-count',
    description: '选择器 c= 必须是正整数',
    defaultLevel: 'warning',
    check(rc: RuleContext): readonly Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const { tokenIndex, parsed } of selectorsOf(rc.tokens)) {
            for (const p of parsed.predicates) {
                if (p.key !== 'c') { continue; }
                const n = parseInt32Strict(p.value);
                if (n !== null && n >= 0) { continue; }
                out.push(rc.report(
                    invalidCount,
                    tokenSpan(rc, tokenIndex),
                    `选择器 c= 需要非负整数，收到 "${p.value}"`,
                ));
            }
        }
        return out;
    },
};

export const valueRules: readonly DiagnosticRule[] = [
    scoreOutOfRange,
    scoreboardNameTooLong,
    scoreboardDisplayNameTooLong,
    invalidScoreRange,
    invalidCount,
];