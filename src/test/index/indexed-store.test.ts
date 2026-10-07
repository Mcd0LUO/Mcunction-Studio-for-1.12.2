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

    it('buildPayload carries current version and fingerprint', () => {
        const p = buildPayload(new Map([['file:///x', 1]]), ['ns:a'], [], {
            scoreboards: [],
            teams: [],
            funcDefs: [],
            docIndex: [],
            fileKeyByRes: [],
            lineIndex: [],
        }, 'abc');
        assert.strictEqual(p.version, INDEX_CACHE_VERSION);
        // v4 起文件全集语义修正（幽灵索引不再可能进入缓存），旧缓存必须失效重建
        assert.strictEqual(INDEX_CACHE_VERSION, 4);
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

        // 注入 paths.rootDir（IndexCache 读写依赖）
        // 注意：rootDir 现在由 core/paths 持有，不再从 extension 导入
        const paths = require('../../core/paths') as typeof import('../../core/paths');
        const prev = paths.rootDir;
        paths.setRootDir(root);

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
            paths.setRootDir(prev);
            try {
                fs.rmSync(tmp, { recursive: true, force: true });
            } catch { /* ignore */ }
        }
    });
});

// ============================================================
// P0 回归：同名定义跨文件互删 + getMaxLine 爆栈
// ============================================================

describe('IndexedStore 定义点引用计数（P0 回归）', () => {
    it('两个文件同名 team：删一个不应连带删掉另一个', () => {
        const store = new IndexedStore();
        const uA = uri('file:///data/functions/a.mcfunction') as never;
        const uB = uri('file:///data/functions/b.mcfunction') as never;

        store.addTeam('ns:a', 'red', 1, uA);
        store.addTeam('ns:b', 'red', 2, uB);
        assert.strictEqual(store.getTeams().size, 1, '同名 team 只有一条定义记录');

        store.clearFile('ns:a', uA);
        assert.strictEqual(store.getTeams().size, 1, 'b.mcfunction 的 team red 必须保留');
        assert.ok(store.getTeams().has('red'), 'team red 不应被连带删除');

        store.clearFile('ns:b', uB);
        assert.strictEqual(store.getTeams().size, 0, '全部删除后才归零');
    });

    it('三个文件同名 scoreboard：逐个删除直到最后一个才消失', () => {
        const store = new IndexedStore();
        const uA = uri('file:///data/functions/a.mcfunction') as never;
        const uB = uri('file:///data/functions/b.mcfunction') as never;
        const uC = uri('file:///data/functions/c.mcfunction') as never;

        store.addScoreboard('ns:a', 'obj', 1, uA, 'dummy');
        store.addScoreboard('ns:b', 'obj', 5, uB, 'trigger');
        store.addScoreboard('ns:c', 'obj', 9, uC, 'dummy');
        assert.strictEqual(store.getScoreboards().size, 1);

        store.clearFile('ns:a', uA);
        assert.strictEqual(store.getScoreboards().size, 1, '删 a 后 b/c 仍在');
        store.clearFile('ns:b', uB);
        assert.strictEqual(store.getScoreboards().size, 1, '删 b 后 c 仍在');
        store.clearFile('ns:c', uC);
        assert.strictEqual(store.getScoreboards().size, 0, '删光后归零');
    });

    it('删除后 def 指针迁移到仍存在的定义点', () => {
        const store = new IndexedStore();
        const uA = uri('file:///data/functions/a.mcfunction') as never;
        const uB = uri('file:///data/functions/b.mcfunction') as never;

        store.addScoreboard('ns:a', 'obj', 1, uA, 'dummy');
        store.addScoreboard('ns:b', 'obj', 7, uB, 'trigger');
        assert.strictEqual(store.getScoreboards().get('obj')!.def[1], 1);

        store.clearFile('ns:a', uA);
        assert.strictEqual(
            store.getScoreboards().get('obj')!.def[1], 7,
            'def 指针应从已删的 a 迁到仍存在的 b',
        );
    });

    it('定义点引用计数经 exportState/importState 保持', () => {
        const store = new IndexedStore();
        const uA = uri('file:///data/functions/a.mcfunction') as never;
        const uB = uri('file:///data/functions/b.mcfunction') as never;

        store.addScoreboard('ns:a', 'obj', 1, uA, 'dummy');
        store.addScoreboard('ns:b', 'obj', 5, uB, 'trigger');

        const snap = JSON.parse(JSON.stringify(store.exportState()));
        const restored = new IndexedStore();
        restored.importState(snap);
        assert.strictEqual(restored.getScoreboards().size, 1);

        restored.clearFile('ns:a', uA);
        assert.strictEqual(restored.getScoreboards().size, 1, '导入后删 a，b 的定义必须保留');

        restored.clearFile('ns:b', uB);
        assert.strictEqual(restored.getScoreboards().size, 0);
    });
});

