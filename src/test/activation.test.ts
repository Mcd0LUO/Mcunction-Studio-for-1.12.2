/**
 * 扩展激活冒烟测试
 *
 * 背景：曾出现两个会导致扩展「完全没反应」的问题：
 *   1. package.json 的 activationEvents 为空数组 → 打开 .mcfunction 时不激活
 *   2. getRootDir() 在找不到 data 目录时抛异常且 activate 未捕获 → 激活整体中断
 *
 * 这里用 mock 驱动真实的 out/extension.js，覆盖三条路径：
 * 正常数据包工作区 / 未打开工作区 / 工作区不是数据包。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

type Activate = (ctx: vscode.ExtensionContext) => void | Promise<void>;

// 扩展入口需要运行时 require（会拉起真实 activate 链）
const req: NodeRequire = require;

const mock = req('vscode') as typeof vscode & {
    __setWorkspaceFolders?: (folders: unknown[]) => void;
};

/** 通过 mock 的专用 setter 设置工作区（真实 API 是只读的） */
function setWorkspace(fsPath: string | undefined): void {
    if (!fsPath) {
        mock.__setWorkspaceFolders!([] as unknown[]);
        (mock.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;
        return;
    }
    mock.__setWorkspaceFolders!([{ uri: mock.Uri.file(fsPath), name: 'ws', index: 0 }]);
}

/**
 * 断言引擎已装配且内置命令齐全。
 *
 * 三条激活路径（正常 / 无工作区 / 非数据包）都要确认这一点，
 * 断言内容完全相同，抽出来避免三处各写一遍 41。
 */
function assertEngineReady(why: string): void {
    const engine = CompletionEngine.getCurrent();
    assert.ok(engine, `${why}：引擎应被显式装配`);
    assert.strictEqual(
        engine!.getRootItems().length, 41,
        `${why}：应注册全部 41 条内置命令`,
    );
}

let ext: { activate: Activate; deactivate: () => void };
let CompletionEngine: typeof import('../dsl/engine').CompletionEngine;
let MinecraftCompletionProvider: typeof import('../completionProvider/Minecraft').MinecraftCompletionProvider;
let DataLoader: typeof import('../core/DataLoader').DataLoader;
let paths: typeof import('../core/paths');

/** 造一个符合 README 的工作区：<tmp>/data/functions/... */
function makePack(files: Record<string, string> = {}): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-act-'));
    const dataDir = path.join(tmp, 'data');
    fs.mkdirSync(path.join(dataDir, 'functions/ns'), { recursive: true });
    fs.writeFileSync(
        path.join(dataDir, 'functions/ns/a.mcfunction'),
        files['a'] ?? 'scoreboard objectives add kills dummy\n',
    );
    return dataDir;
}

function fakeContext(): vscode.ExtensionContext {
    return { subscriptions: [], extensionPath: process.cwd() } as unknown as vscode.ExtensionContext;
}

const cleanup: string[] = [];

after(() => {
    for (const d of cleanup) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
});

before(() => {
    ext = req('../extension');
    CompletionEngine = req('../dsl/engine').CompletionEngine;
    MinecraftCompletionProvider = req('../completionProvider/Minecraft').MinecraftCompletionProvider;
    DataLoader = req('../core/DataLoader').DataLoader;
    paths = req('../core/paths');
});

describe('扩展激活', () => {
    // __dirname 位于 <root>/out/test，上溯两级即项目根
    const ROOT = path.resolve(__dirname, '..', '..');

    it('package.json 声明了 onLanguage 激活事件', () => {
        // 用户打开 .mcfunction 才会激活；空数组会导致补全完全不出现
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        assert.ok(
            Array.isArray(pkg.activationEvents) && pkg.activationEvents.includes('onLanguage:mcfunction'),
            'activationEvents 必须包含 onLanguage:mcfunction，否则打开 .mcfunction 时不会激活',
        );
    });

    it('main 指向的产物存在且导出 activate', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        const mainJs = path.join(ROOT, pkg.main);
        assert.ok(fs.existsSync(mainJs), `main 指向的文件不存在: ${mainJs}`);
        assert.strictEqual(typeof ext.activate, 'function');
        assert.strictEqual(typeof ext.deactivate, 'function');
    });
});

describe('激活路径：正常数据包工作区', () => {
    it('定位 data 目录、装配引擎并建立索引', async () => {
        const dataDir = makePack({
            a: 'scoreboard objectives add kills dummy\nscoreboard players tag @s add marked\n',
        });
        cleanup.push(path.dirname(dataDir));

        setWorkspace(dataDir);

        ext.activate(fakeContext());

        assert.ok(paths.rootDir, 'rootDir 应被设置');
        assert.strictEqual(paths.rootDir!.fsPath, path.resolve(dataDir));
        assertEngineReady('正常数据包工作区');

        // 索引是异步的（dataloader.init() 未 await），等一拍
        await new Promise(r => setTimeout(r, 600));
        const loader = DataLoader.getInstance();
        assert.ok(loader.getFunctionResNames().includes('ns:a'), '应索引到函数 ns:a');
        assert.ok(loader.getScoreboardsData().has('kills'), '应索引到记分板 kills');
        assert.ok(loader.getTagsData().has('marked'), '应索引到标签 marked');
    });

    it('补全在激活后可用', async () => {
        const doc = { lineAt: () => ({ text: 'effect @p ' }) } as unknown as vscode.TextDocument;
        const items = await MinecraftCompletionProvider.instance.provideCompletionItems(
            doc,
            { line: 0, character: 10 } as vscode.Position,
            undefined as unknown as vscode.CancellationToken,
            {} as vscode.CompletionContext,
        );
        assert.ok(items.length > 0, '激活后补全应返回结果');
        const labels = items.map(i => (typeof i.label === 'string' ? i.label : i.label?.label));
        assert.ok(labels.includes('clear'), 'effect <player> 应能补出 clear');
    });
});

describe('激活路径：异常环境应优雅降级', () => {
    it('未打开工作区时 activate 不抛异常（否则扩展完全无反应）', () => {
        setWorkspace(undefined);

        // 关键断言：不抛异常
        ext.activate(fakeContext());

        // 引擎仍应装配 —— 静态补全不依赖项目数据
        assertEngineReady('未打开工作区');
    });

    it('工作区不是数据包时 activate 不抛异常', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-notapack-'));
        cleanup.push(tmp);
        const mock = require('vscode') as typeof vscode;
        setWorkspace(tmp);

        ext.activate(fakeContext());   // 不应抛异常
        assertEngineReady('工作区不是数据包');
    });

    it('无工作区时补全仍返回静态结果', async () => {
        const doc = { lineAt: () => ({ text: 'effect @p ' }) } as unknown as vscode.TextDocument;
        const items = await MinecraftCompletionProvider.instance.provideCompletionItems(
            doc,
            { line: 0, character: 10 } as vscode.Position,
            undefined as unknown as vscode.CancellationToken,
            {} as vscode.CompletionContext,
        );
        assert.ok(items.length > 0, '无项目数据时静态补全仍应可用');
    });
});

describe('deactivate', () => {
    it('释放全局引擎引用', () => {
        // 先确保有一个引擎
        const dataDir = makePack();
        cleanup.push(path.dirname(dataDir));
        setWorkspace(dataDir);
        ext.activate(fakeContext());
        assert.ok(CompletionEngine.getCurrent());

        ext.deactivate();
        assert.strictEqual(CompletionEngine.getCurrent(), undefined, 'deactivate 应释放全局引用');
    });
});
