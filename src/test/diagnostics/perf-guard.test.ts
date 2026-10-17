/**
 * 诊断性能回归守卫。
 *
 * 只断言**数量级**，不断言精确毫秒 —— 不同机器/负载下绝对值差异很大，
 * 卡死具体数字会让测试变成随机失败源。这里守的是两件事：
 *
 *   1. 每行诊断成本不能失控（曾经是 ~5.1 µs/行，优化后 ~4.1 µs/行）
 *   2. 同一行的 validate() 只能走一次（4 条语法规则共享缓存）
 *
 * 第 2 条是**正确性**而非性能：它保证以后有人新增语法规则时，
 * 不会又各自调一遍 engine.validate()。
 */
import * as assert from 'assert';
import { ValidationContext, LineAnalyzer, tokenize, tokenizeDetailed } from '../../core/diagnostics/types';
import { DiagnosticRunner, ALL_RULES } from '../../core/diagnostics/runner';
import { attachEngine, validateOnce } from '../../core/diagnostics/rules/syntax';
import { CompletionEngine } from '../../dsl/engine';
import { registerAll } from '../../dsl/commands/index';
import { DataLoader } from '../../core/DataLoader';

let engine: CompletionEngine;

before(() => {
    engine = new CompletionEngine(DataLoader.getInstance());
    registerAll(engine);
});

function makeCtx(scoreboards: readonly string[]): ValidationContext {
    return new ValidationContext({
        commandTable: () => engine.commandNames(),
        hasScoreboard: (n) => scoreboards.includes(n),
        hasTeam: () => true,
        hasTag: () => true,
        hasFunction: () => true,
        hasAdvancement: () => true,
        definitionsOf: () => [],
        getScoreboardCriteria: () => undefined,
        isIndexReady: () => true,
    });
}

const OBJ = Array.from({ length: 60 }, (_, i) => `obj_${i}`);

function makeLines(count: number): string[] {
    const lines: string[] = [];
    for (const o of OBJ) { lines.push(`scoreboard objectives add ${o} dummy`); }
    for (let i = lines.length; i < count; i++) {
        const o = OBJ[i % OBJ.length];
        switch (i % 6) {
            case 0: lines.push(`scoreboard players set @a[tag=t${i % 20}] ${o} ${i}`); break;
            case 1: lines.push(`execute @a[team=red] ~ ~ ~ scoreboard players add @s ${o} 1`); break;
            case 2: lines.push(`scoreboard players operation @s ${o} += @s obj_0`); break;
            case 3: lines.push(`execute @a[score_${o}=1] ~ ~ ~ function ns:fn_${i % 200}`); break;
            case 4: lines.push(`summon minecraft:creeper ~ ~ ~ {Tags:["t${i % 20}"]}`); break;
            default: lines.push(`kill @a[tag=t${i % 20}]`); break;
        }
    }
    return lines;
}

describe('diagnostics/性能回归守卫', () => {
    it('同一行的 engine.validate 只走一次（4 条语法规则共享）', () => {
        let walks = 0;
        const spy = { validate: (t: readonly string[]) => { walks++; return engine.validate(t); } };
        const analyzer = new LineAnalyzer(makeCtx(OBJ));
        const rc = analyzer.analyze('scoreboard players set @s obj 1', 0);
        attachEngine(rc, spy as never);

        // 4 条语法规则各调一次 validateOnce
        validateOnce(rc); validateOnce(rc); validateOnce(rc); validateOnce(rc);
        assert.strictEqual(walks, 1, '4 条规则应共享同一次 walk，实际走了 ' + walks + ' 次');
    });

    it('没有选择器的行不做选择器解析', () => {
        // 廉价预筛：'@' 不存在时 selectorsOf 不该被调用。
        // 这里用行为断言 —— 无 '@' 的行绝不会产出选择器类诊断。
        const ctx = makeCtx([]);           // 空索引：若真去解析会想报"未定义"
        const runner = new DiagnosticRunner({ rules: ALL_RULES, ctx, engine: engine as never, levels: {} });
        const d = runner.checkDocument(['scoreboard objectives add foo dummy', 'gamerule keepInventory true']);
        const selectorRules = d.filter(x => x.ruleId.startsWith('selector/') || x.ruleId === 'resource/undefined-scoreboard');
        assert.deepStrictEqual(selectorRules, [], '无 @ 的行不该产出选择器诊断');
    });

    it('tokenizeDetailed 的 token 与 tokenize 一致（含引号内空格不切分）', () => {
        const line = 'tellraw @a {"text":"hi there"} say';
        // 引号内的空格不切分 —— 这是 tokenize 的既有语义
        assert.deepStrictEqual(tokenizeDetailed(line).tokens, [
            'tellraw', '@a', '{"text":"hi there"}', 'say',
        ]);
        assert.deepStrictEqual(tokenizeDetailed(line).tokens, tokenize(line));
    });

    it('未闭合引号会被 tokenizeDetailed 顺带报出', () => {
        assert.strictEqual(tokenizeDetailed('tellraw @a {"text":"oops').unterminatedQuote, true);
        assert.strictEqual(tokenizeDetailed('tellraw @a {"text":"ok"}').unterminatedQuote, false);
    });

    it('3000 行全量诊断在合理量级内', () => {
        // 只守数量级：优化前 ~15ms，优化后 ~12ms。给 4 倍余量，
        // 这样慢机器也不会随机失败，但真正的退化（比如回到 O(n²)）一定被抓到。
        const lines = makeLines(3000);
        const runner = new DiagnosticRunner({
            rules: ALL_RULES, ctx: makeCtx(OBJ), engine: engine as never, levels: {},
        });
        // warmup
        runner.checkDocument(lines.slice(0, 200));

        const t0 = performance.now();
        runner.checkDocument(lines);
        const ms = performance.now() - t0;

        assert.ok(ms < 60, `3000 行诊断耗时 ${ms.toFixed(1)}ms，超出守卫上限 60ms（历史值 12~15ms）`);
    });

    it('注释与空行被短路，不参与分析', () => {
        const ctx = makeCtx(OBJ);
        const runner = new DiagnosticRunner({ rules: ALL_RULES, ctx, engine: engine as never, levels: {} });
        const d = runner.checkDocument([
            '',
            '# scoreboard objectives add foo dummy',
            '   ',
            '#another comment',
        ]);
        assert.deepStrictEqual(d, []);
    });
});
