/**
 * scoreboard 语法与诊断核验表。
 *
 * 语法取自 wiki **Scoreboard#Command reference** 一节
 * （rev 1215518 / 2018-05-26，1.12.2 时期）。
 * 注意：`Commands/scoreboard` 页只有一行转述，真表格在 Scoreboard 页。
 *
 * 为什么需要这张表：scoreboard 有 27 种写法、下标各不相同，而诊断规则要按
 * 下标取"哪一个 token 才是记分板目标/队伍/标签"。写错一个下标，表现就是
 * 误报（合法写法标红）或漏报（真错误看不见）—— 两者都不报错，只能靠穷举发现。
 *
 * 本表建立时查出并修掉的问题：
 *   · `players tag … add` 被当成引用去查"是否存在" → 新增标签一律误报"未定义"
 *   · 队伍名超 16 字符不报（wiki 明确与目标名同为 16）
 *   · 队伍显示名超 32 字符不报
 *   · objectives 的显示名起点写成 t.slice(4)，把 <criteria> 也算进去了 →
 *     显示名恰好 32 字符时误报超长
 */
import * as assert from 'assert';
import { ValidationContext } from '../../core/diagnostics/types';
import { DiagnosticRunner, ALL_RULES } from '../../core/diagnostics/runner';
import { CompletionEngine } from '../../dsl/engine';
import { registerAll } from '../../dsl/commands/index';
import { DataLoader } from '../../core/DataLoader';

let engine: CompletionEngine;

before(() => {
    engine = new CompletionEngine(DataLoader.getInstance());
    registerAll(engine);
});

/** 索引里"已定义"的东西：诊断不该对它们报未定义 */
const CTX = new ValidationContext({
    commandTable: () => engine.commandNames(),
    hasScoreboard: (n) => ['obj', 'obj2', 'trig', 'a', 'b'].includes(n),
    hasTeam: (n) => n === 'red',
    hasTag: (n) => n === 'mytag',
    hasFunction: () => true,
    hasAdvancement: () => true,
    definitionsOf: () => [],
    getScoreboardCriteria: () => undefined,
});

function ruleIds(line: string): string[] {
    const runner = new DiagnosticRunner({ rules: ALL_RULES, ctx: CTX, engine: engine as never, levels: {} });
    return runner.checkDocument([line]).map(d => d.ruleId).sort();
}

// ============================================================
// wiki 原文的 27 种写法 —— 合法，一条诊断都不该有
// ============================================================
const VALID_FORMS: readonly string[] = [
    // Objectives
    'scoreboard objectives add newobj dummy',
    'scoreboard objectives add newobj dummy My Display Name',
    'scoreboard objectives remove obj',
    'scoreboard objectives list',
    'scoreboard objectives setdisplay sidebar obj',
    'scoreboard objectives setdisplay sidebar',
    // Players
    'scoreboard players set @s obj 1',
    'scoreboard players set @s obj 1 {a:1}',
    'scoreboard players add @s obj 1',
    'scoreboard players add @s obj 1 {a:1}',
    'scoreboard players remove @s obj 1',
    'scoreboard players remove @s obj 1 {a:1}',
    'scoreboard players reset @s obj',
    'scoreboard players reset @s',
    'scoreboard players enable @s trig',
    'scoreboard players test @s obj 1',
    'scoreboard players test @s obj 1 10',
    'scoreboard players operation @s obj += @s obj2',
    'scoreboard players operation @s obj >< @s obj2',
    'scoreboard players operation @s obj = @s obj2',
    'scoreboard players list',
    'scoreboard players list @s',
    'scoreboard players tag @s add mytag',
    'scoreboard players tag @s add brandnew {a:1}',
    'scoreboard players tag @s remove mytag',
    'scoreboard players tag @s remove mytag {a:1}',
    'scoreboard players tag @s list',
    // Teams
    'scoreboard teams add newteam',
    'scoreboard teams add newteam New Team',
    'scoreboard teams remove red',
    'scoreboard teams empty red',
    'scoreboard teams join red @a',
    'scoreboard teams join red',
    'scoreboard teams join red @a @p',
    'scoreboard teams leave',
    'scoreboard teams leave @a',
    'scoreboard teams list',
    'scoreboard teams list red',
    'scoreboard teams option red color dark_red',
    'scoreboard teams option red friendlyfire false',
    'scoreboard teams option red seeFriendlyInvisibles true',
    'scoreboard teams option red nametagVisibility hideForOtherTeams',
    'scoreboard teams option red deathMessageVisibility never',
    'scoreboard teams option red collisionRule pushOwnTeam',
];

describe('diagnostics/scoreboard 语法核验表', () => {
    for (const line of VALID_FORMS) {
        it(`合法: ${line}`, () => {
            assert.deepStrictEqual(ruleIds(line), [], `合法写法被误报：${line}`);
        });
    }
});

