/**
 * 诊断层单元测试（Node + vscode mock）
 *
 * 覆盖三块纯逻辑：
 *   1. tokenize / isIncompleteLine —— 防误报的第一道闸，最容易写错
 *   2. 选择器解析 —— 1.12.2 专用语法（score_X / score_X_min，非 1.13 的 scores={}）
 *   3. 各条规则的正例 / 反例
 *
 * 不测 vscodeAdapter（DiagnosticCollection 只能在真实 VS Code 里验证，见 e2e）。
 */
import * as assert from 'assert';
import { tokenize, isIncompleteLine, ValidationContext, Severity } from '../../core/diagnostics/types';
import { parseSelector, scoreObjectiveOf, parseInt32Strict, inInt32Range, INT32_MAX } from '../../core/diagnostics/selector';
import { DiagnosticRunner, ALL_RULES } from '../../core/diagnostics/runner';
import { hasResName, isCaseInsensitiveFs } from '../../core/resName';
import { CompletionEngine } from '../../dsl/engine';
import { registerAll } from '../../dsl/commands/index';
import { DataLoader } from '../../core/DataLoader';

// ============================================================
// 1. 分词与 incomplete 判定
// ============================================================

describe('diagnostics/tokenize', () => {
    it('按空白切分，忽略行首缩进', () => {
        assert.deepStrictEqual(tokenize('    scoreboard players set @s foo 1'), ['scoreboard', 'players', 'set', '@s', 'foo', '1']);
    });

    it('注释行返回空数组', () => {
        assert.deepStrictEqual(tokenize('# 这是注释'), []);
        assert.deepStrictEqual(tokenize('   # 缩进注释'), []);
    });

    it('空行返回空数组', () => {
        assert.deepStrictEqual(tokenize(''), []);
        assert.deepStrictEqual(tokenize('    '), []);
    });

    it('引号内的空格不被切分', () => {
        assert.deepStrictEqual(tokenize('tellraw @a {"text":"hello world"}'), ['tellraw', '@a', '{"text":"hello world"}']);
    });

    it('转义空格不被切分（反斜杠原样保留，交由游戏解析）', () => {
        // 诊断层不做 MC 的转义还原：游戏侧看到的是 hello\ world 这个词
        assert.deepStrictEqual(tokenize('say hello\\ world'), ['say', 'hello\\ world']);
    });

    it('选择器方括号内的空格不被切分', () => {
        assert.deepStrictEqual(tokenize('kill @a[score_x=1]'), ['kill', '@a[score_x=1]']);
    });
});

describe('diagnostics/isIncompleteLine', () => {
    it('注释与空行视为未完成', () => {
        assert.strictEqual(isIncompleteLine('# x', []), true);
        assert.strictEqual(isIncompleteLine('   ', []), true);
    });

    it('引号未闭合视为未完成', () => {
        assert.strictEqual(isIncompleteLine('tellraw @a {"text":"未写完', []), true);
    });

    it('以逗号或等号结尾视为未完成', () => {
        assert.strictEqual(isIncompleteLine('give @s stone,', ['give', '@s', 'stone,']), true);
        assert.strictEqual(isIncompleteLine('scoreboard objectives add x ', ['x', '=']), true);
    });

    it('以反斜杠结尾视为转义中', () => {
        assert.strictEqual(isIncompleteLine('say hello\\', ['say', 'hello\\']), true);
    });

    it('完整命令视为已完成', () => {
        assert.strictEqual(isIncompleteLine('say hello', ['say', 'hello']), false);
        assert.strictEqual(isIncompleteLine('scoreboard players set @s obj 1', ['scoreboard', 'players', 'set', '@s', 'obj', '1']), false);
    });
});

// ============================================================
// 2. 选择器解析（1.12.2 语法）
// ============================================================

