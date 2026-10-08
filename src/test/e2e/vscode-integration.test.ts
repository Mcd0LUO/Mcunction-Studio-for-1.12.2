/**
 * 真实 VS Code 集成测试（由 @vscode/test-electron 在 Electron 宿主中运行）
 *
 * 与 Node 侧的 mock 测试分开：这里跑在真正的 VS Code 里，
 * 验证只有真实宿主才能确认的事：
 *   - .mcfunction 文件是否真的被识别为 mcfunction 语言（语言绑定）
 *   - 扩展是否真的被激活（onLanguage:mcfunction 是否生效）
 *   - 补全 provider 是否真的注册并返回结果
 *
 * 该文件不参与 test:engine（那是 Node + mock 环境）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'Mcd0-LUO.mcfunction-studio';

/** 创建一个符合 README 的临时数据包：<tmp>/data/functions/...
 *  @returns data 目录（即 README 要求作为工作区的那个目录） */
function makePack(): { dataDir: string; packRoot: string; funcFile: string; goodFile: string; badFile: string } {
    const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-e2e-'));
    const dataDir = path.join(packRoot, 'data');
    fs.mkdirSync(path.join(dataDir, 'functions/ns'), { recursive: true });
    const funcFile = path.join(dataDir, 'functions/ns/a.mcfunction');
    fs.writeFileSync(
        funcFile,
        [
            'scoreboard objectives add kills dummy',
            'scoreboard players tag @s add marked',
            'effect @p speed',
            '',
        ].join('\n'),
    );

    // 诊断用：内容全部合法的文件（断言不被误报）
    const goodFile = path.join(dataDir, 'functions/ns/good.mcfunction');
    fs.writeFileSync(
        goodFile,
        [
            'scoreboard objectives add used dummy',
            'scoreboard teams add blue',
            'say hello world',
            'kill',
            'scoreboard players set @s used 1',
            'scoreboard players set @s used 5',
            '',
        ].join('\n'),
    );

    // 诊断用：含已知缺陷的文件
    const badFile = path.join(dataDir, 'functions/ns/bad.mcfunction');
    fs.writeFileSync(
        badFile,
        [
            'function ns:missing',                              // 0: 函数不存在 → error
            'scoreboard objectives add toolongobjective dummy', // 1: 名称 18 字符 > 16 → error
            'scoreboard players set @s used 3000000000',         // 2: 超出 int32 → warning
            '',
        ].join('\n'),
    );

    return { dataDir, packRoot, funcFile, goodFile, badFile };
}

async function openInVsCode(fsPath: string): Promise<vscode.TextDocument> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    return doc;
}

/** 等待某条件成立（扩展激活是异步的） */
async function waitFor(pred: () => boolean, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (pred()) { return true; }
        await new Promise(r => setTimeout(r, 200));
    }
    return false;
}