describe('getMaxLine 大文件不爆栈（P0 回归）', () => {
    it('LineIndex.getMaxLine 处理超过 13 万行', () => {
        const idx = new LineIndex();
        const f = 'file:///big.mcfunction';
        const n = 130000;
        for (let i = 0; i < n; i++) {
            idx.appendEntries(f, i, [{ type: 'tag', value: 't' + i }]);
        }
        // Math.max(...keys) 在此规模会抛 RangeError: Maximum call stack size exceeded
        assert.strictEqual(idx.getMaxLine(f), n - 1);
    });

    it('IndexedStore.getMaxLine 处理超过 13 万行', () => {
        const store = new IndexedStore();
        const u = uri('file:///data/functions/big.mcfunction') as never;
        const n = 130000;
        for (let i = 0; i < n; i++) {
            store.addTag('ns:big', 't' + i, i, u);
        }
        assert.strictEqual(store.getMaxLine('ns:big'), n - 1);
    });

    it('空索引返回 -1', () => {
        const idx = new LineIndex();
        assert.strictEqual(idx.getMaxLine('file:///none.mcfunction'), -1);
    });
});

// ============================================================
// 回归：跳转所需的引用位置查询
// ============================================================

describe('LineIndex.getLocations（定义跳转用）', () => {
    it('返回某值的全部引用位置', () => {
        const idx = new LineIndex();
        idx.appendEntries('file:///a.mcfunction', 3, [{ type: 'tag', value: 'red' }]);
        idx.appendEntries('file:///b.mcfunction', 7, [{ type: 'tag', value: 'red' }]);
        const locs = idx.getLocations('tag', 'red');
        assert.strictEqual(locs.length, 2);
        assert.ok(locs.some(l => l.file === 'file:///a.mcfunction' && l.line === 3));
        assert.ok(locs.some(l => l.file === 'file:///b.mcfunction' && l.line === 7));
    });

    it('不存在的值返回空数组', () => {
        const idx = new LineIndex();
        assert.deepStrictEqual(idx.getLocations('tag', 'nope'), []);
    });

    it('clearLine 后位置同步消失', () => {
        const idx = new LineIndex();
        idx.appendEntries('file:///a.mcfunction', 1, [{ type: 'fake_player', value: '#fp' }]);
        assert.strictEqual(idx.getLocations('fake_player', '#fp').length, 1);
        idx.clearLine('file:///a.mcfunction', 1);
        assert.strictEqual(idx.getLocations('fake_player', '#fp').length, 0);
    });

    it('文件名含冒号时仍能正确切分行号', () => {
        const idx = new LineIndex();
        // resName 形如 "ns:sub:name" 时位置键为 "ns:sub:name:12"
        idx.appendEntries('file:///data/functions/ns/sub/x.mcfunction', 12, [{ type: 'tag', value: 't' }]);
        const locs = idx.getLocations('tag', 't');
        assert.strictEqual(locs.length, 1);
        assert.strictEqual(locs[0].line, 12);
    });
});

