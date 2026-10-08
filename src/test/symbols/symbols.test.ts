/**
 * 符号抽取 / 引用解析 / 重命名合法性（Node + vscode mock）
 *
 * 重点覆盖**会导致数据损坏的错误**：
 *   · 同名不同角色（say 里的 mytag 不能被标签重命名波及）
 *   · 假玩家的 # 前缀
 *   · 列区间必须精确到 token，不能吞掉相邻文本
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { extractSymbols } from '../../core/symbols/extractor';
import { SymbolResolver } from '../../core/symbols/resolver';
import { IndexedStore } from '../../core/data';
import { isValidName } from '../../core/RenameProvider';

/** 取某行某 kind 的所有出现 */
function of(line: string, kind: string) {
    return extractSymbols(line).filter(o => o.kind === kind);
}

/** 断言某个出现恰好覆盖 line 的 [start, end) */
function assertSpan(line: string, kind: string, value: string, expectedText: string): void {
    const hits = extractSymbols(line).filter(o => o.kind === kind && o.value === value);
    assert.ok(hits.length > 0, `未找到 ${kind}=${value} in: ${line}`);
    const got = hits.map(h => line.slice(h.start, h.end));
    assert.ok(
        got.includes(expectedText),
        `${kind}=${value} 的区间应覆盖 "${expectedText}"，实际 ${JSON.stringify(got)}`,
    );
}

// ============================================================
// 分词与位置
// ============================================================

describe('symbols/位置精度', () => {
    it('列区间精确指向 token，不吞相邻空白', () => {
        const line = 'scoreboard objectives add kills dummy';
        const [d] = of(line, 'scoreboard');
        assert.strictEqual(d.value, 'kills');
        assert.strictEqual(line.slice(d.start, d.end), 'kills');
        assert.strictEqual(line[d.start - 1], ' ', '起点前应是空格');
    });

    it('行首缩进不影响位置', () => {
        const line = '    scoreboard objectives add kills dummy';
        const [d] = of(line, 'scoreboard');
        assert.strictEqual(line.slice(d.start, d.end), 'kills');
        assert.strictEqual(d.start, line.indexOf('kills'));
    });

    it('注释行产出零符号', () => {
        assert.deepStrictEqual(extractSymbols('# scoreboard objectives add foo dummy'), []);
    });

    it('行尾注释不被当成符号', () => {
        const hits = extractSymbols('scoreboard objectives add kills dummy # 注释 kills');
        assert.strictEqual(hits.filter(o => o.kind === 'scoreboard').length, 1);
    });
});

// ============================================================
// scoreboard
// ============================================================

describe('symbols/scoreboard', () => {
    it('objectives add 是定义', () => {
        const [d] = of('scoreboard objectives add kills dummy', 'scoreboard');
        assert.strictEqual(d.role, 'definition');
        assert.strictEqual(d.value, 'kills');
    });

    it('players set 的目标是引用', () => {
        const hits = of('scoreboard players set @s kills 1', 'scoreboard');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].role, 'reference');
        assert.strictEqual(hits[0].value, 'kills');
    });

    it('players operation 抽出两个目标', () => {
        // wiki 原文：players operation <targetName> <targetObjective> <operation> <selector> <objective>
        //         objective 在下标 4 与 7，玩家名在下标 3 与 6
        const line = 'scoreboard players operation @s kills += @s src';
        const hits = of(line, 'scoreboard');
        assert.deepStrictEqual(hits.map(h => h.value).sort(), ['kills', 'src']);
        assert.ok(hits.every(h => line.slice(h.start, h.end) === h.value));
        assert.ok(!hits.some(h => h.value.startsWith('@')), '玩家名 @s 不能当成记分板目标');
    });

    it('players operation 的假玩家目标也被记录', () => {
        const line = 'scoreboard players operation #fp kills += Steve src';
        const fps = of(line, 'fake_player');
        assert.deepStrictEqual(fps.map(h => h.value).sort(), ['Steve', 'fp']);
    });

    it('objectives setdisplay 抽出 slot 后的目标，而不是 slot', () => {
        const hits = of('scoreboard objectives setdisplay sidebar kills', 'scoreboard');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].value, 'kills');
    });

    it('trigger 抽出目标', () => {
        const hits = of('trigger kills', 'scoreboard');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].value, 'kills');
    });

    it('players list 不产出任何符号', () => {
        assert.deepStrictEqual(of('scoreboard players list', 'scoreboard'), []);
    });

    it('add 的第一个参数（玩家目标）不是记分板符号', () => {
        // scoreboard players add Steve kills 1 —— kills 在第 4 位
        const line = 'scoreboard players add Steve kills 1';
        const hits = of(line, 'scoreboard');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].value, 'kills');
    });
});

