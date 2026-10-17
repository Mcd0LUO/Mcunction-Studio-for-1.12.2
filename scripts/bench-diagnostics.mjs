/**
 * 诊断性能基准。
 *
 * 现有 bench-perf 只测 load 与 complete，**完全没测诊断** ——
 * 而诊断是每次敲键（防抖 300ms 后）都要对**整个文件**重算的路径。
 *
 * 这里模拟真实编辑：在一个 N 行的文件里逐字符输入，
 * 每次输入后量一次 checkDocument 的耗时。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const vscodeMock = require('./vscode-mock.cjs');
const orig = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeMock; }
    return orig.apply(this, arguments);
};

const { DiagnosticRunner, ALL_RULES } = require(path.join(root, 'out/core/diagnostics/runner.js'));
const { ValidationContext } = require(path.join(root, 'out/core/diagnostics/types.js'));
const { CompletionEngine } = require(path.join(root, 'out/dsl/engine.js'));
const { DataLoader } = require(path.join(root, 'out/core/DataLoader.js'));
const { registerAll } = require(path.join(root, 'out/dsl/commands/index.js'));

function percentile(sorted, p) {
    if (sorted.length === 0) { return 0; }
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[i];
}
function summarize(samples) {
    const s = [...samples].sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return {
        n: s.length,
        min: s[0], p50: percentile(s, 50), p95: percentile(s, 95),
        max: s[s.length - 1], mean,
        total: s.reduce((a, b) => a + b, 0),
    };
}
const ms = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------
// 造一个真实的 mcfunction 语料
// ---------------------------------------------------------------
const OBJECTIVES = Array.from({ length: 60 }, (_, i) => `obj_${i}`);
const TEAMS = Array.from({ length: 20 }, (_, i) => `team_${i}`);
const TAGS = Array.from({ length: 40 }, (_, i) => `tag_${i}`);
const FUNCS = Array.from({ length: 200 }, (_, i) => `ns:fn_${i}`);

function makeLines(count) {
    const lines = [];
    // 定义区
    for (const o of OBJECTIVES) { lines.push(`scoreboard objectives add ${o} dummy`); }
    for (const t of TEAMS) { lines.push(`scoreboard teams add ${t}`); }
    for (const t of TAGS) { lines.push(`scoreboard players tag @s add ${t}`); }
    // 混杂引用区
    for (let i = lines.length; i < count; i++) {
        const o = OBJECTIVES[i % OBJECTIVES.length];
        const tm = TEAMS[i % TEAMS.length];
        const tg = TAGS[i % TAGS.length];
        const fn = FUNCS[i % FUNCS.length];
        switch (i % 10) {
            case 0: lines.push(`scoreboard players set @a[tag=${tg}] ${o} ${i}`); break;
            case 1: lines.push(`execute @a[team=${tm}] ~ ~ ~ scoreboard players add @s ${o} 1`); break;
            case 2: lines.push(`scoreboard players operation @s ${o} += @s obj_0`); break;
            case 3: lines.push(`execute @a[score_${o}=1] ~ ~ ~ function ${fn}`); break;
            case 4: lines.push(`give @a[tag=${tg},team=${tm}] minecraft:stone 1`); break;
            case 5: lines.push(`title @a[score_${o}_min=1] title {"text":"hi"}`); break;
            case 6: lines.push(`summon minecraft:creeper ~ ~ ~ {Tags:["${tg}"]}`); break;
            case 7: lines.push(`scoreboard teams join ${tm} @a[tag=${tg}]`); break;
            case 8: lines.push(`gamerule gameLoopFunction ${fn}`); break;
            default: lines.push(`kill @a[tag=${tg}]`); break;
        }
    }
    return lines;
}

const engine = new CompletionEngine(DataLoader.getInstance());
registerAll(engine);

function makeRunner(o = {}) {
    const ctx = new ValidationContext({
        commandTable: () => engine.commandNames(),
        hasScoreboard: (n) => (o.scoreboards ?? OBJECTIVES).includes(n),
        hasTeam: (n) => (o.teams ?? TEAMS).includes(n),
        hasTag: (n) => (o.tags ?? TAGS).includes(n),
        hasFunction: () => true,
        hasAdvancement: () => true,
        definitionsOf: () => [],
        getScoreboardCriteria: () => undefined,
        isIndexReady: () => o.indexReady ?? true,
    });
    return new DiagnosticRunner({ rules: ALL_RULES, ctx, engine, levels: {} });
}

const SIZES = [200, 1000, 3000];
const report = { rows: [], notes: [] };
const runner = makeRunner();

console.log('\n## checkDocument 全量重算 (ms)\n');
console.log('| lines | 诊断数 | min | p50 | p95 | max | mean | µs/行 |');
console.log('|------:|-------:|----:|----:|----:|----:|-----:|------:|');
for (const n of SIZES) {
    const lines = makeLines(n);
    const times = [];
    let diagCount = 0;
    const ROUNDS = 30;
    for (let r = 0; r < ROUNDS; r++) {
        const t0 = performance.now();
        const d = runner.checkDocument(lines);
        times.push(performance.now() - t0);
        diagCount = d.length;
    }
    const st = summarize(times);
    report.rows.push({ kind: 'checkDocument', lines: n, diags: diagCount, ...st });
    console.log(`| ${n} | ${diagCount} | ${ms(st.min)} | ${ms(st.p50)} | ${ms(st.p95)} | ${ms(st.max)} | ${ms(st.mean)} | ${ms(st.mean / n * 1000)} |`);
}

// ---------------------------------------------------------------
// 逐键输入：模拟真实编辑（每次多一个字符，重算整个文件）
// ---------------------------------------------------------------
console.log('\n## 逐键输入（N 行文件，每敲 1 字符重算整个文件）\n');
console.log('| lines | 编辑点 | min | p50 | p95 | max | mean |');
console.log('|------:|-------:|----:|----:|----:|----:|-----:|');
for (const n of SIZES) {
    const lines = makeLines(n);
    // 模拟在第 5 行末尾逐字符补全一条命令
    const target = 4;
    const base = 'scoreboard players set @a[tag=tag_0] obj_1 ';
    const times = [];
    for (let len = 1; len <= base.length; len++) {
        const snapshot = [...lines];
        snapshot[target] = base.slice(0, len);
        const t0 = performance.now();
        runner.checkDocument(snapshot);
        times.push(performance.now() - t0);
    }
    const st = summarize(times);
    report.rows.push({ kind: 'perKeystroke', lines: n, ...st });
    console.log(`| ${n} | ${base.length} | ${ms(st.min)} | ${ms(st.p50)} | ${ms(st.p95)} | ${ms(st.max)} | ${ms(st.mean)} |`);
}

// ---------------------------------------------------------------
// 索引未就绪 vs 就绪（needsIndex 规则整体跳过）
// ---------------------------------------------------------------
console.log('\n## 索引未就绪时的开销 (ms) — 3000 行\n');
{
    const lines = makeLines(3000);
    const notReady = makeRunner({ indexReady: false });
    const times = [];
    for (let r = 0; r < 20; r++) {
        const t0 = performance.now();
        notReady.checkDocument(lines);
        times.push(performance.now() - t0);
    }
    const st = summarize(times);
    console.log(`| 状态 | p50 | p95 | mean |\n|------|----:|----:|-----:|`);
    console.log(`| indexReady=false | ${ms(st.p50)} | ${ms(st.p95)} | ${ms(st.mean)} |`);
    report.rows.push({ kind: 'indexNotReady', lines: 3000, ...st });
}

// ---------------------------------------------------------------
// 单行热点：哪一类命令最慢
// ---------------------------------------------------------------
console.log('\n## 单行诊断耗时 (µs) — 按命令分类\n');
console.log('| 类别 | 样例 | p50 | p95 | mean |');
console.log('|------|------|----:|----:|-----:|');
const LINE_KINDS = [
    ['scoreboard', 'scoreboard players operation @s obj_1 += @s obj_0'],
    ['execute 内层', 'execute @a[score_obj_1=1] ~ ~ ~ function ns:fn_1'],
    ['选择器多谓词', 'give @a[tag=tag_0,team=team_0,score_obj_0_min=1] minecraft:stone 1'],
    ['NBT', 'summon minecraft:creeper ~ ~ ~ {Tags:["tag_1","tag_2"]}'],
    ['纯字面量', 'gamerule keepInventory true'],
    ['注释', '# this is a comment'],
];
for (const [name, line] of LINE_KINDS) {
    const times = [];
    const ROUNDS = 2000;
    for (let r = 0; r < ROUNDS; r++) {
        const t0 = performance.now();
        runner.checkDocument([line]);
        times.push((performance.now() - t0) * 1000);
    }
    const st = summarize(times);
    report.rows.push({ kind: 'lineKind', name, ...st, unit: 'us' });
    console.log(`| ${name} | \`${line.slice(0, 44)}${line.length > 44 ? '…' : ''}\` | ${ms(st.p50)} | ${ms(st.p95)} | ${ms(st.mean)} |`);
}

console.log('\n---JSON---');
console.log(JSON.stringify(report, null, 2));
