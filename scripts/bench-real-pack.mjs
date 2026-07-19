/**
 * 对真实数据包目录跑 loadData / complete 性能。
 *
 *   node scripts/bench-real-pack.mjs "D:/path/to/data"
 *   npm run compile ; node scripts/bench-real-pack.mjs "D:\game\...\data"
 */
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const dataRootArg = process.argv[2];
if (!dataRootArg) {
    console.error('Usage: node scripts/bench-real-pack.mjs <dataRoot>');
    process.exit(1);
}
const dataRoot = path.resolve(dataRootArg);
const functionsDir = path.join(dataRoot, 'functions');
if (!fs.existsSync(functionsDir)) {
    console.error('Not a data root (missing functions/):', dataRoot);
    process.exit(1);
}

const vscode = require('./vscode-mock.cjs');
const extensionState = { rootDir: undefined };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscode;
    }
    try {
        const resolved = Module._resolveFilename(request, parent);
        const norm = resolved.replace(/\\/g, '/');
        if (norm.endsWith('/out/extension.js')) {
            return extensionState;
        }
        if (norm.endsWith('/out/completionProvider/Minecraft.js')) {
            return { MinecraftCompletionProvider: class {} };
        }
    } catch { /* */ }
    return origLoad.apply(this, arguments);
};

function walkCount(dir, ext, acc = { files: 0, bytes: 0 }) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, name.name);
        if (name.isDirectory()) {
            walkCount(p, ext, acc);
        } else if (name.name.endsWith(ext)) {
            acc.files++;
            acc.bytes += fs.statSync(p).size;
        }
    }
    return acc;
}

function percentile(sorted, p) {
    if (!sorted.length) {
        return 0;
    }
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

function summarize(samples) {
    const s = [...samples].sort((a, b) => a - b);
    return {
        n: s.length,
        min: +s[0].toFixed(2),
        p50: +percentile(s, 50).toFixed(2),
        p95: +percentile(s, 95).toFixed(2),
        max: +s[s.length - 1].toFixed(2),
        mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
    };
}

const realLog = console.log;
const mute = () => {
    console.log = () => {};
    console.warn = () => {};
};
const unmute = () => {
    console.log = realLog;
};

const packStats = walkCount(functionsDir, '.mcfunction');
const packRoot = path.dirname(dataRoot);

console.log('=== real pack ===');
console.log(JSON.stringify({
    dataRoot,
    mcfunctionFiles: packStats.files,
    mcfunctionKB: +(packStats.bytes / 1024).toFixed(1),
    node: process.version,
}, null, 2));

mute();
const { DataLoader } = require(path.join(root, 'out/core/DataLoader.js'));
const { CompletionEngine } = require(path.join(root, 'out/dsl/engine.js'));
const { registerAll } = require(path.join(root, 'out/dsl/commands/index.js'));
const { CommandUtils } = require(path.join(root, 'out/utils/CommandUtils.js'));
unmute();

const loader = DataLoader.getInstance();
extensionState.rootDir = vscode.Uri.file(dataRoot);
vscode.__setWorkspaceFolders([{ uri: vscode.Uri.file(packRoot), name: 'real', index: 0 }]);

const COLD_N = Number(process.env.BENCH_COLD_N || 3);
const WARM_N = Number(process.env.BENCH_WARM_N || 5);
const CACHE_N = Number(process.env.BENCH_CACHE_N || 3);
const conc = Number(process.env.BENCH_CONC || 16);

const cachePathGz = path.join(dataRoot, '.McfStudio', 'index-cache.json.gz');
const cachePathLegacy = path.join(dataRoot, '.McfStudio', 'index-cache.json');

function removeCache() {
    for (const p of [cachePathGz, cachePathLegacy]) {
        try {
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
            }
        } catch { /* ignore */ }
    }
}

function cacheInfo() {
    try {
        const p = fs.existsSync(cachePathGz) ? cachePathGz
            : fs.existsSync(cachePathLegacy) ? cachePathLegacy
                : null;
        if (!p) {
            return { exists: false };
        }
        const st = fs.statSync(p);
        return {
            exists: true,
            path: path.basename(p),
            bytes: st.size,
            kb: +(st.size / 1024).toFixed(1),
        };
    } catch {
        return { exists: false };
    }
}

async function timeLoad(forceFull, n, { wipeCacheEach = false } = {}) {
    const samples = [];
    for (let i = 0; i < n; i++) {
        if (wipeCacheEach) {
            removeCache();
        }
        mute();
        const t0 = performance.now();
        await loader.loadData(true, conc, forceFull);
        samples.push(performance.now() - t0);
        unmute();
    }
    return samples;
}