// ============================================================
// 假玩家
// ============================================================

describe('symbols/假玩家', () => {
    it('#fp 被识别为假玩家 fp，且记录 # 位置', () => {
        const line = 'scoreboard players set #fp kills 1';
        const [f] = of(line, 'fake_player');
        assert.strictEqual(f.value, 'fp');
        assert.strictEqual(line.slice(f.start, f.end), 'fp', 'value 应排除 #');
        assert.strictEqual(line[f.hashStart], '#', 'hashStart 应指向 #');
        assert.strictEqual(f.hashStart, f.start - 1);
    });

    it('选择器目标不是假玩家', () => {
        assert.deepStrictEqual(of('scoreboard players set @s kills 1', 'fake_player'), []);
    });

    it('无 # 的普通玩家名也被当作假玩家（1.12.2 语义）', () => {
        const line = 'scoreboard players set Steve kills 1';
        const [f] = of(line, 'fake_player');
        assert.strictEqual(f.value, 'Steve');
        assert.strictEqual(f.hashStart, line.indexOf('Steve'));
    });
});

// ============================================================
// 标签
// ============================================================

describe('symbols/标签', () => {
    it('players tag add 是定义', () => {
        const hits = of('scoreboard players tag @s add marked', 'tag');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].role, 'definition');
        assert.strictEqual(hits[0].value, 'marked');
    });

    it('选择器 tag= 是引用', () => {
        const line = 'kill @e[tag=marked]';
        const [h] = of(line, 'tag');
        assert.strictEqual(h.kind, 'tag');
        assert.strictEqual(h.value, 'marked');
        assert.strictEqual(line.slice(h.start, h.end), 'marked');
    });

    it('**say 里的同名文本不是标签**（角色隔离的关键用例）', () => {
        assert.deepStrictEqual(extractSymbols('say marked'), []);
        assert.deepStrictEqual(extractSymbols('say hello marked world'), []);
    });

    it('summon 的 Tags:[] 抽出标签定义', () => {
        const line = 'summon zombie ~ ~ ~ {Tags:["boss","elite"]}';
        const hits = of(line, 'tag');
        assert.strictEqual(hits.length, 2);
        assert.deepStrictEqual(hits.map(h => h.value).sort(), ['boss', 'elite']);
        for (const h of hits) {
            assert.strictEqual(line.slice(h.start, h.end), h.value, '区间应精确到标签名（不含引号）');
        }
    });
});

// ============================================================
// 队伍
// ============================================================

describe('symbols/队伍', () => {
    it('teams add 是定义', () => {
        const [d] = of('scoreboard teams add blue', 'team');
        assert.strictEqual(d.role, 'definition');
        assert.strictEqual(d.value, 'blue');
    });

    it('teams join 是引用', () => {
        const [r] = of('scoreboard teams join blue @a', 'team');
        assert.strictEqual(r.role, 'reference');
        assert.strictEqual(r.value, 'blue');
    });

    it('teams leave 不产出队伍名（参数是玩家）', () => {
        assert.deepStrictEqual(of('scoreboard teams leave @a', 'team'), []);
    });

    it('选择器 team= 是引用', () => {
        const line = 'kill @e[team=blue]';
        const [h] = of(line, 'team');
        assert.strictEqual(line.slice(h.start, h.end), 'blue');
    });
});

// ============================================================
// function / advancement
// ============================================================

describe('symbols/function', () => {
    it('function 抽出资源名', () => {
        const [f] = of('function ns:sub/task', 'function');
        assert.strictEqual(f.value, 'ns:sub/task');
    });

    it('gamerule gameLoopFunction 抽出函数名', () => {
        const hits = extractSymbols('gamerule gameLoopFunction ns:loop');
        assert.strictEqual(hits.filter(h => h.kind === 'function').length, 1);
    });

    it('advancement grant 抽出进度名', () => {
        const hits = of('advancement grant @s only ns:adv/one', 'advancement');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].value, 'ns:adv/one');
    });
});

// ============================================================
// 选择器
// ============================================================