describe('diagnostics/parseSelector', () => {
    it('解析简单选择器', () => {
        const p = parseSelector('@a');
        assert.ok(p);
        assert.strictEqual(p.base, 'a');
        assert.strictEqual(p.predicates.length, 0);
    });

    it('解析 1.12.2 的 score_ 谓词（非 1.13 的 scores={}）', () => {
        const p = parseSelector('@e[score_points=39,score_points_min=30]');
        assert.ok(p);
        assert.strictEqual(p.predicates.length, 2);
        assert.deepStrictEqual(p.predicates.map(x => x.key), ['score_points', 'score_points_min']);
    });

    it('非选择器返回 null', () => {
        assert.strictEqual(parseSelector('stone'), null);
        assert.strictEqual(parseSelector('#fake'), null);
    });

    it('base 限定为 asper', () => {
        assert.ok(parseSelector('@s'));
        assert.ok(parseSelector('@p[c=1]'));
        assert.strictEqual(parseSelector('@z'), null);
    });
});

describe('diagnostics/scoreObjectiveOf', () => {
    it('区分上界与下界', () => {
        assert.deepStrictEqual(scoreObjectiveOf('score_points'), { name: 'points', isMin: false });
        assert.deepStrictEqual(scoreObjectiveOf('score_points_min'), { name: 'points', isMin: true });
    });

    it('目标名含下划线时按最后一个 _min 切分', () => {
        assert.deepStrictEqual(scoreObjectiveOf('score_my_long_name_min'), { name: 'my_long_name', isMin: true });
    });

    it('非 score_ 前缀返回 null', () => {
        assert.strictEqual(scoreObjectiveOf('tag'), null);
        assert.strictEqual(scoreObjectiveOf('type'), null);
    });
});

describe('diagnostics/int32', () => {
    it('严格解析整数', () => {
        assert.strictEqual(parseInt32Strict('42'), 42);
        assert.strictEqual(parseInt32Strict('-42'), -42);
        assert.strictEqual(parseInt32Strict('*='), null);
        assert.strictEqual(parseInt32Strict('3.5'), null);
        assert.strictEqual(parseInt32Strict(''), null);
    });

    it('int32 边界判定', () => {
        assert.strictEqual(inInt32Range(INT32_MAX), true);
        assert.strictEqual(inInt32Range(INT32_MAX + 1), false);
        assert.strictEqual(inInt32Range(-2147483648), true);
        assert.strictEqual(inInt32Range(-2147483649), false);
    });
});

// ============================================================
// 3. 规则测试
// ============================================================

interface FakeOptions {
    commands?: readonly string[];
    scoreboards?: readonly string[];
    teams?: readonly string[];
    tags?: readonly string[];
    functions?: readonly string[];
    advancements?: readonly string[];
    defs?: Record<string, readonly string[]>;
}

function makeCtx(o: FakeOptions): ValidationContext {
    const defs = o.defs ?? {};
    return new ValidationContext({
        commandTable: () => o.commands ?? [],
        hasScoreboard: (n) => (o.scoreboards ?? []).includes(n),
        hasTeam: (n) => (o.teams ?? []).includes(n),
        hasTag: (n) => (o.tags ?? []).includes(n),
        hasFunction: (n) => (o.functions ?? []).includes(n),
        hasAdvancement: (n) => (o.advancements ?? []).includes(n),
        definitionsOf: (_kind, name) => defs[name] ?? [],
        getScoreboardCriteria: () => undefined,
    });
}

let engine: CompletionEngine;

before(() => {
    engine = new CompletionEngine(DataLoader.getInstance());
    registerAll(engine);
});

function run(lines: string[], o: FakeOptions): import('../../core/diagnostics/types').Diagnostic[] {
    const runner = new DiagnosticRunner({
        rules: ALL_RULES,
        ctx: makeCtx(o),
        engine: engine as never,
        levels: {},
    });
    return runner.checkDocument(lines);
}

function ruleIds(lines: string[], o: FakeOptions): string[] {
    return run(lines, o).map(d => d.ruleId).sort();
}

