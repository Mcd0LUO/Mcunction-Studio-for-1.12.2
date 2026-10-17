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

/**
 * 记分板目标名 / 队伍名超 16 字符。
 *
 * wiki（Scoreboard#Command reference，2018-05-26 修订）原文：
 *   objectives add: "''name'' must not be used by an existing objective,
 *                    and must be at most 16 characters."
 *   teams add:      "''name'' must not be used by an existing team,
 *                    and must be at most 16 characters."
 *
 * ⚠️ 队伍名与目标名上限相同，此前只查了 objectives ——
 *    `scoreboard teams add <17 字符>` 完全不报。
 */
export const scoreboardNameTooLong: DiagnosticRule = {
    id: 'scoreboard/name-too-long',
    description: '记分板目标名或队伍名超过 16 字符（游戏拒绝创建）',
    defaultLevel: 'error',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        const isObj = t[1] === 'objectives' && (t[2] === 'add' || t[2] === 'remove');
        const isTeam = t[1] === 'teams' && (t[2] === 'add' || t[2] === 'remove' || t[2] === 'empty');
        if (!isObj && !isTeam) { return []; }
        const name = t[3];
        if (!name || codePointLength(name) <= NAME_MAX) { return []; }
        const what = isObj ? '记分板目标名' : '队伍名';
        return [rc.report(
            scoreboardNameTooLong,
            tokenSpan(rc, 3),
            `${what} "${name}" 有 ${codePointLength(name)} 个字符，超过上限 ${NAME_MAX}`,
        )];
    },
};

/**
 * 记分板显示名超 32 字符。
 *
 * wiki 原文：objectives add 与 teams add 的 "''display name'' must be at most
 * 32 characters."
 *
 * ⚠️ 两种写法的显示名起点**不同**：
 *   objectives add <name> <criteria> [display name...]   ← criteria 在中间
 *   teams add      <name>            [display name...]
 *   此前一律用 t.slice(4)，于是 objectives 把 <criteria> 也算进了显示名 ——
 *   `scoreboard objectives add foo dummy <32 字符>` 会被误报成超长。
 */
export const scoreboardDisplayNameTooLong: DiagnosticRule = {
    id: 'scoreboard/display-name-too-long',
    description: '记分板显示名超过 32 字符',
    defaultLevel: 'warning',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        let from: number;
        if (t[1] === 'objectives' && t[2] === 'add') {
            from = 5;          // t[3]=name, t[4]=criteria, t[5..]=display name
        } else if (t[1] === 'teams' && t[2] === 'add') {
            from = 4;          // t[3]=name, t[4..]=display name
        } else {
            return [];
        }
        if (t[from] === undefined) { return []; }
        const display = t.slice(from).join(' ');
        if (codePointLength(display) <= DISPLAY_NAME_MAX) { return []; }
        return [rc.report(
            scoreboardDisplayNameTooLong,
            tokenSpan(rc, from),
            `显示名有 ${codePointLength(display)} 个字符，超过上限 ${DISPLAY_NAME_MAX}`,
        )];
    },
};

/**
 * 选择器记分板取值区间为空：同一目标的**全部**上下界谓词无法同时满足。
 *
 * 1.12.2 的两个谓词都是**单边**约束（已确认）：
 *   score_X=v      →  score <= v   （上界）
 *   score_X_min=v  →  score >= v   （下界）
 * 二者并存即构成闭区间：@a[score_points_min=30,score_points=39] → 30 <= s <= 39
 *
 * 同目标可以出现**多个**谓词，此时必须全部满足，取值区间取**闭包**：
 *   有效下界 = max(所有 _min 的值)
 *   有效上界 = min(所有上界的值)
 * 区间为空 ⇔ 有效下界 > 有效上界 → 该选择器恒为空集
 * （游戏不报错，只是永远不触发，是很隐蔽的逻辑 bug）。
 *
 * ⚠️ 两处曾写错：
 *   1. 只记住"最后一个 min"和"最后一个 max"，**跨目标**乱配：
 *        @a[score_a_min=1,score_b=-1]
 *      里 a 的下界与 b 的上界被拿来比大小 → 误报。a 与 b 是独立目标。
 *   2. 改成按目标分组后，又只留了**最后一个**谓词，后面的松约束会掩盖
 *      前面的紧约束：
 *        @a[score_a_min=30,score_a_min=10,score_a=20]
 *      只看最后一个是 min=10、max=20，判定合法；
 *      但 30 与 10 都要满足 ⇒ 实际下界是 30，30 > 20 ⇒ 区间为空。
 *      必须取所有同名谓词的闭包，不能只看一种情况。
 */
export const invalidScoreRange: DiagnosticRule = {
    id: 'selector/invalid-score-range',
    description: '同一记分板目标的取值区间为空，该选择器恒为空集',
    defaultLevel: 'error',
    check(rc: RuleContext): readonly Diagnostic[] {
        // 廉价预筛：没有 '@' 就没有选择器。selectorsOf() 要做 token 遍历 +
        // 方括号状态机，而这条规则对**每一行**都会跑。
        if (!rc.lineText.includes('@')) { return []; }
        const out: Diagnostic[] = [];
        for (const { tokenIndex, parsed } of selectorsOf(rc.tokens)) {
            // 目标名 → 该目标的全部下界/上界谓词（**不是**只留一个）
            const byObjective = new Map<string, {
                mins: { key: string; value: number }[];
                maxs: { key: string; value: number }[];
            }>();

            for (const p of parsed.predicates) {
                const obj = scoreObjectiveOf(p.key);
                if (!obj) { continue; }
                const v = parseInt32Strict(p.value);
                if (v === null) { continue; }   // 非整数（如 NBT 形式）跳过
                let slot = byObjective.get(obj.name);
                if (!slot) { slot = { mins: [], maxs: [] }; byObjective.set(obj.name, slot); }
                if (obj.isMin) { slot.mins.push({ key: p.key, value: v }); }
                else { slot.maxs.push({ key: p.key, value: v }); }
            }

            for (const [name, slot] of byObjective) {
                // 只有单边约束时不构成区间，永远可满足
                if (slot.mins.length === 0 || slot.maxs.length === 0) { continue; }

                // 闭包：下界取最大、上界取最小
                const lower = slot.mins.reduce((a, b) => (b.value > a.value ? b : a));
                const upper = slot.maxs.reduce((a, b) => (b.value < a.value ? b : a));
                if (lower.value <= upper.value) { continue; }

                const lowerDesc = slot.mins.length > 1
                    ? `max(${slot.mins.map(m => `${m.key}=${m.value}`).join(', ')})=${lower.value}`
                    : `${lower.key}=${lower.value}`;
                const upperDesc = slot.maxs.length > 1
                    ? `min(${slot.maxs.map(m => `${m.key}=${m.value}`).join(', ')})=${upper.value}`
                    : `${upper.key}=${upper.value}`;

                out.push(rc.report(
                    invalidScoreRange,
                    tokenSpan(rc, tokenIndex),
                    `目标 "${name}" 的取值区间为空：有效下界 ${lowerDesc} 大于有效上界 ${upperDesc}，`
                    + '该选择器永远不会匹配到实体',
                ));
            }
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
        // 廉价预筛：没有 '@' 就没有选择器
        if (!rc.lineText.includes('@')) { return []; }
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