describe('重复定义告警去重', () => {
    it('同名记分板重复定义时每个名称只提示一次', () => {
        const warnings: string[] = [];
        const vscodeMock = require('vscode') as { window: { showWarningMessage: (m: string) => void } };
        const original = vscodeMock.window.showWarningMessage;
        vscodeMock.window.showWarningMessage = (m: string) => { warnings.push(m); };

        try {
            const store = new IndexedStore();
            const uA = uri('file:///d/functions/a.mcfunction') as never;
            for (let i = 0; i < 20; i++) {
                const u = uri(`file:///d/functions/f${i}.mcfunction`) as never;
                store.addScoreboard(`ns:f${i}`, 'shared', 0, u, 'dummy');
            }
            assert.strictEqual(warnings.length, 1, `期望只弹 1 次，实际 ${warnings.length} 次`);
            assert.ok(warnings[0].includes('shared'));
        } finally {
            vscodeMock.window.showWarningMessage = original;
        }
    });
});

// ============================================================
// 回归：幽灵索引（v4 缓存语义修正的核心目标）
// ============================================================

describe('LineIndex.indexedFiles（索引真实全集）', () => {
    it('列出所有被索引过的文件', () => {
        const idx = new LineIndex();
        idx.appendEntries('file:///a.mcfunction', 0, [{ type: 'tag', value: 't' }]);
        idx.appendEntries('file:///b.mcfunction', 2, [{ type: 'tag', value: 't' }]);
        const files = idx.indexedFiles().sort();
        assert.deepStrictEqual(files, ['file:///a.mcfunction', 'file:///b.mcfunction']);
    });

    it('clearFile 后不再出现（这是幽灵能被剔除的前提）', () => {
        const idx = new LineIndex();
        const f = 'file:///ghost.mcfunction';
        idx.appendEntries(f, 0, [{ type: 'tag', value: 'ghost' }]);
        assert.strictEqual(idx.indexedFiles().length, 1);
        idx.clearFile(f);
        assert.strictEqual(idx.indexedFiles().length, 0, '被剔除的文件必须从全集消失');
        assert.strictEqual(idx.getValues('tag').length, 0);
    });

    it('空索引返回空数组', () => {
        assert.deepStrictEqual(new LineIndex().indexedFiles(), []);
    });
});

describe('被 IgnorePattern 排除的文件不会留下幽灵', () => {
    it('排除文件的索引可被 evicted（模拟 evictStaleFiles 的判定）', () => {
        const store = new IndexedStore();
        const kept = uri('file:///d/functions/kept.mcfunction') as unknown as { toString(): string };
        const excluded = uri('file:///d/functions/misc/ignored.mcfunction') as unknown as { toString(): string };

        // 两个文件都被索引过（当时排除规则尚未生效）
        store.addTag('ns:kept', 'kept_tag', 0, kept as never);
        store.addTag('ns:ignored', 'ghost_tag', 0, excluded as never);
        store.addScoreboard('ns:ignored', 'ghost_obj', 0, excluded as never, 'dummy');

        assert.strictEqual(store.getTags().get('ghost_tag'), 1);
        assert.strictEqual(store.getTags().size, 2);

        // 用户随后把 misc/ 加入 IgnorePattern → 再次扫描时 ignored.mcfunction
        // 不在扫描结果里。evictStaleFiles 以 indexedFiles() 为判定基准。
        const live = new Set([kept.toString()]);
        const candidates = new Set<string>([
            ...store.getLineIndex().indexedFiles(),
        ]);

        for (const key of candidates) {
            if (live.has(key)) { continue; }
            const resName = key.endsWith('ignored.mcfunction') ? 'ns:ignored' : '';
            store.clearFile(resName, { toString: () => key } as never);
        }

        // 幽灵必须彻底消失
        assert.strictEqual(store.getTags().get('ghost_tag'), undefined, '被排除文件的标签应消失');
        assert.strictEqual(store.getTags().has('kept_tag'), true, '仍在扫描范围内的文件不受影响');
        assert.strictEqual(store.getScoreboards().has('ghost_obj'), false, '被排除文件的记分板应消失');
        assert.deepStrictEqual(store.getLineIndex().indexedFiles(), [kept.toString()]);
    });
});