// ---- 语法类 ----

describe('diagnostics/语法规则', () => {
    const all = ['say', 'scoreboard', 'kill', 'function', 'trigger', 'execute', 'gamerule', 'advancement', 'gamemode'];

    it('未知命令报错', () => {
        const d = run(['foobar @s'], { commands: all });
        assert.ok(d.some(x => x.ruleId === 'syntax/unknown-command'));
    });

    it('命令表为空时（未打开数据包）不报未知命令', () => {
        // 这是防误报的关键：没有索引时不能把每条命令都判成未知
        const d = run(['foobar @s'], { commands: [] });
        assert.strictEqual(d.filter(x => x.ruleId === 'syntax/unknown-command').length, 0);
    });

    it('叶子节点多出参数报错（gamemode 只收 <mode> [target]）', () => {
        const d = run(['gamemode creative @s extra'], { commands: all });
        assert.ok(d.some(x => x.ruleId === 'syntax/extra-token'));
    });

    it('贪婪参数后的多词文本不算错误（say <message …>）', () => {
        // wiki: say <message …> —— 省略号表示吃掉全部后续 token
        const d = run(['say hello world foo'], { commands: all });
        assert.deepStrictEqual(d.filter(x => x.ruleId.startsWith('syntax/')), []);
    });

    it('正常命令不报语法错误', () => {
        const d = run(['say hello', 'kill @s', 'scoreboard players set @s obj 1'], { commands: all });
        assert.deepStrictEqual(d.filter(x => x.ruleId.startsWith('syntax/')), []);
    });

    it('execute 之后多余内容被识别（1.12.2 无 run）', () => {
        const d = run(['execute @s ~ ~ ~ run say hi'], { commands: all });
        assert.ok(d.some(x => x.ruleId === 'syntax/execute-run'));
    });

    it('半截命令不报错（防误报）', () => {
        const d = run(['scoreboard pla'], { commands: all });
        assert.strictEqual(d.filter(x => x.ruleId === 'syntax/unknown-command').length, 0);
    });
});

// ---- 引用类 ----

describe('diagnostics/引用规则', () => {
    const all = ['say', 'scoreboard', 'kill', 'function', 'trigger', 'advancement'];

    it('未定义的 function 报错', () => {
        const d = run(['function foo:bar'], { commands: all, functions: ['foo:baz'] });
        const hit = d.find(x => x.ruleId === 'resource/undefined-function');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Error);
    });

    it('已定义的 function 不报错', () => {
        const d = run(['function foo:bar'], { commands: all, functions: ['foo:bar'] });
        assert.strictEqual(d.filter(x => x.ruleId === 'resource/undefined-function').length, 0);
    });

    it('未定义的选择器记分板目标给 hint 而非 error', () => {
        const d = run(['kill @e[score_missing=1]'], { commands: all, scoreboards: ['points'] });
        const hit = d.find(x => x.ruleId === 'resource/undefined-scoreboard');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Hint);
    });

    it('players operation 只检查 objective 位（回归：曾错用下标 3/5）', () => {
        const all2 = ['say', 'scoreboard', 'kill', 'function', 'trigger'];
        // 玩家名 Steve 未定义不应报"记分板目标未定义"；
        // 只有 kills / src 两个 objective 才是记分板目标。
        const d = run(['scoreboard players operation Steve kills += Steve src'], {
            commands: all2,
            scoreboards: ['kills', 'src'],
        });
        assert.strictEqual(
            d.filter(x => x.ruleId === 'resource/undefined-scoreboard-command').length, 0,
            `不应报记分板目标未定义：${d.map(x => x.message).join(' | ')}`,
        );
    });

    it('players operation 检出未定义的 objective', () => {
        const all2 = ['say', 'scoreboard', 'kill', 'function', 'trigger'];
        const d = run(['scoreboard players operation @s kills += @s missing'], {
            commands: all2,
            scoreboards: ['kills'],
        });
        const hit = d.find(x => x.message.includes('missing'));
        assert.ok(hit, '未定义的源 objective 应被检出');
    });

    it('trigger 未定义目标报 warning', () => {
        const d = run(['trigger nope'], { commands: all });
        const hit = d.find(x => x.ruleId === 'resource/undefined-trigger');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Warning);
    });

    it('重复定义的记分板目标报 warning', () => {
        const d = run(['scoreboard objectives add foo dummy'], {
            commands: all,
            scoreboards: ['foo'],
            defs: { foo: ['a:1', 'b:2'] },
        });
        const hit = d.find(x => x.ruleId === 'resource/duplicate-scoreboard');
        assert.ok(hit);
        assert.ok(hit.message.includes('2 次'));
    });

    it('仅定义一次不算重复', () => {
        const d = run(['scoreboard objectives add foo dummy'], {
            commands: all,
            scoreboards: ['foo'],
            defs: { foo: ['a:1'] },
        });
        assert.strictEqual(d.filter(x => x.ruleId === 'resource/duplicate-scoreboard').length, 0);
    });
});

