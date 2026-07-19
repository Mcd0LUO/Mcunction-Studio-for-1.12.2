/**
 * 端到端性能基线：
 *  1) DataLoader.loadData — 小/中/大数据包墙钟（min / p50 / p95 / max）
 *  2) CompletionEngine.complete — 含 selectors / blocks / items / sounds（p50 / p95）
 *
 *   npm run bench:perf
 *   node scripts/bench-perf.mjs
 *
 * 可选环境变量：
 *   BENCH_LOAD_RUNS=5
 *   BENCH_COMPLETE_N=200
 *   BENCH_KEEP_TMP=1
 */
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const LOAD_RUNS = Math.max(1, Number(process.env.BENCH_LOAD_RUNS || 5));
const COMPLETE_N = Math.max(20, Number(process.env.BENCH_COMPLETE_N || 200));
const KEEP_TMP = process.env.BENCH_KEEP_TMP === '1';

// ---- module mocks BEFORE any out/* load ----
const vscode = require('./vscode-mock.cjs');
const extensionState = { rootDir: undefined };

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscode;
    }
    // 拦截项目 extension，避免 activate 链与单例补全 provider
    try {
        const resolved = Module._resolveFilename(request, parent);
        if (resolved.replace(/\\/g, '/').endsWith('/out/extension.js')) {
            return extensionState;
        }
        // 避免误加载 MinecraftCompletionProvider 静态单例
        if (resolved.replace(/\\/g, '/').endsWith('/out/completionProvider/Minecraft.js')) {
            return { MinecraftCompletionProvider: class {} };
        }
    } catch {
        /* fallthrough */
    }
    return origLoad.apply(this, arguments);
};

// quiet noisy logs during load
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
function mute() {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
}
function unmute() {
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
}

// ---- helpers ----
function percentile(sorted, p) {
    if (sorted.length === 0) {
        return 0;
    }
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

function summarizeMs(samples) {
    const s = [...samples].sort((a, b) => a - b);
    return {
        n: s.length,
        min: +s[0].toFixed(3),
        p50: +percentile(s, 50).toFixed(3),
        p95: +percentile(s, 95).toFixed(3),
        max: +s[s.length - 1].toFixed(3),
        mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3),
    };
}

async function measureAsync(n, fn, warmup = 3) {
    for (let i = 0; i < warmup; i++) {
        await fn();
    }
    const samples = [];
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        await fn();
        samples.push(performance.now() - t0);
    }
    return summarizeMs(samples);
}

function writePack(dataRoot, fileCount, linesPerFile) {
    const fnRoot = path.join(dataRoot, 'functions', 'pack');
    fs.mkdirSync(fnRoot, { recursive: true });
    fs.mkdirSync(path.join(dataRoot, 'advancements', 'pack'), { recursive: true });

    // 少量进度，避免 advancements 扫描为空
    for (let i = 0; i < Math.min(10, fileCount); i++) {
        const adv = path.join(dataRoot, 'advancements', 'pack', `a${String(i).padStart(4, '0')}.json`);
        fs.writeFileSync(adv, '{"criteria":{}}');
    }

    for (let i = 0; i < fileCount; i++) {
        const id = String(i).padStart(4, '0');
        const next = String((i + 1) % fileCount).padStart(4, '0');
        const lines = [
            `# bench file ${id}`,
            `scoreboard objectives add obj_${id} dummy "Obj ${id}"`,
            `scoreboard players set #fp_${id} obj_${id} 1`,
            `scoreboard players tag @s add tag_${id}`,
            i % 10 === 0 ? `scoreboard teams add team_${String(Math.floor(i / 10)).padStart(3, '0')}` : null,
            `function pack:f${next}`,
            `summon armor_stand ~ ~ ~ {Tags:["sum_${id}"]}`,
            `say tick ${id}`,
        ].filter(Boolean);

        while (lines.length < linesPerFile) {
            lines.push(`say pad ${lines.length}`);
        }
        fs.writeFileSync(path.join(fnRoot, `f${id}.mcfunction`), lines.join('\n') + '\n');
    }
}