describe('symbols/选择器谓词', () => {
    it('score_X 抽出目标名，且区间指向 key 中的名字而非 value', () => {
        const line = 'kill @e[score_points=10]';
        const [s] = of(line, 'scoreboard');
        assert.strictEqual(s.value, 'points');
        // 关键：重命名必须改 key 里的目标名，改 value 会把 10 换掉、毁掉选择器
        assert.strictEqual(line.slice(s.start, s.end), 'points');
    });

    it('score_X_min 同样抽出目标名，区间也在 key 上', () => {
        const line = 'kill @e[score_points_min=30]';
        const [s] = of(line, 'scoreboard');
        assert.strictEqual(s.value, 'points');
        assert.strictEqual(line.slice(s.start, s.end), 'points');
    });

    it('1.13 的 scores={...} 语法不被误认（1.12.2 不存在）', () => {
        // scores 不是 1.12.2 语法；这里确认不会产出错乱的符号
        const hits = extractSymbols('kill @e[scores={a=1}]');
        assert.strictEqual(hits.filter(h => h.kind === 'scoreboard').length, 0);
    });

    it('多个谓词时位置各自精确', () => {
        const line = 'kill @a[tag=t1,score_s1=5,team=tm1]';
        const t = of(line, 'tag')[0];
        const s = of(line, 'scoreboard')[0];
        const tm = of(line, 'team')[0];
        assert.strictEqual(line.slice(t.start, t.end), 't1');
        assert.strictEqual(line.slice(s.start, s.end), 's1', 'score_ 谓词应指向 key 中的目标名');
        assert.strictEqual(line.slice(tm.start, tm.end), 'tm1');
    });
});

// ============================================================
// resolver
// ============================================================

describe('symbols/SymbolResolver', () => {
    const file = 'file:///pack/data/functions/ns/a.mcfunction';
    const lines = new Map<string, string>([
        [`${file}:0`, 'scoreboard objectives add kills dummy'],
        [`${file}:1`, 'scoreboard players set @s kills 1'],
        [`${file}:2`, 'say kills is nice'],
        [`${file}:3`, 'kill @a[score_kills=5]'],
    ]);

    const index = {
        getLocations: (type: string, value: string) =>
            [...lines.keys()]
                .filter(k => k.startsWith(`${file}:`))
                .map(k => ({ file, line: Number(k.slice(file.length + 1)) })),
        indexedFiles: () => [file],
    };

    function makeResolver(): SymbolResolver {
        return new SymbolResolver({
            index,
            readLine: (f, l) => lines.get(`${f}:${l}`),
        });
    }

    it('resolve 只返回真正引用该符号的行', () => {
        const locs = makeResolver().resolve('scoreboard', 'kills');
        const at = locs.map(l => l.line).sort((a, b) => a - b);
        // 第 2 行 "say kills is nice" 不产出 scoreboard 符号，必须排除
        assert.deepStrictEqual(at, [0, 1, 3]);
    });

    it('resolve 的区间在原行中确实匹配', () => {
        for (const l of makeResolver().resolve('scoreboard', 'kills')) {
            const text = lines.get(`${file}:${l.line}`)!;
            assert.ok(l.start >= 0 && l.end <= text.length, `第 ${l.line} 行区间越界`);
            // 第 3 行是选择器里的 score_kills=5 —— 区间必须指向 key 中的 kills，
            // 而不是值 5；其余行则应指向 kills 本身。
            if (l.line === 3) {
                assert.strictEqual(text.slice(l.start, l.end), 'kills', '选择器引用应指向 key');
            } else {
                assert.strictEqual(text.slice(l.start, l.end), 'kills');
            }
        }
    });

    it('按角色过滤只返回引用', () => {
        const locs = makeResolver().resolve('scoreboard', 'kills', ['reference']);
        assert.ok(locs.every(l => l.role === 'reference'));
        assert.ok(locs.every(l => l.line !== 0), '定义行不应出现在只查引用里');
    });

    it('按角色过滤只返回定义', () => {
        const locs = makeResolver().resolve('scoreboard', 'kills', ['definition']);
        assert.strictEqual(locs.length, 1);
        assert.strictEqual(locs[0].line, 0);
    });

    it('symbolAt 命中 token 内部与两端', () => {
        const r = makeResolver();
        const line = 'scoreboard objectives add kills dummy';
        const start = line.indexOf('kills');
        const end = start + 'kills'.length;
        assert.ok(r.symbolAt('scoreboard', file, 0, start), '起点应命中');
        assert.ok(r.symbolAt('scoreboard', file, 0, end), '终点应命中');
        assert.ok(r.symbolAt('scoreboard', file, 0, start + 2), '内部应命中');
        assert.strictEqual(r.symbolAt('scoreboard', file, 0, 10), null, '空白处不命中');
        assert.strictEqual(r.symbolAt('scoreboard', file, 0, end + 1), null, '超出末端不应命中');
    });

    it('索引无该值时返回空', () => {
        assert.deepStrictEqual(makeResolver().resolve('scoreboard', 'nonexistent'), []);
    });

    it('行文本缺失时跳过而非崩溃', () => {
        const r = new SymbolResolver({
            index: { getLocations: () => [{ file, line: 999 }], indexedFiles: () => [file] },
            readLine: () => undefined,
        });
        assert.deepStrictEqual(r.resolve('scoreboard', 'kills'), []);
    });
});