// ---- 取值类 ----

describe('diagnostics/取值规则', () => {
    const all = ['say', 'scoreboard', 'kill'];

    it('超出 int32 报 warning', () => {
        const d = run(['scoreboard players set @s obj 3000000000'], { commands: all, scoreboards: ['obj'] });
        const hit = d.find(x => x.ruleId === 'score/out-of-int32');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Warning);
    });

    it('int32 边界内不报错', () => {
        const d = run(['scoreboard players set @s obj 2147483647'], { commands: all, scoreboards: ['obj'] });
        assert.strictEqual(d.filter(x => x.ruleId === 'score/out-of-int32').length, 0);
    });

    it('目标名超过 16 字符报错', () => {
        const long = 'a'.repeat(17);
        const d = run([`scoreboard objectives add ${long} dummy`], { commands: all });
        const hit = d.find(x => x.ruleId === 'scoreboard/name-too-long');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Error);
    });

    it('目标名恰好 16 字符不报错', () => {
        const name = 'a'.repeat(16);
        const d = run([`scoreboard objectives add ${name} dummy`], { commands: all });
        assert.strictEqual(d.filter(x => x.ruleId === 'scoreboard/name-too-long').length, 0);
    });

    it('选择器范围倒挂报错（min 大于上界）', () => {
        const d = run(['kill @a[score_points_min=90,score_points=39]'], { commands: all, scoreboards: ['points'] });
        const hit = d.find(x => x.ruleId === 'selector/invalid-score-range');
        assert.ok(hit);
        assert.strictEqual(hit.severity, Severity.Error);
    });

    it('合法范围不报错', () => {
        const d = run(['kill @a[score_points_min=30,score_points=39]'], { commands: all, scoreboards: ['points'] });
        assert.strictEqual(d.filter(x => x.ruleId === 'selector/invalid-score-range').length, 0);
    });

    it('范围相等不算倒挂', () => {
        const d = run(['kill @a[score_points_min=39,score_points=39]'], { commands: all, scoreboards: ['points'] });
        assert.strictEqual(d.filter(x => x.ruleId === 'selector/invalid-score-range').length, 0);
    });

    it('不同目标各带一边约束不算倒挂（上下界必须按目标名分组）', () => {
        // 回归：早先只记住"最后一个 min"和"最后一个 max"，跨目标乱配，
        // 于是 a 的下界 1 与 b 的上界 -1 被拿来比大小 → 误报恒为空集。
        // a 与 b 是两个独立目标，各只有一边约束，毫无矛盾。
        const cases = [
            'kill @a[score_a_min=1,score_b=-1]',
            'kill @a[score_a=-1,score_b_min=1]',
            'kill @a[score_a_min=1,score_b_min=2,score_points=5]',
            'kill @a[score_a_min=100,score_b=-100]',
        ];
        for (const line of cases) {
            const d = run([line], { commands: all, scoreboards: ['a', 'b', 'points'] });
            assert.strictEqual(
                d.filter(x => x.ruleId === 'selector/invalid-score-range').length, 0,
                `跨目标误报: ${line}`,
            );
        }
    });

    it('多目标混合时只报真正倒挂的那个目标', () => {
        const d = run(
            ['kill @a[score_a_min=1,score_b=-1,score_a=0]'],
            { commands: all, scoreboards: ['a', 'b'] },
        );
        const hits = d.filter(x => x.ruleId === 'selector/invalid-score-range');
        assert.strictEqual(hits.length, 1, `应只报 1 条，实际 ${hits.length}`);
        assert.ok(hits[0].message.includes('"a"'), `应点名目标 a，实际：${hits[0].message}`);
    });

    it('同目标多个谓词取闭包：下界取最大、上界取最小', () => {
        // 回归：按目标分组后若只留"最后一个"谓词，后面的松约束会掩盖前面的紧约束。
        //   只看最后一个是 min=10、max=20 → 判合法；
        //   但 30 与 10 都要满足 ⇒ 有效下界 30 > 上界 20 ⇒ 区间为空。
        const bad = [
            'kill @a[score_a_min=30,score_a_min=10,score_a=20]',
            'kill @a[score_a_min=10,score_a_min=30,score_a=20]',
            'kill @a[score_a=5,score_a=20,score_a_min=10]',
            'kill @a[score_a=20,score_a=5,score_a_min=10]',
            'kill @a[score_a=40,score_a=20,score_a_min=30]',
        ];
        for (const line of bad) {
            const hits = run([line], { commands: all, scoreboards: ['a'] })
                .filter(x => x.ruleId === 'selector/invalid-score-range');
            assert.strictEqual(hits.length, 1, `闭包为空应报错: ${line}`);
        }
    });

    it('同目标多个谓词但闭包非空时不报错', () => {
        const ok = [
            'kill @a[score_a_min=10,score_a_min=30,score_a=40]',   // [30,40]
            'kill @a[score_a=40,score_a=30,score_a_min=10]',       // [10,30]
            'kill @a[score_a_min=30,score_a_min=10,score_a=30]',   // [30,30] 退化为一点
            'kill @a[score_a=5,score_a=20]',                       // 只有上界
            'kill @a[score_a_min=5,score_a_min=20]',               // 只有下界
        ];
        for (const line of ok) {
            const hits = run([line], { commands: all, scoreboards: ['a'] })
                .filter(x => x.ruleId === 'selector/invalid-score-range');
            assert.strictEqual(hits.length, 0, `闭包非空不该报错: ${line}`);
        }
    });

    it('c= 负数报 warning', () => {
        const d = run(['kill @a[c=-1]'], { commands: all });
        assert.ok(d.find(x => x.ruleId === 'selector/invalid-count'));
    });
});