// ============================================================
// 定义 vs 引用 —— add 创建，remove 引用
// ============================================================
describe('diagnostics/scoreboard 定义与引用', () => {
    it('players tag … add 是定义，新增标签不该报未定义', () => {
        // 曾经的 bug：add 被一起查了"是否存在"，于是新增标签一律误报
        assert.deepStrictEqual(ruleIds('scoreboard players tag @s add brandnew'), []);
        assert.deepStrictEqual(ruleIds('scoreboard players tag @s add brandnew {a:1}'), []);
    });

    it('players tag … remove 是引用，移除不存在的标签要报', () => {
        assert.ok(ruleIds('scoreboard players tag @s remove nosuch')
            .includes('resource/undefined-scoreboard-command'));
    });

    it('objectives add / teams add 是定义，不该报未定义', () => {
        assert.deepStrictEqual(ruleIds('scoreboard objectives add brandnew dummy'), []);
        assert.deepStrictEqual(ruleIds('scoreboard teams add brandnew'), []);
    });

    it('objectives remove / teams remove 不报未定义（删的就是定义点）', () => {
        assert.deepStrictEqual(ruleIds('scoreboard objectives remove obj'), []);
        assert.deepStrictEqual(ruleIds('scoreboard teams remove red'), []);
    });
});

// ============================================================
// 长度上限 —— wiki：名字 ≤16，显示名 ≤32（objectives 与 teams 相同）
// ============================================================
describe('diagnostics/scoreboard 长度上限', () => {
    const N16 = 'a'.repeat(16);
    const N17 = 'a'.repeat(17);
    const D32 = 'x'.repeat(32);
    const D33 = 'x'.repeat(33);

    it('目标名：16 通过，17 报错', () => {
        assert.deepStrictEqual(ruleIds(`scoreboard objectives add ${N16} dummy`), []);
        assert.ok(ruleIds(`scoreboard objectives add ${N17} dummy`).includes('scoreboard/name-too-long'));
    });

    it('队伍名：16 通过，17 报错（与目标名同为 16）', () => {
        assert.deepStrictEqual(ruleIds(`scoreboard teams add ${N16}`), []);
        assert.ok(ruleIds(`scoreboard teams add ${N17}`).includes('scoreboard/name-too-long'));
    });

    it('objectives 显示名：32 通过，33 报错（criteria 不能算进去）', () => {
        // 曾经的 bug：起点写成 t.slice(4)，把 <criteria> 也算进显示名，
        // 于是显示名恰好 32 字符时会误报超长。
        assert.deepStrictEqual(ruleIds(`scoreboard objectives add foo dummy ${D32}`), []);
        assert.ok(ruleIds(`scoreboard objectives add foo dummy ${D33}`)
            .includes('scoreboard/display-name-too-long'));
    });

    it('teams 显示名：32 通过，33 报错（没有 criteria，起点比 objectives 前一位）', () => {
        assert.deepStrictEqual(ruleIds(`scoreboard teams add red ${D32}`), []);
        assert.ok(ruleIds(`scoreboard teams add red ${D33}`)
            .includes('scoreboard/display-name-too-long'));
    });

    it('没有显示名时不报', () => {
        assert.deepStrictEqual(ruleIds('scoreboard objectives add foo dummy'), []);
        assert.deepStrictEqual(ruleIds('scoreboard teams add foo'), []);
    });
});

// ============================================================
// 引用不存在的东西 —— 规则不能是死的
// ============================================================
describe('diagnostics/scoreboard 未定义引用', () => {
    const CASES: ReadonlyArray<readonly [string, string]> = [
        ['scoreboard players set @s nosuch 1', '记分板目标'],
        ['scoreboard players add @s nosuch 1', '记分板目标'],
        ['scoreboard players remove @s nosuch 1', '记分板目标'],
        ['scoreboard players reset @s nosuch', '记分板目标'],
        ['scoreboard players enable @s nosuch', '记分板目标'],
        ['scoreboard players test @s nosuch 1', '记分板目标'],
        ['scoreboard players operation @s nosuch += @s obj', '记分板目标'],
        ['scoreboard players operation @s obj += @s nosuch', '记分板目标'],
        ['scoreboard objectives setdisplay sidebar nosuch', '记分板目标'],
        ['scoreboard teams join nosuch @a', '队伍'],
        ['scoreboard teams option nosuch color red', '队伍'],
        ['scoreboard teams empty nosuch', '队伍'],
        ['scoreboard players tag @s remove nosuch', '标签'],
    ];
    for (const [line, what] of CASES) {
        it(`未定义${what}: ${line}`, () => {
            assert.ok(ruleIds(line).includes('resource/undefined-scoreboard-command'),
                `应报未定义：${line}`);
        });
    }

    it('选择器里的未定义目标', () => {
        assert.ok(ruleIds('kill @a[score_nosuch=1]').includes('resource/undefined-scoreboard'));
    });
});

// ============================================================
// int32 边界（记分板只能存 32 位有符号整数）
// ============================================================
describe('diagnostics/scoreboard int32 边界', () => {
    it('边界值通过，越界报错', () => {
        assert.deepStrictEqual(ruleIds('scoreboard players set @s obj 2147483647'), []);
        assert.deepStrictEqual(ruleIds('scoreboard players set @s obj -2147483648'), []);
        assert.ok(ruleIds('scoreboard players set @s obj 2147483648').includes('score/out-of-int32'));
        assert.ok(ruleIds('scoreboard players set @s obj -2147483649').includes('score/out-of-int32'));
    });
});
