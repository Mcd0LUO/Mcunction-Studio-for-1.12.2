/**
 * P0 索引正确性回归：LineIndex 键 / 多 Tag / clear 幽灵 / function 按行删除
 * + IndexCache v2 相对路径压缩 round-trip
 */
import * as assert from 'assert';
import * as path from 'path';
import { LineIndex } from '../../core/LineIndex';
import { IndexedStore } from '../../core/data/IndexedStore';
import {
    buildPayload,
    computeFingerprint,
    estimateDiskBytes,
    INDEX_CACHE_VERSION,
    mtimesMatch,
} from '../../core/data/IndexCache';

/** 最小 Uri 桩 */
function uri(path: string): { toString(): string; fsPath: string; path: string; scheme: string } {
    const fsPath = path.replace(/\//g, '\\');
    return {
        scheme: 'file',
        fsPath,
        path: path.startsWith('/') ? path : '/' + path,
        toString: () => 'file:///' + path.replace(/\\/g, '/').replace(/^\/+/, ''),
    };
}

describe('LineIndex', () => {
    it('exportState/importState round-trips tags and refcounts', () => {
        const idx = new LineIndex();
        const f = 'file:///a.mcfunction';
        idx.appendEntries(f, 0, [{ type: 'tag', value: 'a' }, { type: 'tag', value: 'b' }]);
        idx.appendEntries(f, 1, [{ type: 'tag', value: 'a' }]);
        const snap = idx.exportState();
        const idx2 = new LineIndex();
        idx2.importState(snap);
        assert.deepStrictEqual(idx2.getLineEntries(f, 0).map(e => e.value).sort(), ['a', 'b']);
        assert.deepStrictEqual(idx2.getByType('tag').map(v => `${v.value}:${v.count}`).sort(), ['a:2', 'b:1']);
    });

    it('appendEntries keeps multiple tags on same line', () => {
        const idx = new LineIndex();
        const f = 'file:///a.mcfunction';
        idx.appendEntries(f, 0, [{ type: 'tag', value: 'a' }]);
        idx.appendEntries(f, 0, [{ type: 'tag', value: 'b' }, { type: 'tag', value: 'c' }]);
        const line = idx.getLineEntries(f, 0);
        assert.deepStrictEqual(line.map(e => e.value).sort(), ['a', 'b', 'c']);
        assert.strictEqual(idx.getValues('tag').sort().join(','), 'a,b,c');
    });

    it('addLine replaces; clearLine drops refcounts', () => {
        const idx = new LineIndex();
        const f = 'file:///a.mcfunction';
        idx.addLine(f, 1, [{ type: 'tag', value: 'x' }]);
        idx.addLine(f, 1, [{ type: 'tag', value: 'y' }]);
        assert.deepStrictEqual(idx.getValues('tag'), ['y']);
        idx.clearLine(f, 1);
        assert.deepStrictEqual(idx.getValues('tag'), []);
    });

    it('clearFile only affects matching file key', () => {
        const idx = new LineIndex();
        idx.appendEntries('file:///a', 0, [{ type: 'tag', value: 'a' }]);
        idx.appendEntries('file:///b', 0, [{ type: 'tag', value: 'b' }]);
        idx.clearFile('file:///a');
        assert.deepStrictEqual(idx.getValues('tag'), ['b']);
    });
});

describe('IndexedStore P0', () => {
    const u1 = uri('D:/pack/data/functions/ns/a.mcfunction') as any;
    const u2 = uri('D:/pack/data/functions/ns/b.mcfunction') as any;
    const res1 = 'ns:a';
    const res2 = 'ns:b';

    it('multi-tag on one line all retained', () => {
        const store = new IndexedStore();
        store.addTags(res1, ['alpha', 'beta', 'gamma'], 3, u1);
        const tags = store.getTags();
        assert.strictEqual(tags.get('alpha'), 1);
        assert.strictEqual(tags.get('beta'), 1);
        assert.strictEqual(tags.get('gamma'), 1);
        const line = store.getLineIndex().getLineEntries(u1.toString(), 3);
        assert.strictEqual(line.filter(e => e.type === 'tag').length, 3);
    });

    it('clearLines removes tags (no ghost) using uri key', () => {
        const store = new IndexedStore();
        store.addTag(res1, 'ghost', 1, u1);
        store.addFakePlayer(res1, '#fp', 2, u1);
        assert.ok(store.getTags().has('ghost'));
        assert.ok(store.getFakePlayers().has('#fp'));

        store.clearLines(res1, 1, 2, u1);
        assert.strictEqual(store.getTags().size, 0);
        assert.strictEqual(store.getFakePlayers().size, 0);
        assert.deepStrictEqual(store.getLineIndex().getLineEntries(u1.toString(), 1), []);
    });

    it('clearFile with wrong resName key still needs uri — clearFile(res, uri) works', () => {
        const store = new IndexedStore();
        store.addTag(res1, 't1', 0, u1);
        store.clearFile(res1, u1);
        assert.strictEqual(store.getTags().size, 0);
    });

    it('function refs removed per-line not whole file', () => {
        const store = new IndexedStore();
        store.addFunctionRef(res1, 'ns:foo', 1, u1);
        store.addFunctionRef(res1, 'ns:foo', 5, u1);
        store.addFunctionRef(res1, 'ns:bar', 5, u1);

        store.clearLines(res1, 5, 5, u1);

        const funcs = store.getFunctions();
        const foo = funcs.get('ns:foo')!.ref.get(res1)!;
        assert.deepStrictEqual(foo, [1]);
        assert.strictEqual(funcs.has('ns:bar'), false);
    });

    it('clear one file does not drop other file tags', () => {
        const store = new IndexedStore();
        store.addTag(res1, 'shared', 0, u1);
        store.addTag(res2, 'shared', 0, u2);
        assert.strictEqual(store.getTags().get('shared'), 2);

        store.clearFile(res1, u1);
        assert.strictEqual(store.getTags().get('shared'), 1);
        store.clearFile(res2, u2);
        assert.strictEqual(store.getTags().has('shared'), false);
    });

    it('exportState/importState preserves scoreboard/team/tag/func', () => {
        const store = new IndexedStore();
        store.addScoreboard(res1, 'obj', 0, u1, 'dummy', 'd');
        store.addTeam(res1, 'red', 1, u1);
        store.addTags(res1, ['t1', 't2'], 2, u1);
        store.addFakePlayer(res1, '#fp', 3, u1);
        store.addFunctionRef(res1, 'ns:foo', 4, u1);

        const snap = store.exportState();
        // 经 JSON 往返模拟磁盘
        const restored = new IndexedStore();
        restored.importState(JSON.parse(JSON.stringify(snap)));

        assert.strictEqual(restored.getScoreboards().size, 1);
        assert.ok(restored.getScoreboards().has('obj'));
        assert.strictEqual(restored.getScoreboards().get('obj')!.type, 'dummy');
        assert.ok(restored.getTeams().has('red'));
        assert.strictEqual(restored.getTags().get('t1'), 1);
        assert.strictEqual(restored.getTags().get('t2'), 1);
        assert.strictEqual(restored.getFakePlayers().get('#fp'), 1);
        assert.deepStrictEqual(restored.getFunctions().get('ns:foo')!.ref.get(res1), [4]);
        assert.strictEqual(
            restored.getLineIndex().getLineEntries(u1.toString(), 2).filter(e => e.type === 'tag').length,
            2,
        );
    });
});

describe('IndexCache path compression helpers', () => {
    it('mtimesMatch requires exact key set', () => {
        const cur = new Map([['file:///a', 1], ['file:///b', 2]]);
        assert.strictEqual(mtimesMatch({ 'file:///a': 1, 'file:///b': 2 }, cur), true);
        assert.strictEqual(mtimesMatch({ 'file:///a': 1 }, cur), false);
        assert.strictEqual(mtimesMatch({ 'file:///a': 9, 'file:///b': 2 }, cur), false);
    });

    it('buildPayload carries version 3 and fingerprint', () => {
        const p = buildPayload(new Map([['file:///x', 1]]), ['ns:a'], [], {
            scoreboards: [],
            teams: [],
            funcDefs: [],
            docIndex: [],
            fileKeyByRes: [],
            lineIndex: [],
        }, 'abc');
        assert.strictEqual(p.version, INDEX_CACHE_VERSION);
        assert.strictEqual(INDEX_CACHE_VERSION, 3);
        assert.strictEqual(p.fingerprint, 'abc');
    });

    it('computeFingerprint is order-independent and mtime-sensitive', () => {
        const a = computeFingerprint([['b.mcfunction', 2], ['a.mcfunction', 1]]);
        const b = computeFingerprint([['a.mcfunction', 1], ['b.mcfunction', 2]]);
        const c = computeFingerprint([['a.mcfunction', 9], ['b.mcfunction', 2]]);
        assert.strictEqual(a, b);
        assert.notStrictEqual(a, c);
    });

    it('estimateDiskBytes prefers short relative paths', () => {
        // 用真实 vscode.Uri（mock）构造长绝对路径
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscode = require('vscode') as typeof import('vscode');
        const root = vscode.Uri.file(path.join('D:', 'pack', 'data'));
        const f1 = vscode.Uri.joinPath(root, 'functions', 'ns', 'a.mcfunction').toString();
        const f2 = vscode.Uri.joinPath(root, 'functions', 'ns', 'b.mcfunction').toString();

        const store = new IndexedStore();
        const u1 = vscode.Uri.parse(f1);
        const u2 = vscode.Uri.parse(f2);
        store.addTag('ns:a', 't', 0, u1);
        store.addTag('ns:b', 't', 0, u2);
        store.addScoreboard('ns:a', 'obj', 1, u1, 'dummy', '');

        const mtimes = new Map([[f1, 100], [f2, 200]]);
        const payload = buildPayload(mtimes, ['ns:a', 'ns:b'], [], store.exportState());

        const absJson = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
        const diskBytes = estimateDiskBytes(payload, root);
        assert.ok(diskBytes !== null && diskBytes > 0);
        // 相对路径 + 文件表应明显小于绝对 URI 的逻辑 payload
        assert.ok(
            diskBytes! < absJson,
            `disk ${diskBytes} should be < abs payload ${absJson}`,
        );
    });

    it('v2 compress/expand keeps mtime keys stable for match', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscode = require('vscode') as typeof import('vscode');
        const fs = require('fs') as typeof import('fs');
        const os = require('os') as typeof import('os');

        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcf-cache-'));
        const dataRoot = path.join(tmp, 'data');
        const fnDir = path.join(dataRoot, 'functions', 'ns');
        fs.mkdirSync(fnDir, { recursive: true });
        const absFile = path.join(fnDir, 'a.mcfunction');
        fs.writeFileSync(absFile, 'say hi\n', 'utf8');

        const root = vscode.Uri.file(dataRoot);
        const fileUri = vscode.Uri.file(absFile);
        const fileKey = fileUri.toString();

        // 注入 extension.rootDir（IndexCache 读写依赖）
        const ext = require('../../extension') as { rootDir?: typeof root };
        const prev = ext.rootDir;
        ext.rootDir = root;

        try {
            const store = new IndexedStore();
            store.addTag('ns:a', 'hello', 0, fileUri);
            const st = fs.statSync(absFile);
            const mtimes = new Map([[fileKey, st.mtimeMs]]);
            const payload = buildPayload(mtimes, ['ns:a'], [], store.exportState());

            const { writeIndexCache, readIndexCache, cacheUri } = require('../../core/data/IndexCache') as typeof import('../../core/data/IndexCache');
            const ok = await writeIndexCache(payload);
            assert.strictEqual(ok, true);

            const onDisk = cacheUri();
            assert.ok(onDisk);
            assert.ok(fs.existsSync(onDisk!.fsPath), 'should write .json.gz');
            assert.ok(onDisk!.fsPath.endsWith('.json.gz'));
            // gzip 魔数
            const head = fs.readFileSync(onDisk!.fsPath);
            assert.strictEqual(head[0], 0x1f);
            assert.strictEqual(head[1], 0x8b);

            const loaded = await readIndexCache();
            assert.ok(loaded);
            assert.strictEqual(mtimesMatch(loaded!.mtimes, mtimes), true);
            assert.ok(loaded!.mtimes[fileKey] === st.mtimeMs);

            const restored = new IndexedStore();
            restored.importState(loaded!.store);
            assert.strictEqual(restored.getTags().get('hello'), 1);
        } finally {
            ext.rootDir = prev;
            try {
                fs.rmSync(tmp, { recursive: true, force: true });
            } catch { /* ignore */ }
        }
    });
});