// ---- 调度层 ----

describe('diagnostics/DiagnosticRunner', () => {
    const all = ['say', 'scoreboard', 'kill', 'function'];

    it('级别覆盖生效（hint 提到 error）', () => {
        const runner = new DiagnosticRunner({
            rules: ALL_RULES,
            ctx: makeCtx({ commands: all }),
            engine: engine as never,
            levels: { 'resource/undefined-function': 'off' },
        });
        const d = runner.checkDocument(['function nope:none']);
        assert.strictEqual(d.filter(x => x.ruleId === 'resource/undefined-function').length, 0);
    });

    it('诊断按行号升序排列', () => {
        const d = run([
            'scoreboard objectives add toolongnamehere dummy',
            'say ok',
            'scoreboard objectives add alsotooolong dummy',
        ], { commands: all });
        const lines = d.filter(x => x.ruleId === 'scoreboard/name-too-long').map(x => x.line);
        assert.deepStrictEqual(lines, [...lines].sort((a, b) => a - b));
    });

    it('同一位置同一规则只报一次', () => {
        const d = run(['kill @a[c=-1,c=-2]'], { commands: all });
        const counts = new Map<string, number>();
        for (const x of d) {
            const k = `${x.line}:${x.span.start}:${x.ruleId}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        for (const c of counts.values()) { assert.ok(c <= 1); }
    });

    it('空文件与纯注释文件无诊断', () => {
        assert.deepStrictEqual(run([], { commands: all }), []);
        assert.deepStrictEqual(run(['# 注释', '', '   '], { commands: all }), []);
    });

    it('span 落在行内且不越界', () => {
        const lines = ['scoreboard objectives add aaaaaaaaaaaaaaaa dummy'];
        for (const d of run(lines, { commands: all })) {
            assert.ok(d.span.start >= 0, `span.start=${d.span.start}`);
            assert.ok(d.span.end <= lines[d.line].length, `span.end=${d.span.end} > ${lines[d.line].length}`);
            assert.ok(d.span.start <= d.span.end);
        }
    });
});

// ============================================================
// 回归：execute 与 scoreboard 的大面积误报
//
// 这两个命令此前都被诊断层误报：
//   · execute —— forward_root 是叶子，引擎无法消费内层命令的参数，
//     于是**每一条** execute 都被报「多余的参数」+「内容无法解析」两个 error，
//     连 `execute @s ~ ~ ~ say hello` 也不例外
//   · scoreboard —— 命令树本身漏了 [dataTag] / [display name...] / 多个子命令
//
// 语法依据均为 wiki 2018-05 修订（1.12.2 已发布、1.13 未发布）：
//   Commands/execute、Scoreboard#Command reference
// ============================================================

describe('diagnostics/execute 与 scoreboard 回归', () => {
    const all = [
        'execute', 'say', 'scoreboard', 'kill', 'function', 'gamemode',
        'setblock', 'fill', 'clone', 'particle', 'title', 'effect',
    ];

    /**
     * 这些用例只关心**命令树形状**（语法规则），
     * 因此把用到的记分板/队伍/标签/函数都登记进假索引 ——
     * 否则 resource/* 规则会正确地报"未定义"，干扰断言。
     */
    const idx: FakeOptions = {
        commands: all,
        scoreboards: ['obj'],
        teams: ['red'],
        tags: ['mytag'],
        functions: ['ns:foo'],
    };

    /** 断言这些行一条诊断都不产生（含 resource 规则） */
    function assertClean(lines: string[], why: string): void {
        for (const l of lines) {
            const d = run([l], idx);
            assert.deepStrictEqual(
                d.map(x => `${x.ruleId}: ${x.message}`), [],
                `${why}\n误报行: ${l}`,
            );
        }
    }

    it('execute 内层命令带参数不误报', () => {
        assertClean([
            'execute @s ~ ~ ~ say hello',
            'execute @s ~ ~ ~ say hello world again',
            'execute @a ~ ~ ~ scoreboard players set @s obj 1',
            'execute @s ~ ~ ~ function ns:foo',
            'execute @s 1 2 3 setblock ~ ~ ~ stone',
        ], 'execute 的内层命令参数被误判为多余 token');
    });

    it('execute 的 detect 形式不误报', () => {
        assertClean([
            'execute @s ~ ~ ~ detect ~ ~ ~ stone 0 say hi',
            'execute @s ~ ~ ~ detect ~ ~ -1 minecraft:stone 0 setblock ~ ~ ~ air',
        ], 'execute ... detect ... 未被识别');
    });

    it('execute 末尾尚未输入命令时不误报', () => {
        assertClean([
            'execute @s ~ ~ ~',
            'execute @s ~ ~ ~ detect ~ ~ ~ stone 0',
        ], '用户还没输入内层命令');
    });

    it('1.13 的 run 关键字被精确报出（两种形式）', () => {
        for (const l of [
            'execute @s ~ ~ ~ run say hi',
            'execute @s ~ ~ ~ detect ~ ~ ~ stone 0 run say hi',
        ]) {
            const d = run([l], { commands: all });
            assert.ok(
                d.some(x => x.ruleId === 'syntax/execute-run'),
                `应报出 run 关键字: ${l}，实际 ${JSON.stringify(d.map(x => x.ruleId))}`,
            );
        }
    });

    it('execute 之后的命令名不存在时报错', () => {
        const d = run(['execute @s ~ ~ ~ giv @s stone'], { commands: all });
        assert.ok(
            d.some(x => x.ruleId === 'syntax/unknown-inner-command'),
            `应报出内层命令不存在，实际 ${JSON.stringify(d.map(x => x.ruleId))}`,
        );
    });

    // scoreboard 的 [dataTag] / [display name...] / 变长 [entities...] /
    // 新增子命令 / 可选参数 / teams option 六选项这些「不误报」用例，
    // 已全部并入 dsl/wiki-syntax.test.ts 的 122 项核验表 ——
    // 那张表对每条命令断言同样的事，且强制覆盖全部 41 条命令。
    // 这里只保留**核验表覆盖不到**的三类：
    //   1. 半截输入（wiki 只列合法完整写法）
    //   2. 断言"应该报错"（核验表只断言"不报错"）
    //   3. 已移除命令（/detect 不该被认识）

    it('/detect 不再是合法根命令（Java 1.12.2 没有这个命令）', () => {
        const d = run(['detect ~ ~ ~ stone 0 say hi'], { commands: all });
        assert.ok(
            d.some(x => x.ruleId === 'syntax/unknown-command'),
            'detect 不是 Java 1.12.2 命令，应报未知命令',
        );
    });
});

// ============================================================
// 资源名匹配：Windows 文件系统大小写不敏感
//
// Minecraft 的命名空间/路径本身大小写敏感（Linux 上 NS:foo 与 ns:foo
// 是两个文件），但 Windows 上 `function NS:foo` 确实能打开
// data/functions/ns/foo.mcfunction —— 不该报"函数不存在"。
// ============================================================

describe('core/resName 大小写策略', () => {
    it('win32 判定为大小写不敏感，其余平台不是', () => {
        assert.strictEqual(isCaseInsensitiveFs('win32'), true);
        assert.strictEqual(isCaseInsensitiveFs('linux'), false);
        assert.strictEqual(isCaseInsensitiveFs('darwin'), false);
    });

    it('精确命中永远优先（两种平台一致）', () => {
        for (const ci of [true, false]) {
            assert.strictEqual(hasResName(['ns:foo'], 'ns:foo', ci), true);
        }
    });

    it('大小写不敏感平台：忽略大小写命中', () => {
        assert.strictEqual(hasResName(['ns:foo'], 'NS:foo', true), true);
        assert.strictEqual(hasResName(['ns:foo'], 'ns:FOO', true), true);
        assert.strictEqual(hasResName(['ns:foo'], 'Ns:Foo', true), true);
    });

    it('大小写敏感平台：不命中就是不存在', () => {
        assert.strictEqual(hasResName(['ns:foo'], 'NS:foo', false), false);
        assert.strictEqual(hasResName(['ns:foo'], 'ns:FOO', false), false);
    });

    it('大小写不敏感也不会把不存在的名字判成存在', () => {
        assert.strictEqual(hasResName(['ns:foo'], 'ns:bar', true), false);
        assert.strictEqual(hasResName(['ns:foo'], 'other:foo', true), false);
        assert.strictEqual(hasResName([], 'ns:foo', true), false);
    });

    it('放宽是单向的：同时存在时仍能精确区分', () => {
        const list = ['ns:foo', 'NS:foo'];
        // 精确命中优先，两者各自都能找到（不会因为忽略大小写而混淆）
        assert.strictEqual(hasResName(list, 'ns:foo', true), true);
        assert.strictEqual(hasResName(list, 'NS:foo', true), true);
    });
});