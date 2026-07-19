/**
 * 当前基线 / 核心路径性能快照
 *   node scripts/bench-baseline.mjs
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

const vscodeMock = require('./vscode-mock.cjs');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return origLoad.apply(this, arguments);
};

function bench(name, n, fn) {
    for (let i = 0; i < Math.min(30, n); i++) {
        fn();
    }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
        fn();
    }
    const ms = performance.now() - t0;
    return {
        name,
        n,
        totalMs: +ms.toFixed(3),
        perOpUs: +((ms / n) * 1000).toFixed(3),
        opsPerSec: Math.round(1000 / (ms / n)),
    };
}

function countNodes(n) {
    return 1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0);
}

function fsize(p) {
    return fs.statSync(p).size;
}

function walkJs(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            walkJs(p, acc);
        } else if (e.name.endsWith('.js')) {
            acc.push(p);
        }
    }
    return acc;
}

// purge dsl/utils/core caches for cold load
for (const k of Object.keys(require.cache)) {
    if (/[\\/]out[\\/](dsl|utils|core|completionProvider)[\\/]/.test(k)) {
        delete require.cache[k];
    }
}

const out = [];

out.push({
    env: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
});

const tLoad0 = performance.now();
const index = require(path.join(root, 'out/dsl/commands/index.js'));
const treeShape = require(path.join(root, 'out/dsl/treeShape.js'));
out.push({
    name: 'cold-load dsl/commands + treeShape',
    ms: +(performance.now() - tLoad0).toFixed(2),
    roots: index.commands.length,
});

const EnumLib = require(path.join(root, 'out/utils/EnumLib.js'));
const tEnum = performance.now();
const enumSizes = {
    blocks: Object.keys(EnumLib.BlockNameMap.all).length,
    items: Object.keys(EnumLib.ItemNameMap.all).length,
    entities: EnumLib.EntityNameList.all.length,
    particles: EnumLib.ParticleNames.all.length,
    enchants: EnumLib.Enchantments.all.length,
    sounds: EnumLib.SoundNames.all.length,
};
out.push({
    name: 'EnumLib first .all materialize',
    ms: +(performance.now() - tEnum).toFixed(3),
    sizes: enumSizes,
});

const outJs = walkJs(path.join(root, 'out'));
const totalOutJs = outJs.reduce((a, p) => a + fsize(p), 0);
out.push({
    name: 'artifact sizes',
    enumLibJsKB: +(fsize(path.join(root, 'out/utils/EnumLib.js')) / 1024).toFixed(1),
    outJsCount: outJs.length,
    outJsTotalKB: +(totalOutJs / 1024).toFixed(1),
});

const { toTreeShape, diffTreeShape } = treeShape;
const cmds = index.commands;
const nodeStats = cmds
    .map((c) => ({ name: c.commandName, nodes: countNodes(toTreeShape(c)) }))
    .sort((a, b) => b.nodes - a.nodes);
out.push({
    name: 'DSL tree node counts',
    roots: cmds.length,
    totalNodes: nodeStats.reduce((a, s) => a + s.nodes, 0),
    avgNodes: +(nodeStats.reduce((a, s) => a + s.nodes, 0) / nodeStats.length).toFixed(1),
    top5: nodeStats.slice(0, 5),
});

const functionCmd = require(path.join(root, 'out/dsl/commands/vanilla/function.js')).functionCmd;
const effectCmd = require(path.join(root, 'out/dsl/commands/vanilla/effect.js')).effectCmd;
const scoreboardCmd = require(path.join(root, 'out/dsl/commands/vanilla/scoreboard.js')).scoreboardCmd;
const timeCmd = require(path.join(root, 'out/dsl/commands/vanilla/time.js')).timeCmd;
const titleCmd = require(path.join(root, 'out/dsl/commands/vanilla/title.js')).titleCmd;

out.push(bench('toTreeShape(function)', 50000, () => toTreeShape(functionCmd)));
out.push(bench('toTreeShape(effect)', 50000, () => toTreeShape(effectCmd)));
out.push(bench('toTreeShape(scoreboard)', 50000, () => toTreeShape(scoreboardCmd)));
out.push(bench('toTreeShape(all 42 roots once)', 5000, () => {
    for (const c of cmds) {
        toTreeShape(c);
    }
}));

const baseline = JSON.parse(
    fs.readFileSync(path.join(root, 'src/test/baseline/mc112-commands.baseline.json'), 'utf8'),
);
const roots = {
    function: functionCmd,
    effect: effectCmd,
    time: timeCmd,
    title: titleCmd,
    scoreboard: scoreboardCmd,
};

function strip(s) {
    const { _note, ...r } = s;
    void _note;
    return { ...r, children: (r.children || []).map(strip) };
}

function projectActual(impl, key) {
    const parts = key.split('.');
    const shape = toTreeShape(impl);
    if (parts.length === 1) {
        return shape;
    }
    let cursor = shape;
    for (let i = 1; i < parts.length; i++) {
        const next = (cursor.children || []).find((c) => c.kind === 'literal' && c.name === parts[i]);
        if (!next) {
            return { kind: 'root', name: impl.commandName, children: [] };
        }
        cursor.children = [next];
        cursor = next;
    }
    return shape;
}

function runSuite() {
    for (const [key, expectedRaw] of Object.entries(baseline.commands)) {
        const rootName = key.split('.')[0];
        const impl = roots[rootName];
        const actual = projectActual(impl, key);
        diffTreeShape(strip(expectedRaw), actual);
    }
}

out.push(bench('baseline suite body (5 entries)', 10000, runSuite));

const { CommandUtils } = require(path.join(root, 'out/utils/CommandUtils.js'));
const samples = [
    'function ns:foo if @a',
    'effect @p clear',
    'effect @p minecraft:speed 30 1 true',
    'execute @a ~ ~ ~ detect ~ ~-1 ~ stone 0 say hi',
    'scoreboard players set @p obj 1',
    'tellraw @a [{"text":"hi","color":"red"}]',
    'summon armor_stand ~ ~ ~ {Tags:["a","b"],CustomName:"x"}',
];
for (const line of samples) {
    out.push(bench(`extractCommand ${JSON.stringify(line)}`, 20000, () => CommandUtils.extractCommand(line)));
}

if (typeof EnumLib.BlockNameMap.filterByPrefix === 'function') {
    out.push(bench('BlockNameMap.filterByPrefix("st")', 5000, () => EnumLib.BlockNameMap.filterByPrefix('st')));
}
if (typeof EnumLib.SoundNames.filterByPrefix === 'function') {
    out.push(bench('SoundNames.filterByPrefix("block")', 2000, () => EnumLib.SoundNames.filterByPrefix('block')));
}

// wall: mocha suite via child-like re-run of suite body + load (already hot)
// 用 min reporter 测真实 mocha 开销
const tMocha0 = performance.now();
const Mocha = require('mocha');
const mocha = new Mocha({ timeout: 10000, reporter: 'min' });
const outBaselineDir = path.join(root, 'out/test/baseline');
fs.mkdirSync(outBaselineDir, { recursive: true });
fs.copyFileSync(
    path.join(root, 'src/test/baseline/mc112-commands.baseline.json'),
    path.join(outBaselineDir, 'mc112-commands.baseline.json'),
);
mocha.addFile(path.join(root, 'out/test/baseline/command-tree.diff.test.js'));
await new Promise((resolve) => {
    mocha.run(() => resolve());
});
out.push({
    name: 'mocha baseline suite wall (min reporter)',
    ms: +(performance.now() - tMocha0).toFixed(2),
});

console.log(JSON.stringify(out, null, 2));