function rimraf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---- load project modules ----
mute();
const { DataLoader } = require(path.join(root, 'out/core/DataLoader.js'));
const { CompletionEngine } = require(path.join(root, 'out/dsl/engine.js'));
const { registerAll } = require(path.join(root, 'out/dsl/commands/index.js'));
const { CommandUtils } = require(path.join(root, 'out/utils/CommandUtils.js'));
// 预热 EnumLib（算进冷启动对照，complete 热路径不含 require）
require(path.join(root, 'out/utils/EnumLib.js'));
unmute();

const report = {
    env: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        loadRuns: LOAD_RUNS,
        completeN: COMPLETE_N,
    },
    loadData: [],
    complete: [],
    notes: [],
};

const sizes = [
    { name: 'S', files: 50, lines: 20, concurrency: 16, forceFull: true },
    { name: 'M', files: 250, lines: 40, concurrency: 16, forceFull: true },
    { name: 'L', files: 800, lines: 50, concurrency: 16, forceFull: true },
    { name: 'M-serial', files: 250, lines: 40, concurrency: 1, forceFull: true },
    // 冷加载后再跑一次 forceFull=false（mtime 全命中）→ 增量暖启动
    { name: 'M-warm', files: 250, lines: 40, concurrency: 16, forceFull: false, reuseFrom: 'M' },
];

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-bench-'));
report.notes.push(`tmp=${tmpRoot}`);

