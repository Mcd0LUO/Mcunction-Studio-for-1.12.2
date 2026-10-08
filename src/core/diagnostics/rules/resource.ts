/**
 * 引用类规则 —— 索引驱动，判定"引用的东西不存在"。
 *
 * 级别选择是这一族的重点：**默认给 Hint/Warning 而不是 Error**。
 * 数据包常常把定义与引用拆到不同文件，用户编辑中间态会短暂引用未定义的对象；
 * 若标红，一半的编辑时间屏幕上都是红线，诊断就等于没有。
 * 红线只留给"即使全部文件都在也必然失败"的情况（如 function 指向不存在的文件）。
 */
import type { Diagnostic, DiagnosticRule, RuleContext } from '../types';
import { selectorsOf, scoreObjectiveOf } from '../selector';
import { tokenSpan } from './syntax';

/** 在一行里找出所有选择器 token 及其 predicate 的便捷封装 */
function eachSelector(rc: RuleContext, fn: (tokenIndex: number, key: string, value: string) => void): void {
    for (const { tokenIndex, parsed } of selectorsOf(rc.tokens)) {
        for (const p of parsed.predicates) { fn(tokenIndex, p.key, p.value); }
    }
}

/** 选择器内 score_X 引用的目标不存在 */
export const undefinedScoreboardInSelector: DiagnosticRule = {
    id: 'resource/undefined-scoreboard',
    description: '引用的记分板目标未在本数据包中定义',
    defaultLevel: 'hint',
    check(rc: RuleContext): readonly Diagnostic[] {
        const out: Diagnostic[] = [];
        eachSelector(rc, (_ti, key, value) => {
            const obj = scoreObjectiveOf(key);
            if (!obj) { return; }
            if (rc.ctx.hasScoreboard(obj.name)) { return; }
            out.push(rc.report(
                undefinedScoreboardInSelector,
                tokenSpan(rc, _ti),
                `选择器引用的记分板目标 "${obj.name}" 未定义`,
            ));
        });
        return out;
    },
};

/** scoreboard 子命令里引用的目标/队伍 */
export const undefinedScoreboard: DiagnosticRule = {
    id: 'resource/undefined-scoreboard-command',
    description: 'scoreboard 命令引用了未定义的目标',
    defaultLevel: 'hint',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        const out: Diagnostic[] = [];

        // scoreboard players <op> <target> <objective>
        // scoreboard players operation <t> <op> <obj1> <obj2>
        if (t[1] === 'players' && t[2] !== 'tag') {
            const isOp = t[2] === 'operation';
            const objectiveIdx = isOp ? 5 : 3;
            for (const idx of isOp ? [4, 5] : [objectiveIdx]) {
                const name = t[idx];
                if (!name || name.startsWith('@') || name.startsWith('#')) { continue; }
                if (rc.ctx.hasScoreboard(name)) { continue; }
                out.push(rc.report(
                    undefinedScoreboard,
                    tokenSpan(rc, idx),
                    `记分板目标 "${name}" 未定义`,
                ));
            }
        }

        // scoreboard players tag <target> add|remove <tag>
        if (t[1] === 'players' && t[2] === 'tag' && (t[4] === 'add' || t[4] === 'remove')) {
            if (t[5] && !rc.ctx.hasTag(t[5])) {
                out.push(rc.report(undefinedScoreboard, tokenSpan(rc, 5), `标签 "${t[5]}" 未定义`));
            }
        }

        // scoreboard teams <op> <team>
        if (t[1] === 'teams' && t[3]) {
            const team = t[3];
            const isDefine = t[2] === 'add';
            if (!isDefine && !rc.ctx.hasTeam(team)) {
                out.push(rc.report(undefinedScoreboard, tokenSpan(rc, 3), `队伍 "${team}" 未定义`));
            }
        }

        // scoreboard objectives setdisplay ... <objective>
        if (t[1] === 'objectives' && t[2] === 'setdisplay' && t[4]) {
            if (!rc.ctx.hasScoreboard(t[4])) {
                out.push(rc.report(undefinedScoreboard, tokenSpan(rc, 4), `记分板目标 "${t[4]}" 未定义`));
            }
        }

        return out;
    },
};

