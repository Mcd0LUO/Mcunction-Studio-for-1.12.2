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
/**
 * e2e 数据包目录。
 *
 * 必须是**固定路径**并与 .vscode-test.mjs 的 launchArgs 一致 ——
 * 测试用例要断言具体文件内容，若用 mkdtemp 随机目录则无从得知打开的是哪个文件。
 * 也不能在测试里用 vscode.openFolder 打开（会重启窗口并杀死测试运行器），
 * 因此工作区由启动参数注入。
 */
const PACK_ROOT = path.join(__dirname, '../../../.vscode-test/e2e-pack');

/** 写入全部测试夹具 */
function makePack(): { dataDir: string; packRoot: string; funcFile: string; goodFile: string; badFile: string; refFile: string; renameFile: string; fpFile: string } {
    const packRoot = PACK_ROOT;
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
            // 以下都曾是**大面积误报**的写法：
            // execute 的内层命令参数、scoreboard 的 dataTag / display name / 变长 entities
            'execute @s ~ ~ ~ say hello',
            'execute @s ~ ~ ~ detect ~ ~ ~ stone 0 setblock ~ ~ ~ air',
            'scoreboard objectives add named dummy My Display Name',
            'scoreboard players set @s used 1 {Health:10}',
            'scoreboard teams join blue @a @p',
            // 选择器里两个**不同**记分板目标各带一边约束 —— 不构成区间，不该报错
            'kill @a[score_used_min=1,score_named=-1]',
            // Windows 文件系统大小写不敏感：NS:good 能打开 ns/good.mcfunction
            'function NS:good',
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

    // References / Rename 用：定义 + 多处引用 + 一处同名字符串
    const refFile = path.join(dataDir, 'functions/ns/refs.mcfunction');
    fs.writeFileSync(
        refFile,
        [
            'scoreboard objectives add shared dummy',   // 0: 定义
            'scoreboard players set @s shared 1',        // 1: 引用
            'kill @a[score_shared=5]',                   // 2: 选择器引用
            'say shared is my score',                    // 3: 同名字符串（不该被当作引用）
            '',
        ].join('\n'),
    );

    // Rename 用：改名后必须只动 shared/total，不动消息文本
    const renameFile = path.join(dataDir, 'functions/ns/rename.mcfunction');
    fs.writeFileSync(
        renameFile,
        [
            'scoreboard objectives add total dummy',
            'scoreboard players set @s total 5',
            'kill @a[score_total=1]',
            'say total points',
            '',
        ].join('\n'),
    );

    // 假玩家重命名用：验证 # 前缀不会被重复插入（曾产生 ##newname）
    const fpFile = path.join(dataDir, 'functions/ns/fakeplayer.mcfunction');
    fs.writeFileSync(
        fpFile,
        [
            'scoreboard objectives add kills dummy',
            'scoreboard players set #fp kills 1',
            'scoreboard players add #fp kills 5',
            '',
        ].join('\n'),
    );

    return { dataDir, packRoot, funcFile, goodFile, badFile, refFile, renameFile, fpFile };
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
    let refFile: string;
    let renameFile: string;
    let fpFile: string;

    suiteSetup(async function () {
        this.timeout(90000);
        const pack = makePack();
        dataDir = pack.dataDir;
        packRoot = pack.packRoot;
        funcFile = pack.funcFile;
        goodFile = pack.goodFile;
        badFile = pack.badFile;
        refFile = pack.refFile;
        renameFile = pack.renameFile;
        fpFile = pack.fpFile;

        // 注意：不能用 vscode.openFolder —— 它会重启窗口并杀死测试运行器。
        // 这里只打开文档：扩展的 activationEvents 是 onLanguage:mcfunction，
        // 打开 .mcfunction 文件本身就会触发激活。
        await openInVsCode(funcFile);
        // 给激活与 provider 注册留出时间
        await new Promise(r => setTimeout(r, 2500));

        // 索引型能力（References / Rename / 未定义引用诊断）依赖 rootDir，
        // 它只能从工作区文件夹推导。工作区由 .vscode-test.mjs 的 launchArgs 注入，
        // 这里确认它确实在，并等待一次全量索引完成。
        const ready = await waitFor(
            () => (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
            20000,
        );
        const wsPaths = (vscode.workspace.workspaceFolders ?? []).map(w => w.uri.fsPath);
        assert.ok(ready, `工作区未打开（launchArgs 里的 e2e-pack 未生效）`);
        assert.ok(
            fs.existsSync(path.join(wsPaths[0], 'data', 'functions')),
            `工作区根下没有 data/functions，实际工作区：${JSON.stringify(wsPaths)}`,
        );

        await vscode.commands.executeCommand('mcf-studio.reloadWorkspace');
        await new Promise(r => setTimeout(r, 3000));
    });

    suiteTeardown(async () => {
        // 工作区指向此目录，不能删（下次运行还要用）；只清理索引缓存
        try {
            const cache = path.join(packRoot, '.McfStudio');
            fs.rmSync(cache, { recursive: true, force: true });
        } catch { /* ignore */ }
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

    // ================================================================
    // References / Rename
    // ================================================================

    test('引用查找能找到定义与全部引用', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(refFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // 第 1 行 "scoreboard players set @s shared 1" —— 光标落在 shared 上
        const line = doc.lineAt(1).text;
        const col = line.indexOf('shared');
        assert.ok(col > 0, '第 1 行应含 shared');

        const refs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            new vscode.Position(1, col + 1),
        );
        assert.ok(refs, '引用查找未返回结果（provider 未注册？）');
        assert.ok(refs.length >= 2, `应至少找到定义 + 1 处引用，实际 ${refs.length} 处`);

        // 必须包含定义所在的那一行
        const lines = refs.map(r => r.range.start.line);
        assert.ok(lines.includes(0), `应包含定义行（0），实际 ${JSON.stringify(lines)}`);
        // 区间必须精确指向 token
        for (const r of refs) {
            assert.strictEqual(
                doc.lineAt(r.range.start.line).text.slice(r.range.start.character, r.range.end.character),
                'shared',
                '引用区间必须精确指向 shared',
            );
        }
    });

    test('say 里的同名字符串不算引用（角色隔离）', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(refFile);
        const doc = await vscode.workspace.openTextDocument(uri);

        // refFile 第 3 行是 "say shared is my score" —— 消息里的 shared 不是记分板引用
        const line = doc.lineAt(3).text;
        const col = line.indexOf('shared');
        const refs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            new vscode.Position(3, col + 1),
        );
        // 要么不返回，要么返回空数组——绝不能返回记分板的引用
        assert.ok(
            !refs || refs.length === 0,
            `消息文本被误判为符号引用：${JSON.stringify(refs?.map(r => r.range.start.line))}`,
        );
    });

    test('重命名会同时改掉定义与引用，且不动无关文本', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(renameFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        const col = doc.lineAt(0).text.indexOf('total');
        const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
            'vscode.executeDocumentRenameProvider',
            uri,
            new vscode.Position(0, col + 1),
            'sum_all',
        );
        assert.ok(edit, '重命名 provider 未返回编辑集');

        const applied = await vscode.workspace.applyEdit(edit);
        assert.ok(applied, 'WorkspaceEdit 应用失败');

        // 验证结果：定义与引用都改了
        const after = await vscode.workspace.openTextDocument(uri);
        assert.ok(
            after.getText().includes('scoreboard objectives add sum_all dummy'),
            `定义未改名，当前内容：\n${after.getText()}`,
        );
        assert.ok(
            after.getText().includes('scoreboard players set @s sum_all 5'),
            '引用未改名',
        );
        // 第 3 行 "say total points" 必须原样保留
        assert.ok(
            after.getText().includes('say total points'),
            `消息文本被误改！当前内容：\n${after.getText()}`,
        );

        // 复原，避免影响后续用例
        await vscode.commands.executeCommand('workbench.action.files.revert');
    });

    test('假玩家重命名不产生 ##newname', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(fpFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // 第 1 行 "scoreboard players set #fp kills 1" —— 光标落在 fp 上
        const line = doc.lineAt(1).text;
        const col = line.indexOf('#fp') + 1;
        assert.ok(line.includes('#fp'), '夹具应含 #fp');

        const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
            'vscode.executeDocumentRenameProvider',
            uri,
            new vscode.Position(1, col),
            'boss',
        );
        assert.ok(edit, '假玩家应允许重命名');
        assert.ok(await vscode.workspace.applyEdit(edit), 'WorkspaceEdit 应用失败');

        const after = await vscode.workspace.openTextDocument(uri);
        const text = after.getText();

        assert.ok(
            !text.includes('##'),
            `出现了重复的 #（替换区间不含 #，替换文本必须是裸名）：\n${text}`,
        );
        assert.ok(
            text.includes('scoreboard players set #boss kills 1'),
            `定义处未正确改名：\n${text}`,
        );
        assert.ok(
            text.includes('scoreboard players add #boss kills 5'),
            `引用处未正确改名：\n${text}`,
        );

        await vscode.commands.executeCommand('workbench.action.files.revert');
    });

    test('非法重命名名被拒绝', async function () {
        this.timeout(30000);
        const uri = vscode.Uri.file(renameFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        const col = doc.lineAt(0).text.indexOf('total');

        // 超过 1.12.2 的 16 字符上限 —— provider 应返回 null / 空编辑集。
        // 注意：executeDocumentRenameProvider 在 provider 返回 null 时会**抛错**
        //（"No result."），因此这里两种表现都算"拒绝成功"。
        let rejected = false;
        try {
            const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
                'vscode.executeDocumentRenameProvider',
                uri,
                new vscode.Position(0, col + 1),
                'a'.repeat(17),
            );
            rejected = !edit || edit.size === 0;
        } catch {
            rejected = true;   // provider 返回 null → 命令报 "No result."
        }
        assert.ok(rejected, '超长名字应被拒绝，却返回了可用的编辑集');

        // 且文件内容未被改动
        const after = await vscode.workspace.openTextDocument(uri);
        assert.ok(
            after.getText().includes('scoreboard objectives add total dummy'),
            `被拒绝的重命名不应修改文件，当前内容：\n${after.getText()}`,
        );
    });

    // ================================================================
    // 补全替换区间
    //
    // 背景：VS Code 在补全项没有 range 时按语言词法推算替换范围，
    // 而默认词法把 `:` `/` `.` `@` `#` 当分隔符 ——
    // `function ns:` 的词范围为空、`function ns:a` 的只有 `a`，
    // 接受 `ns:test` 都会得到 `ns:ns:test`（命名空间被重复插入）。
    // 引擎现在显式设置区间，这里用真实宿主验证。
    // ================================================================

    /** 取出补全项实际生效的替换区间（VS Code 会暴露成 InsertReplace 对） */
    function replacingRange(item: vscode.CompletionItem): vscode.Range | undefined {
        const raw = item.range as unknown;
        if (!raw) { return undefined; }
        const asRange = raw as vscode.Range;
        if (asRange.start && typeof asRange.start.character === 'number') { return asRange; }
        const pair = raw as { replacing?: vscode.Range };
        return pair.replacing;
    }

    /** 在真实宿主里取某位置的补全项 */
    async function completionsAt(
        doc: vscode.TextDocument,
        line: number,
        character: number,
    ): Promise<vscode.CompletionItem[]> {
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(line, character),
        );
        return list?.items ?? [];
    }

    function labelOf(i: vscode.CompletionItem): string {
        return typeof i.label === 'string' ? i.label : i.label.label;
    }

    test('补全值候选的区间覆盖完整命名空间（不产生 ns:ns:test）', async function () {
        this.timeout(30000);
        const dataDir = path.dirname(funcFile);            // .../data/functions/ns
        const probe = path.join(dataDir, 'completion.mcfunction');
        fs.writeFileSync(probe, ['function ns:', 'function ns:a', ''].join('\n'));

        const uri = vscode.Uri.file(probe);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 1500));

        for (const [lineNo, line] of [[0, 'function ns:'], [1, 'function ns:a']] as const) {
            const items = await completionsAt(doc, lineNo, line.length);
            // 找一个真实的函数资源名（形如 ns:xxx）
            const funcItem = items.find(i => labelOf(i).startsWith('ns:'));
            assert.ok(
                funcItem,
                `第 ${lineNo} 行应给出函数名候选，实际：${JSON.stringify(items.map(labelOf).slice(0, 8))}`,
            );

            const r = replacingRange(funcItem!);
            assert.ok(r, '补全项必须带替换区间，否则 VS Code 会按词法猜');
            const replaced = line.slice(r!.start.character, r!.end.character);
            assert.ok(
                !replaced.startsWith('ns:') || replaced === line.trim().slice('function '.length),
                `替换区间应覆盖用户已输入的整段（含 ns:），实际覆盖 ${JSON.stringify(replaced)}`,
            );

            // 模拟接受该候选
            const insert = typeof funcItem!.insertText === 'string'
                ? funcItem!.insertText
                : (funcItem!.insertText ? funcItem!.insertText.value : labelOf(funcItem!));
            const result = line.slice(0, r!.start.character) + insert + line.slice(r!.end.character);
            assert.ok(
                !result.includes('ns:ns:'),
                `命名空间被重复插入：${JSON.stringify(line)} → ${JSON.stringify(result)}`,
            );
            assert.ok(
                result === `function ${labelOf(funcItem!)}`,
                `接受候选后应为 "function ${labelOf(funcItem!)}"，实际 ${JSON.stringify(result)}`,
            );
        }
    });

    test('下一级字面量使用零宽区间（插入而非替换）', async function () {
        this.timeout(30000);
        const dataDir = path.dirname(funcFile);
        const probe = path.join(dataDir, 'completion2.mcfunction');
        const line = 'clone 0 0 0 1 1 1 2 2 2';
        fs.writeFileSync(probe, line + '\n');

        const uri = vscode.Uri.file(probe);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 1500));

        const items = await completionsAt(doc, 0, line.length);
        const masked = items.find(i => labelOf(i) === 'masked');
        assert.ok(masked, `应给出 maskMode，实际：${JSON.stringify(items.map(labelOf).slice(0, 8))}`);

        const r = replacingRange(masked!);
        assert.ok(r, 'maskMode 应带区间');
        assert.strictEqual(
            r!.start.character, r!.end.character,
            'maskMode 是下一级字面量，必须是零宽区间（插入），否则会替换掉第 9 个坐标',
        );
        assert.strictEqual(r!.start.character, line.length, '零宽区间应落在光标处');
    });
});
