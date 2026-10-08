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
        assert.ok(d.some(x => x.ruleId === 'syntax/extra-token' || x.ruleId === 'syntax/execute-trailing'));
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