try {
    const loader = DataLoader.getInstance();

    const packCache = new Map(); // name -> { packRoot, dataRoot }

    for (const size of sizes) {
        let packRoot;
        let dataRoot;
        if (size.reuseFrom && packCache.has(size.reuseFrom)) {
            ({ packRoot, dataRoot } = packCache.get(size.reuseFrom));
        } else {
            packRoot = path.join(tmpRoot, size.name);
            dataRoot = path.join(packRoot, 'data');
            writePack(dataRoot, size.files, size.lines);
            packCache.set(size.name, { packRoot, dataRoot });
        }

        extensionState.rootDir = vscode.Uri.file(dataRoot);
        vscode.__setWorkspaceFolders([{ uri: vscode.Uri.file(packRoot), name: size.name, index: 0 }]);

        // warm 场景：先强制冷加载一次建立 mtime，再测增量
        if (size.reuseFrom) {
            mute();
            await loader.loadData(true, size.concurrency, true);
            unmute();
        }

        const samples = [];
        let lastStats = null;
        const forceFull = size.forceFull !== false;

        for (let run = 0; run < LOAD_RUNS; run++) {
            mute();
            const t0 = performance.now();
            const useConcurrent = size.concurrency > 1;
            // 冷测每次 forceFull=true；warm 测 forceFull=false
            await loader.loadData(useConcurrent, size.concurrency, forceFull);
            const ms = performance.now() - t0;
            unmute();
            samples.push(ms);

            lastStats = {
                functions: loader.getFunctionResNames().length,
                scoreboards: loader.getScoreboardsData().size,
                tags: loader.getTagsData().size,
                teams: loader.getTeamsData().size,
                fakePlayers: loader.getFakePlayerData().size,
                advancements: loader.getAdvancementResNames().length,
            };
        }

        const summary = summarizeMs(samples);
        report.loadData.push({
            size: size.name,
            files: size.files,
            linesPerFile: size.lines,
            approxLines: size.files * size.lines,
            concurrency: size.concurrency,
            forceFull,
            wallMs: summary,
            index: lastStats,
            throughputFilesPerSec: +(size.files / (summary.p50 / 1000)).toFixed(1),
            throughputLinesPerSec: +((size.files * size.lines) / (summary.p50 / 1000)).toFixed(0),
        });
    }

    // ---- complete() on medium pack residual state (reload M once for clean mid size) ----
    {
        const packRoot = path.join(tmpRoot, 'complete-base');
        const dataRoot = path.join(packRoot, 'data');
        writePack(dataRoot, 250, 40);
        extensionState.rootDir = vscode.Uri.file(dataRoot);
        vscode.__setWorkspaceFolders([{ uri: vscode.Uri.file(packRoot), name: 'complete', index: 0 }]);
        mute();
        await loader.loadData(true, 16, true);
        unmute();

        const engine = new CompletionEngine(loader);
        registerAll(engine);

        const cases = [
            {
                name: 'root-prefix empty',
                run: async () => engine.getRootItems(),
            },
            {
                name: 'complete function name (dynamic list)',
                tokens: ['function', ''],
                line: 'function ',
            },
            {
                name: 'complete effect clear|id (literals+effects)',
                tokens: ['effect', '@p', ''],
                line: 'effect @p ',
            },
            {
                name: 'complete selectors bare',
                tokens: ['kill', ''],
                line: 'kill ',
            },
            {
                name: 'complete selector args @a[',
                tokens: ['kill', '@a['],
                line: 'kill @a[',
            },
            {
                name: 'complete selector tag=',
                tokens: ['kill', '@a[tag='],
                line: 'kill @a[tag=',
            },
            {
                name: 'complete scoreboards (dynamic)',
                tokens: ['scoreboard', 'players', 'set', '@p', ''],
                line: 'scoreboard players set @p ',
            },
            {
                name: 'complete give items (EnumLib items)',
                tokens: ['give', '@p', ''],
                line: 'give @p ',
            },
            {
                name: 'complete setblock blocks (EnumLib blocks)',
                tokens: ['setblock', '~', '~', '~', ''],
                line: 'setblock ~ ~ ~ ',
            },
            {
                name: 'complete playsound sounds (EnumLib sounds)',
                tokens: ['playsound', ''],
                line: 'playsound ',
            },
            {
                name: 'end2end extract+findActive+complete give items',
                run: async () => {
                    const text = 'give @p ';
                    const cmds = CommandUtils.extractCommand(text);
                    const { currentCommands } = CommandUtils.findActiveCommand(cmds);
                    return engine.complete(currentCommands, text);
                },
            },
        ];

        for (const c of cases) {
            mute();
            let itemCount = 0;
            const stats = await measureAsync(
                COMPLETE_N,
                async () => {
                    let items;
                    if (c.run) {
                        items = await c.run();
                    } else {
                        items = await engine.complete(c.tokens, c.line);
                    }
                    itemCount = Array.isArray(items) ? items.length : 0;
                },
                15,
            );
            unmute();
            report.complete.push({
                name: c.name,
                items: itemCount,
                latencyMs: stats,
            });
        }
    }
} finally {
    if (!KEEP_TMP) {
        try {
            rimraf(tmpRoot);
        } catch {
            report.notes.push('tmp cleanup failed');
        }
    }
}

// ---- print ----
function tableLoad() {
    console.log('\n## loadData wall clock (ms)\n');
    console.log('| size | files | lines | conc | full | min | p50 | p95 | max | mean | files/s | idx f/sb/tag |');
    console.log('|------|------:|------:|-----:|:----:|----:|----:|----:|----:|-----:|--------:|--------------|');
    for (const r of report.loadData) {
        const i = r.index;
        console.log(
            `| ${r.size} | ${r.files} | ${r.approxLines} | ${r.concurrency} | ${r.forceFull} | ${r.wallMs.min} | ${r.wallMs.p50} | ${r.wallMs.p95} | ${r.wallMs.max} | ${r.wallMs.mean} | ${r.throughputFilesPerSec} | ${i.functions}/${i.scoreboards}/${i.tags} |`,
        );
    }
}

function tableComplete() {
    console.log('\n## complete() latency (ms) — after M pack load (250 files)\n');
    console.log('| case | items | p50 | p95 | max | mean |');
    console.log('|------|------:|----:|----:|----:|-----:|');
    for (const r of report.complete) {
        console.log(
            `| ${r.name} | ${r.items} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | ${r.latencyMs.max} | ${r.latencyMs.mean} |`,
        );
    }
}

console.log(JSON.stringify(report, null, 2));
tableLoad();
tableComplete();
console.log('\nnotes:', report.notes.join('; '));
