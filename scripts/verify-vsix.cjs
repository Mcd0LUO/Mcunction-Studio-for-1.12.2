/**
 * 对**打包产物**做激活验证。
 *
 * 为什么需要：e2e 跑的是工作区源码（test-cli 从 extensionDevelopmentPath 加载），
 * 而发布出去的是 vsix。.vscodeignore 少写一条、compile 少拷一个目录，
 * 源码测试全都发现不了 —— 用户装上去就是「扩展没反应」。
 *
 * 这里把 vsix 解到一个临时目录，用 mock 顶掉 vscode，
 * 直接 require 解出来的 out/extension.js 并调 activate()。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const vsix = process.argv[2] || (() => {
    const hits = fs.readdirSync(repo).filter(f => /^mcfunction-studio-.*\.vsix$/.test(f));
    if (hits.length === 0) { console.error('仓库根下没有 vsix，先跑 npx @vscode/vsce package'); process.exit(1); }
    return path.join(repo, hits.sort().pop());
})();
if (!fs.existsSync(vsix)) { console.error('找不到 vsix: ' + vsix); process.exit(1); }

// ---- 解包 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-vsix-'));
const zip = path.join(tmp, 'p.zip');
fs.copyFileSync(vsix, zip);
execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`], { stdio: 'inherit' });
const extDir = path.join(tmp, 'extension');
if (!fs.existsSync(extDir)) { console.error('解包后没有 extension/ 目录'); process.exit(1); }

// ---- 造一个数据包工作区 ----
const packRoot = path.join(tmp, 'pack');
const dataDir = path.join(packRoot, 'data');
fs.mkdirSync(path.join(dataDir, 'functions', 'ns'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'advancements', 'ns'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'functions', 'ns', 'a.mcfunction'),
    'scoreboard objectives add kills dummy\nscoreboard players set @s kills 1\n');
fs.writeFileSync(path.join(dataDir, 'advancements', 'ns', 'x.json'),
    JSON.stringify({ criteria: { a: { trigger: 'minecraft:impossible' } } }));

// ---- 装 mock ----
const mock = require(path.join(repo, 'scripts', 'vscode-mock.cjs'));
mock.__setWorkspaceFolders([{ uri: mock.Uri.file(dataDir), name: 'ws', index: 0 }]);
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return mock; }
    return origLoad.apply(this, arguments);
};

// ---- 加载打包产物并激活 ----
const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
const mainPath = path.join(extDir, pkg.main);
console.log('main =', pkg.main, fs.existsSync(mainPath) ? '(存在)' : '(缺失!)');
if (!fs.existsSync(mainPath)) { process.exit(1); }

const ext = require(mainPath);
const subs = [];
const ctx = {
    subscriptions: subs,
    extensionPath: extDir,
    extensionUri: mock.Uri.file(extDir),
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
    asAbsolutePath: (p) => path.join(extDir, p),
};

let failed = false;
try {
    ext.activate(ctx);
} catch (e) {
    failed = true;
    console.error('activate() 抛异常:', e.message);
}

setTimeout(async () => {
    const { CompletionEngine } = require(path.join(extDir, 'out/dsl/engine.js'));
    const { DataLoader } = require(path.join(extDir, 'out/core/DataLoader.js'));
    const eng = CompletionEngine.getCurrent();
    console.log('引擎已装配:', !!eng, ' 命令数:', eng ? eng.getRootItems().length : 0);
    console.log('注册的 provider 数:', subs.length);

    const loader = DataLoader.getInstance();
    console.log('索引函数数:', loader.getFunctionResNames().length);
    console.log('索引进度数:', loader.getAdvancementResNames().length);

    // 补全能出结果
    if (eng) {
        const items = await eng.complete(['scoreboard', 'players', ''], 'scoreboard players ');
        console.log('补全 scoreboard players →', items.length, '项');
        if (items.length === 0) { failed = true; console.error('补全返回 0 项'); }
    }
    if (!eng || eng.getRootItems().length !== 41) { failed = true; console.error('命令数不是 41'); }
    if (subs.length === 0) { failed = true; console.error('没有注册任何 provider'); }

    console.log('');
    console.log(failed ? '❌ 打包产物激活验证失败' : '✅ 打包产物激活验证通过');
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
}, 3000);