/**
 * 回归：scoreboard / team 必须进入 LineIndex。
 *
 * 早先只有 tag / fake_player / function 写了 LineIndex，
 * 于是 `getLocations()` 查不到记分板与队伍 —— 后果是
 * Ctrl+Click 跳转、查找引用、重命名对这两类符号**全部静默失效**。
 */
describe('symbols/LineIndex 覆盖完整性', () => {
    function makeStore(uri: vscode.Uri) {
        return new IndexedStore();
    }

    it('记分板目标定义与引用都能被 getLocations 查到', () => {
        const store = makeStore(vscode.Uri.file('D:/p/data/functions/ns/a.mcfunction'));
        const uri = vscode.Uri.file('D:/p/data/functions/ns/a.mcfunction');
        store.addScoreboard('ns:a', 'kills', 0, uri, 'dummy');
        const locs = store.getLineIndex().getLocations('scoreboard', 'kills');
        assert.strictEqual(locs.length, 1, '记分板定义应进入 LineIndex');
        assert.strictEqual(locs[0].line, 0);
    });

    it('队伍能被 getLocations 查到', () => {
        const uri = vscode.Uri.file('D:/p/data/functions/ns/a.mcfunction');
        const store = new IndexedStore();
        store.addTeam('ns:a', 'blue', 1, uri);
        const locs = store.getLineIndex().getLocations('team', 'blue');
        assert.strictEqual(locs.length, 1);
        assert.strictEqual(locs[0].line, 1);
    });

    it('清除文件后 LineIndex 同步清空（不残留幽灵引用）', () => {
        const uri = vscode.Uri.file('D:/p/data/functions/ns/a.mcfunction');
        const store = new IndexedStore();
        store.addScoreboard('ns:a', 'kills', 0, uri, 'dummy');
        store.addTeam('ns:a', 'blue', 1, uri);
        assert.strictEqual(store.getLineIndex().getLocations('scoreboard', 'kills').length, 1);

        store.clearFile('ns:a', uri);
        assert.strictEqual(
            store.getLineIndex().getLocations('scoreboard', 'kills').length, 0,
            '删文件后仍能查到引用 = 幽灵索引',
        );
        assert.strictEqual(store.getLineIndex().getLocations('team', 'blue').length, 0);
    });

    it('磁盘缓存往返后 getLocations 依然有效', () => {
        const uri = vscode.Uri.file('D:/p/data/functions/ns/a.mcfunction');
        const store = new IndexedStore();
        store.addScoreboard('ns:a', 'kills', 0, uri, 'dummy');
        const dumped = store.exportState();

        const restored = new IndexedStore();
        restored.importState(dumped);
        const locs = restored.getLineIndex().getLocations('scoreboard', 'kills');
        assert.strictEqual(locs.length, 1, '缓存恢复后应仍能查到');
    });
});

// ============================================================
// 重命名合法性
// ============================================================

describe('symbols/重命名合法性', () => {
    it('接受普通名字', () => {
        assert.strictEqual(isValidName('kills'), true);
        assert.strictEqual(isValidName('my_score'), true);
        assert.strictEqual(isValidName('中文名'), true);
    });

    it('拒绝超长名（1.12.2 上限 16）', () => {
        assert.strictEqual(isValidName('a'.repeat(16)), true);
        assert.strictEqual(isValidName('a'.repeat(17)), false);
    });

    it('拒绝含空白与命令分隔符的名字', () => {
        assert.strictEqual(isValidName('my score'), false);
        assert.strictEqual(isValidName('a,b'), false);
        assert.strictEqual(isValidName('a:b'), false);
        assert.strictEqual(isValidName('a=b'), false);
        assert.strictEqual(isValidName('a@b'), false);
        assert.strictEqual(isValidName('a#b'), false);
    });

    it('拒绝空名', () => {
        assert.strictEqual(isValidName(''), false);
    });
});

// ============================================================
// 回归：真实数据包里常见的一行
// ============================================================

describe('symbols/综合用例', () => {
    it('一行里多种符号互不串味', () => {
        const line = 'scoreboard players set #fp kills 1';
        assert.deepStrictEqual(
            extractSymbols(line).map(o => `${o.kind}:${o.value}:${o.role}`).sort(),
            ['fake_player:fp:reference', 'scoreboard:kills:reference'],
        );
    });

    it('say 行永远不会产出可重命名符号', () => {
        for (const line of ['say foo', 'say foo bar', 'say score_x=1', 'say @a[tag=x]']) {
            assert.deepStrictEqual(extractSymbols(line), [], `误产出符号：${line}`);
        }
    });
});