suite('Mcfunction Studio — 真实 VS Code 集成', () => {
    let packRoot: string;
    let dataDir: string;
    let funcFile: string;
    let goodFile: string;
    let badFile: string;

    suiteSetup(async function () {
        this.timeout(60000);
        const pack = makePack();
        dataDir = pack.dataDir;
        packRoot = pack.packRoot;
        funcFile = pack.funcFile;
        goodFile = pack.goodFile;
        badFile = pack.badFile;

        // 注意：不能用 vscode.openFolder —— 它会重启窗口并杀死测试运行器。
        // 这里只打开文档：扩展的 activationEvents 是 onLanguage:mcfunction，
        // 打开 .mcfunction 文件本身就会触发激活（rootDir 定位失败也不影响，
        // activate 已改为优雅降级）。
        await openInVsCode(funcFile);
        // 给激活与 provider 注册留出时间
        await new Promise(r => setTimeout(r, 2500));
    });

    suiteTeardown(async () => {
        try { fs.rmSync(packRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('扩展已安装并可被识别', () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext, `未找到扩展 ${EXT_ID}`);
    });

    test('.mcfunction 文件被识别为 mcfunction 语言（语言绑定生效）', async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(funcFile));
        assert.strictEqual(
            doc.languageId, 'mcfunction',
            `语言绑定失败：实际 languageId = ${doc.languageId}`,
        );
    });

    test('扩展已被激活（activationEvents 生效）', async () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext);
        const active = await waitFor(() => ext!.isActive, 20000);
        assert.ok(active, '扩展在 20 秒内未被激活 —— activationEvents 可能未生效，或 activate 抛了异常');
    });

    test('补全 provider 已注册并返回结果', async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(funcFile));
        const editor = await vscode.window.showTextDocument(doc);

        // 定位到第 3 行 "effect @p speed" 末尾，触发补全
        const line = 2;
        const text = doc.lineAt(line).text;
        editor.selection = new vscode.Selection(line, text.length, line, text.length);
        editor.revealRange(new vscode.Range(line, 0, line, text.length));

        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(line, text.length),
        );

        assert.ok(list, '补全 provider 未返回结果（可能未注册）');
        const labels = list.items.map(i =>
            typeof i.label === 'string' ? i.label : i.label.label
        );
        assert.ok(labels.length > 0, `补全返回 0 项（实际 ${labels.length}）`);
    });

    test('命令补全覆盖已注册的内置命令', async () => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(funcFile));
        const editor = await vscode.window.showTextDocument(doc);
        const lastLine = doc.lineCount - 1;
        const text = doc.lineAt(lastLine).text;
        editor.selection = new vscode.Selection(lastLine, text.length, lastLine, text.length);

        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(lastLine, text.length),
        );
        assert.ok(list && list.items.length > 0, '根命令补全应有结果');
    });

    test('扩展注册的命令存在于命令面板', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(
            cmds.includes('mcf-studio.reloadWorkspace'),
            '未注册 mcf-studio.reloadWorkspace',
        );
        assert.ok(cmds.includes('mcf-studio.createFunctionFile'));
        assert.ok(cmds.includes('mcf-studio.fastScoreboardDebug'));
        assert.ok(cmds.includes('mcf-studio.toggleDslDebug'));
    });

    // ================================================================
    // 诊断（红线）—— 只有真实宿主能验证的部分
    // ================================================================

    test('诊断已发布到 DiagnosticCollection（红线真的会出现）', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(badFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // 诊断是防抖 300ms 的，等它落定
        const got = await waitFor(
            () => vscode.languages.getDiagnostics(uri).length > 0,
            15000,
        );

        const diags = vscode.languages.getDiagnostics(uri);
        assert.ok(
            got,
            `扩展未对该文件发布任何诊断（实际 ${diags.length} 条）—— DiagnosticCollection 未注册或未触发刷新`,
        );
        assert.strictEqual(diags[0].source, 'mcfunction-studio', '诊断来源标记不正确');
        assert.ok(diags[0].code, '诊断缺少机器码（ruleId），配置抑制会失效');
    });

    test('诊断覆盖到预期的问题行（未定义 function）', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(badFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await waitFor(() => vscode.languages.getDiagnostics(uri).length > 0, 15000);

        const diags = vscode.languages.getDiagnostics(uri);
        const fnHit = diags.find(d => d.code === 'resource/undefined-function');
        assert.ok(
            fnHit,
            `未报出 resource/undefined-function，实际诊断：${diags.map(d => d.code).join(', ')}`,
        );
        // bad.mcfunction 第 0 行是 "function ns:missing"
        assert.strictEqual(fnHit.range.start.line, 0, '诊断行号与源文件不符');
    });

    test('合法文件不被误报（防误报是头等大事）', async function () {
        this.timeout(30000);
        const doc = vscode.Uri.file(goodFile);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(doc));
        // 等索引与诊断都稳定
        await new Promise(r => setTimeout(r, 3000));
        const diags = vscode.languages.getDiagnostics(doc);
        assert.strictEqual(
            diags.length, 0,
            `正确写法被误报：${diags.map(d => `${d.code}: ${d.message}`).join(' | ')}`,
        );
    });
});