/** trigger <objective> */
export const undefinedTriggerObjective: DiagnosticRule = {
    id: 'resource/undefined-trigger',
    description: 'trigger 命令的目标不存在（不会执行，且不会报错）',
    defaultLevel: 'warning',
    commands: ['trigger'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const name = rc.tokens[1];
        if (!name || rc.ctx.hasScoreboard(name)) { return []; }
        return [rc.report(undefinedTriggerObjective, tokenSpan(rc, 1), `trigger 的目标 "${name}" 未定义（该命令会被游戏静默忽略）`)];
    },
};

/**
 * function / gamerule gameLoopFunction 指向不存在的文件。
 *
 * 这是**少数敢标红**的引用规则：函数调用目标不存在时，
 * 无论其他文件状态如何都必然失败，不存在中间态问题。
 */
export const undefinedFunction: DiagnosticRule = {
    id: 'resource/undefined-function',
    description: 'function 引用的函数文件不存在',
    defaultLevel: 'error',
    commands: ['function', 'gamerule'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        let idx = -1;
        if (t[0] === 'function') {
            idx = 1;
        } else if (t[0] === 'gamerule' && t[1] === 'gameLoopFunction') {
            idx = 2;
        }
        if (idx < 0) { return []; }
        const name = t[idx];
        if (!name) { return []; }
        if (!rc.ctx.hasFunction(name)) {
            return [rc.report(undefinedFunction, tokenSpan(rc, idx), `函数 "${name}" 不存在（data/functions 下没有对应文件）`)];
        }
        return [];
    },
};

/** advancement grant|revoke 引用不存在的进度 */
export const undefinedAdvancement: DiagnosticRule = {
    id: 'resource/undefined-advancement',
    description: 'advancement 命令引用的进度不存在',
    defaultLevel: 'hint',
    commands: ['advancement'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        // advancement grant|revoke <target> only|from|until|through <res>
        if ((t[1] !== 'grant' && t[1] !== 'revoke')) { return []; }
        const idx = 4;
        const name = t[idx];
        if (!name) { return []; }
        if (!rc.ctx.hasAdvancement(name)) {
            return [rc.report(undefinedAdvancement, tokenSpan(rc, idx), `进度 "${name}" 不存在`)];
        }
        return [];
    },
};

/**
 * 重复定义。
 *
 * 已有 IndexedStore._scoreboardDefs / _teamDefs 的定义点集合，
 * 这里只负责把"同名被定义 N 次"转成红线。
 */
export const duplicateScoreboard: DiagnosticRule = {
    id: 'resource/duplicate-scoreboard',
    description: '记分板目标被重复定义（后定义者覆盖前者）',
    defaultLevel: 'warning',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        if (t[1] !== 'objectives' || t[2] !== 'add' || !t[3]) { return []; }
        const defs = rc.ctx.definitionsOf('scoreboard', t[3]);
        if (defs.length <= 1) { return []; }
        return [rc.report(
            duplicateScoreboard,
            tokenSpan(rc, 3),
            `记分板目标 "${t[3]}" 被定义了 ${defs.length} 次（定义于 ${defs.join('、')}），只有最后一次生效`,
        )];
    },
};

export const duplicateTeam: DiagnosticRule = {
    id: 'resource/duplicate-team',
    description: '队伍被重复定义',
    defaultLevel: 'warning',
    commands: ['scoreboard'],
    check(rc: RuleContext): readonly Diagnostic[] {
        const t = rc.tokens;
        if (t[1] !== 'teams' || t[2] !== 'add' || !t[3]) { return []; }
        const defs = rc.ctx.definitionsOf('team', t[3]);
        if (defs.length <= 1) { return []; }
        return [rc.report(
            duplicateTeam,
            tokenSpan(rc, 3),
            `队伍 "${t[3]}" 被定义了 ${defs.length} 次（定义于 ${defs.join('、')}）`,
        )];
    },
};

export const resourceRules: readonly DiagnosticRule[] = [
    undefinedScoreboardInSelector,
    undefinedScoreboard,
    undefinedTriggerObjective,
    undefinedFunction,
    undefinedAdvancement,
    duplicateScoreboard,
    duplicateTeam,
];