// --- cold without disk cache（每次采样前删 cache，强制真解析）---
const coldNoCache = await timeLoad(true, COLD_N, { wipeCacheEach: true });
const indexAfterCold = {
    functions: loader.getFunctionResNames().length,
    scoreboards: loader.getScoreboardsData().size,
    tags: loader.getTagsData().size,
    teams: loader.getTeamsData().size,
    fakePlayers: loader.getFakePlayerData().size,
    advancements: loader.getAdvancementResNames().length,
};
const cacheAfterWrite = cacheInfo();
if (!cacheAfterWrite.exists) {
    console.warn('WARNING: index-cache.json.gz was not written after cold no-cache load');
}

// --- cold forceFull with disk cache（应走 tryRestore，不删 cache）---
const coldWithCache = await timeLoad(true, CACHE_N, { wipeCacheEach: false });

// warm incremental（内存 mtime 跳过）
const warm = await timeLoad(false, WARM_N, { wipeCacheEach: false });

// complete after warm state
mute();
const engine = new CompletionEngine(loader);
registerAll(engine);
unmute();

async function measureComplete(name, n, fn) {
    for (let i = 0; i < 10; i++) {
        await fn();
    }
    const samples = [];
    let items = 0;
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        const r = await fn();
        samples.push(performance.now() - t0);
        items = Array.isArray(r) ? r.length : 0;
    }
    return { name, items, ms: summarize(samples) };
}

const completeN = 100;
const complete = [];
complete.push(await measureComplete('function names', completeN, () => engine.complete(['function', ''], 'function ')));
complete.push(await measureComplete('selectors', completeN, () => engine.complete(['kill', ''], 'kill ')));
complete.push(await measureComplete('tags @a[tag=', completeN, () => engine.complete(['kill', '@a[tag='], 'kill @a[tag=')));
complete.push(await measureComplete('scoreboards', completeN, () => engine.complete(['scoreboard', 'players', 'set', '@p', ''], 'scoreboard players set @p ')));
complete.push(await measureComplete('give items', completeN, () => engine.complete(['give', '@p', ''], 'give @p ')));
complete.push(await measureComplete('setblock blocks', completeN, () => engine.complete(['setblock', '~', '~', '~', ''], 'setblock ~ ~ ~ ')));
complete.push(await measureComplete('playsound', completeN, () => engine.complete(['playsound', ''], 'playsound ')));
complete.push(await measureComplete('e2e extract+give', completeN, async () => {
    const text = 'give @p ';
    const cmds = CommandUtils.extractCommand(text);
    const { currentCommands } = CommandUtils.findActiveCommand(cmds);
    return engine.complete(currentCommands, text);
}));

const coldNoCacheP50 = percentile([...coldNoCache].sort((a, b) => a - b), 50);
const coldCacheP50 = percentile([...coldWithCache].sort((a, b) => a - b), 50);
const speedup = coldCacheP50 > 0 ? +(coldNoCacheP50 / coldCacheP50).toFixed(2) : null;

const report = {
    pack: { dataRoot, files: packStats.files, kb: +(packStats.bytes / 1024).toFixed(1) },
    concurrency: conc,
    diskCache: cacheAfterWrite,
    loadData: {
        coldNoCache: summarize(coldNoCache),
        coldWithCache: summarize(coldWithCache),
        warmIncremental: summarize(warm),
        index: indexAfterCold,
        coldNoCacheFilesPerSec: +(packStats.files / (coldNoCacheP50 / 1000)).toFixed(1),
        cacheSpeedupVsNoCache: speedup,
    },
    complete,
};

console.log(JSON.stringify(report, null, 2));

console.log('\n## 末法 data — loadData (ms)\n');
console.log(`files=${packStats.files}  size=${report.pack.kb}KB  conc=${conc}`);
console.log(`disk cache: ${cacheAfterWrite.exists ? `${cacheAfterWrite.kb}KB` : 'missing'}`);
console.log('| mode | min | p50 | p95 | max | mean |');
console.log('|------|----:|----:|----:|----:|-----:|');
const c0 = report.loadData.coldNoCache;
const c1 = report.loadData.coldWithCache;
const w = report.loadData.warmIncremental;
console.log(`| cold no cache (parse) | ${c0.min} | ${c0.p50} | ${c0.p95} | ${c0.max} | ${c0.mean} |`);
console.log(`| cold + disk cache | ${c1.min} | ${c1.p50} | ${c1.p95} | ${c1.max} | ${c1.mean} |`);
console.log(`| warm mtime skip | ${w.min} | ${w.p50} | ${w.p95} | ${w.max} | ${w.mean} |`);
console.log('\nindex:', JSON.stringify(indexAfterCold));
console.log(`cold no-cache throughput: ${report.loadData.coldNoCacheFilesPerSec} files/s`);
console.log(`cache speedup (p50 no/with): ${speedup}x`);

console.log('\n## complete p50/p95 (ms)\n');
console.log('| case | items | p50 | p95 |');
console.log('|------|------:|----:|----:|');
for (const row of complete) {
    console.log(`| ${row.name} | ${row.items} | ${row.ms.p50} | ${row.ms.p95} |`);
}
