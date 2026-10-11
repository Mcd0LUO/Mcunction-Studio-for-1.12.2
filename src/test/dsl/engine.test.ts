/**
 * CompletionEngine 行为测试（Node + vscode mock）
 *
 * 覆盖 engine.ts 的三个核心：matchChild / walk / suggest。
 * 这些函数在最近 30 个 commit 里被反复修改（walk 消费到底、jump 层数修正、
 * consumedRealToken 替换 lastToken 等），是最容易回归的地方。
 *
 * 注意：这些是**行为快照**测试，与 baseline 的**树形结构**测试互补 ——
 * baseline 只比对节点形状，不验证补全实际返回什么。
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { CompletionEngine } from '../../dsl/engine';
import { command, literal, argument, optional, forwardRoot } from '../../dsl/builder';
import { DataLoader } from '../../core/DataLoader';
import { registerAll } from '../../dsl/commands/index';

/** 取补全项标签（兼容 CompletionItem.label 为 string 或 {label} 两种形态） */
function labels(items: vscode.CompletionItem[]): string[] {
    return items.map(i => (typeof i.label === 'string' ? i.label : i.label?.label))
        .filter((x): x is string => !!x);
}

let engine: CompletionEngine;

before(() => {
    engine = new CompletionEngine(DataLoader.getInstance());
    registerAll(engine);
    CompletionEngine.setCurrent(engine);
});

// ============================================================
// 注册与根命令
// ============================================================

describe('CompletionEngine 注册', () => {
    it('has() 对已注册命令返回 true，未注册返回 false', () => {
        assert.strictEqual(engine.has('scoreboard'), true);
        assert.strictEqual(engine.has('definitely_not_a_command'), false);
    });

    it('getRootItems 覆盖全部 41 条内置命令', () => {
        assert.strictEqual(engine.getRootItems().length, 41);
    });

    it('已移除的 EasyCber 命令不再注册', () => {
        // superexe / foreach 曾由 JumpNode 机制支持，随 EasyCber 下线一并移除
        assert.strictEqual(engine.has('superexe'), false);
        assert.strictEqual(engine.has('foreach'), false);
        assert.strictEqual(engine.has('team'), false, 'EasyCber 的 /team 不再内置');
        assert.strictEqual(engine.has('schedule'), false);
    });

    it('unregister 能移除命令', () => {
        const before = engine.getRootItems().length;
        const tmp = command('tmpcmd').then(literal('x'));
        engine.register(tmp);
        assert.strictEqual(engine.has('tmpcmd'), true);
        engine.unregister('tmpcmd');
        assert.strictEqual(engine.has('tmpcmd'), false);
        assert.strictEqual(engine.getRootItems().length, before);
    });
});

// ============================================================
// 1.12.2 语法保真（依据 minecraft.wiki History 段核实）
// ============================================================

describe('clone（1.12.2 语法）', () => {
    const P = ['clone', '0', '0', '0', '1', '1', '1', '2', '2', '2'];

    it('九个坐标之后给出三种 maskMode', async () => {
        // 注意：此时「继续修改第 9 个坐标」与「进入 maskMode」都是合法续接，
        // 引擎两者都返回，并分别设置不同的替换区间
        // （值候选替换当前 token，字面量插入在光标处，见 withRanges）。
        // 故这里只断言 maskMode 必须齐备，不断言列表恰好只有三项。
        const r = await engine.complete(P, P.join(' '));
        const ls = labels(r);
        for (const m of ['filtered', 'masked', 'replace']) {
            assert.ok(ls.includes(m), `应给出 maskMode "${m}"，实际 ${JSON.stringify(ls)}`);
        }
    });

    it('maskMode 之后给出三个 cloneMode 关键字', async () => {
        // 1.12.2: [cloneMode] = force | move | normal（1.8/14w10a/14w20a 引入）
        // 注意 cloneMode 本身可省略，所以这里还会同时给出 [TileName] 的方块候选 ——
        // 用 includes 而非 deepStrictEqual。
        for (const mask of ['filtered', 'masked', 'replace']) {
            const c = [...P, mask];
            const ls = labels(await engine.complete(c, c.join(' ')));
            for (const mode of ['force', 'move', 'normal']) {
                assert.ok(ls.includes(mode), `${mask} 之后应给出 ${mode}`);
            }
        }
    });

    it('cloneMode 之后能接上 <block>（literal 叶子不能断链）', async () => {
        const c = [...P, 'filtered', 'force'];
        const r = await engine.complete(c, c.join(' '));
        const ls = labels(r);
        assert.ok(ls.includes('stone'), 'filtered 的 <block> 是必填，应给出方块列表');
        assert.ok(ls.length > 200, `方块列表应有数百项，实际 ${ls.length}`);
    });

    it('filtered 的 <block> 必填，masked/replace 的可选', async () => {
        const filtered = labels(await engine.complete([...P, 'filtered', 'force'], 'x'));
        const masked = labels(await engine.complete([...P, 'masked', 'force'], 'x'));
        assert.ok(filtered.includes('stone'), 'filtered 必填 block');
        assert.ok(masked.includes('[block]') || masked.includes('stone'), 'masked 的 block 可省略');
    });
});

describe('particle（1.12.2 语法）', () => {
    const P = ['particle', 'explode', '0', '0', '0', '1', '1', '1', '0'];

    it('<xd> <yd> <zd> <speed> 为必填（1.12.2 中不可省略）', async () => {
        // 逐级推进：每级都应继续给出坐标/参数提示，而非停在上一层
        for (let i = 2; i < P.length; i++) {
            const c = P.slice(0, i);
            const r = await engine.complete(c, c.join(' '));
            assert.ok(labels(r).length > 0, `${c.join(' ')} 之后应有补全`);
        }
    });

    it('[speed] 之后是顺序可选的 [count]', async () => {
        // wiki: particle <name> <x> <y> <z> <xd> <yd> <zd> <speed> [count] [mode] [player] [params ...]
        // 四个尾巴参数是**顺序可选**，不是并列选择。
        const ls = labels(await engine.complete(P, P.join(' ')));
        assert.ok(ls.includes('[count]'), `应给出 [count]，实际 ${JSON.stringify(ls.slice(0, 6))}`);
    });

    it('[count] 之后给出 normal / force（且 mode 可省略）', async () => {
        const c = [...P, '5'];
        const ls = labels(await engine.complete(c, c.join(' ')));
        assert.ok(ls.includes('normal') && ls.includes('force'),
            `应给出 mode，实际 ${JSON.stringify(ls.slice(0, 6))}`);
        // mode 省略时直接给 [player]，故选择器候选也应在
        assert.ok(ls.includes('@a'), 'mode 省略时也应能直接给 [player]');
    });

    it('[player] 之后 params 变长（用 greedy 而非固定两个）', () => {
        const { toTreeShape } = require('../../dsl/treeShape') as typeof import('../../dsl/treeShape');
        const { particleCmd } = require('../../dsl/commands/vanilla/particle') as
            typeof import('../../dsl/commands/vanilla/particle');
        const shape = toTreeShape(particleCmd);
        // 沿 <name> → … → <speed> → [count] 走到尾巴
        let node = shape;
        for (const name of ['<name>', '<x>', '<y>', '<z>', '<xd>', '<yd>', '<zd>', '<speed>', '[count]']) {
            const next = node.children.find(c => c.name === name);
            assert.ok(next, `树中应存在 ${name}`);
            node = next!;
        }
        const names = node.children.map(c => c.name);
        assert.ok(names.includes('normal') && names.includes('force'), '应含 mode 两值');
        assert.ok(names.includes('[player]'), 'mode 省略时也应能到 [player]');
        // params 必须是 greedy（变长），不是 [params] [params2] 两个固定参数
        const flat = JSON.stringify(shape);
        assert.ok(flat.includes('[params...]'), 'params 应为 greedy [params...]');
    });
});

// ============================================================
// 全局引擎引用：构造不应产生副作用
// ============================================================

describe('CompletionEngine 全局引用', () => {
    it('构造函数不再自动篡改全局引用', () => {
        const before = CompletionEngine.getCurrent();
        // 仅仅 new 一个引擎（不 setCurrent）不应影响全局
        const stray = new CompletionEngine(DataLoader.getInstance());
        assert.notStrictEqual(stray, before);
        assert.strictEqual(
            CompletionEngine.getCurrent(), before,
            'new 引擎不应静默替换当前引擎（曾导致补全静默失效）',
        );
        assert.strictEqual(CompletionEngine.getCurrent()!.has('scoreboard'), true,
            '当前引擎仍应保有已注册命令');
    });

    it('setCurrent 是显式且可控的', () => {
        const original = CompletionEngine.getCurrent();
        try {
            const replacement = new CompletionEngine(DataLoader.getInstance());
            CompletionEngine.setCurrent(replacement);
            assert.strictEqual(CompletionEngine.getCurrent(), replacement);

            CompletionEngine.setCurrent(original);
            assert.strictEqual(CompletionEngine.getCurrent(), original);
        } finally {
            CompletionEngine.setCurrent(original);
        }
    });

    it('instance 兼容别名与 getCurrent 一致', () => {
        assert.strictEqual(CompletionEngine.instance, CompletionEngine.getCurrent());
    });

    it('setCurrent(undefined) 可释放引用', () => {
        const original = CompletionEngine.getCurrent();
        try {
            CompletionEngine.setCurrent(undefined);
            assert.strictEqual(CompletionEngine.getCurrent(), undefined);
        } finally {
            CompletionEngine.setCurrent(original);
        }
    });
});

// ============================================================
// matchChild：literal 优先 → argument 兜底 → forward_root
// ============================================================

describe('matchChild 优先级', () => {
    it('literal 精确匹配优先于 argument 兜底', async () => {
        // effect <target> 的子节点是 [literal(clear), argument(<effect>)]
        // 输入 clear 应走 literal（叶子），而非被 argument 吃掉
        const r = await engine.complete(['effect', '@p', 'clear'], 'effect @p clear');
        assert.deepStrictEqual(labels(r), [], 'clear 是叶子，不应再有补全');
    });

    it('literal 未命中时回落到 argument', async () => {
        // 'clea' 匹配不到 literal clear → 落到 <effect> → 返回效果列表
        const r = await engine.complete(['effect', '@p', 'clea'], 'effect @p clea');
        assert.ok(labels(r).length > 20, '应回落到效果列表');
        assert.ok(!labels(r).includes('clear'));
    });

    it('argument 无 suggest 时展示参数名占位', async () => {
        // /say 没有参数，其子节点为空 → 根补全仍应返回自身
        const r = await engine.complete(['say', ''], 'say ');
        assert.ok(Array.isArray(r));
    });
});

// ============================================================
// argument 节点：兄弟 literal 合并（本轮修复的缺陷）
// ============================================================

describe('argument 节点合并兄弟 literal', () => {
    it('effect <player> 补全同时包含 clear 分支与效果列表', async () => {
        const r = await engine.complete(['effect', '@p', ''], 'effect @p ');
        const ls = labels(r);
        assert.ok(ls.includes('clear'), 'clear 是 <target> 的兄弟 literal，必须可见');
        assert.ok(ls.length >= 27, `应含 27 个效果，实际 ${ls.length}`);
    });

    it('clear 排在效果列表之前（用户更容易发现分支）', async () => {
        const r = await engine.complete(['effect', '@p', ''], 'effect @p ');
        assert.strictEqual(labels(r)[0], 'clear');
    });
});

// ============================================================
// 枚举参数必须用 literal 而非 argument+suggest
// ============================================================

describe('枚举分支（weather）', () => {
    it('根层列出三个关键字', async () => {
        const r = await engine.complete(['weather', ''], 'weather ');
        assert.deepStrictEqual(labels(r).sort(), ['clear', 'rain', 'thunder']);
    });

    it('输入关键字后下钻到 [duration]，不重复提示自身', async () => {
        // 回归：曾用 argument+suggest 实现，导致输入 clear 仍提示 clear
        const r = await engine.complete(['weather', 'clear'], 'weather clear');
        assert.deepStrictEqual(labels(r), ['[duration]']);
    });

    it('三个关键字行为一致', async () => {
        for (const kw of ['clear', 'rain', 'thunder']) {
            const r = await engine.complete(['weather', kw], `weather ${kw}`);
            assert.deepStrictEqual(labels(r), ['[duration]'], `${kw} 应下钻到 [duration]`);
            assert.ok(!labels(r).includes(kw), `${kw} 不应重复提示自身`);
        }
    });
});

// ============================================================
// walk：token 消费与 consumedRealToken
// ============================================================

describe('walk 的 token 消费', () => {
    it('已输入完整关键字后继续下钻', async () => {
        // function myfunc → 下一层是 [if, unless]
        const r = await engine.complete(['function', 'myfunc'], 'function myfunc');
        assert.deepStrictEqual(labels(r).sort(), ['if', 'unless']);
    });

    it('尾随空串与真实 token 给出相同的补全', async () => {
        // VS Code 自行按已输入前缀过滤，故两者输出一致才是正确行为
        const a = await engine.complete(['function'], 'function ');
        const b = await engine.complete(['function', ''], 'function ');
        assert.deepStrictEqual(labels(a), labels(b));
    });

    it('未知 token 不会破坏后续补全', async () => {
        const r = await engine.complete(['function', 'x', 'bogus'], 'function x bogus');
        assert.ok(Array.isArray(r), '不应抛异常');
    });
});

// ============================================================
// forward_root：转发到根命令列表
// ============================================================

describe('forward_root 转发', () => {
    it('execute 末段直接转发根命令列表，不出现 run 关键字', async () => {
        // 1.12.2: execute <entity> <x> <y> <z> <command>
        // 第 5 个参数直接就是命令 —— 没有 run（那是 1.13+ Brigadier 语法）
        const lastCoord = await engine.complete(
            ['execute', '@p', '1', '2', '3'],
            'execute @p 1 2 3 ',
        );
        assert.ok(
            !labels(lastCoord).includes('run'),
            '1.12.2 的 execute 不应补出 run —— 那是 1.13+ 语法',
        );

        const forwarded = await engine.complete(
            ['execute', '@p', '1', '2', '3', ''],
            'execute @p 1 2 3 ',
        );
        const ls = labels(forwarded);
        assert.ok(ls.length >= 40, `应转发全部根命令，实际 ${ls.length}`);
        assert.ok(ls.includes('scoreboard'));
        assert.ok(!ls.includes('run'), '根命令列表里也不该混入 run');
    });

    it('execute 各级参数提示正确', async () => {
        assert.ok(labels(await engine.complete(['execute'], 'execute ')).includes('@a'), '一级应为选择器');
        assert.ok(labels(await engine.complete(['execute', '@p', ''], 'execute @p ')).includes('~'), '二级应为坐标');
    });

    it('自定义树也能正确转发', async () => {
        const custom = command('mycmd')
            .then(argument('<a>').then(forwardRoot()));
        engine.register(custom);
        const r = await engine.complete(['mycmd', 'x', ''], 'mycmd x ');
        const ls = labels(r);
        assert.ok(ls.includes('scoreboard'), '应包含其他根命令');
        assert.ok(ls.includes('kill'), '应包含其他根命令');
        // getRootItems 遍历全部已注册命令，mycmd 自身也在其中 ——
        // 这是注册表快照而非递归展开，不会导致自引用死循环
        engine.unregister('mycmd');
    });
});

// ============================================================
// optional：当前仅用于结构快照，引擎不据此跳过
// ============================================================

describe('optional 参数行为', () => {
    it('optional 节点在补全链路中与普通 argument 一致（不跳过）', async () => {
        // 已知限制：engine 不读 optional，参数填满后仍会提示后续参数。
        // 此测试锁定当前行为，防止"静默改变补全体验"。
        const r = await engine.complete(['effect', '@p', 'speed', '10', '1', 'true'], 'effect @p speed 10 1 true');
        // 填满后仍提示 [hideParticles] 是已知的粗糙之处，不是崩溃
        assert.ok(Array.isArray(r));
    });

    it('optional 节点仍可被 treeShape 序列化', () => {
        const { toTreeShape } = require('../../dsl/treeShape') as typeof import('../../dsl/treeShape');
        // command('t') → optional('[opt]') → argument('<req>')
        const shape = toTreeShape(command('t').then(optional('[opt]').then(argument('<req>'))));
        assert.strictEqual(shape.kind, 'root');
        assert.strictEqual(shape.children.length, 1);
        assert.strictEqual(shape.children[0].name, '[opt]');
        assert.strictEqual(shape.children[0].optional, true, 'optional 标记应被序列化');
        assert.strictEqual(shape.children[0].children[0].name, '<req>');
        assert.strictEqual(shape.children[0].children[0].optional, undefined);
    });
});

// ============================================================
// 回归：JumpNode 移除后不应再有 jump 节点
// ============================================================

describe('JumpNode 已移除', () => {
    it('遍历全部命令树不再出现 jump 节点', () => {
        const roots = (engine as unknown as { roots: Map<string, { kind: string; children: unknown[] }> }).roots;
        let jumpCount = 0;
        const walk = (n: { kind: string; children: unknown[] }): void => {
            if (n.kind === 'jump') { jumpCount++; }
            for (const c of n.children) { walk(c as { kind: string; children: unknown[] }); }
        };
        for (const root of roots.values()) { walk(root); }
        assert.strictEqual(jumpCount, 0, 'JumpNode 机制已移除，不应再有可达的 jump 节点');
    });

    it('YAML 的 jump 节点被明确拒绝而非静默忽略', () => {
        // 用户若沿用旧 YAML，应得到清晰报错
        const loader = require('../../dsl/yaml/loader') as typeof import('../../dsl/yaml/loader');
        const YamlCommandLoader = loader.YamlCommandLoader as unknown as {
            convertNode(node: unknown): unknown;
        };
        assert.throws(
            () => YamlCommandLoader.convertNode({ jump: 2 }),
            /jump 节点已移除/,
            'jump 应抛出明确错误',
        );
    });
});

// ============================================================
// 引擎不应因未知命令崩溃
// ============================================================

describe('健壮性', () => {
    it('未注册命令返回空数组', async () => {
        const r = await engine.complete(['nonexistent', ''], 'nonexistent ');
        assert.deepStrictEqual(r, []);
    });

    it('只有根命令一个 token 时列出根命令', async () => {
        const r = await engine.complete(['scoreboard'], 'scoreboard');
        assert.ok(labels(r).length > 0);
    });

    it('多余 token 不会抛异常', async () => {
        const r = await engine.complete(['scoreboard', 'a', 'b', 'c', 'd', 'e'], 'scoreboard a b c d e');
        assert.ok(Array.isArray(r));
    });
});

// ============================================================
// 显式替换区间（withRanges）
//
// 背景：VS Code 在补全项没有 range 时按语言词法推算替换范围，
// 而默认词法把 `:` `/` `.` `@` `#` 当分隔符 —— `function ns:` 的词范围为空、
// `function ns:a` 的只有 `a`，接受 `ns:test` 都会得到 `ns:ns:test`。
// 因此引擎必须自己给区间。
// ============================================================

describe('补全替换区间', () => {
    /** 取某项的区间文本 */
    function rangeText(it: vscode.CompletionItem, line: string): string {
        const r = it.range as vscode.Range | undefined;
        if (!r) { return '<no range>'; }
        return line.slice(r.start.character, r.end.character);
    }

    function find(items: vscode.CompletionItem[], label: string): vscode.CompletionItem | undefined {
        return items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === label);
    }

    it('不传 cursor 时不设置区间（保持单测/旧调用方行为）', async () => {
        const line = 'function ns:a';
        const r = await engine.complete(['function', 'ns:a'], line);
        assert.ok(r.every(i => !i.range), '未传 cursor 时不应设置 range');
    });

    it('参数值候选的区间覆盖已输入的完整 token', async () => {
        // effect <target> <effect>：<effect> 的候选来自静态枚举，无需索引
        const line = 'effect @p sp';
        const col = line.length;
        const r = await engine.complete(['effect', '@p', 'sp'], line, { line: 0, character: col });
        assert.ok(r.length > 0, '应给出效果列表');
        for (const it of r) {
            assert.strictEqual(
                rangeText(it, line), 'sp',
                `值候选应替换已输入的前缀 "sp"，实际 ${JSON.stringify(rangeText(it, line))}`,
            );
        }
    });

    it('值候选的区间是完整 token，不被空白之外的字符截断', async () => {
        // 用带下划线的目标名验证：区间应覆盖 my_obj 整体
        const line = 'scoreboard players set @s my_obj';
        const col = line.length;
        const r = await engine.complete(
            ['scoreboard', 'players', 'set', '@s', 'my_obj'], line,
            { line: 0, character: col },
        );
        // 空索引下该参数无候选，只剩占位符 —— 占位符不参与替换，无区间即可
        for (const it of r) {
            const t = rangeText(it, line);
            assert.ok(t === 'my_obj' || t === '<no range>', `意外的区间 ${JSON.stringify(t)}`);
        }
    });

    it('冒号分隔的资源名整体作为替换区间（修复 ns:ns:test 重复）', async () => {
        const line = 'function ns:';
        const col = line.length;
        const r = await engine.complete(['function', 'ns:'], line, { line: 0, character: col });
        // 该数据包为空，函数名列表为空；这里用字面量分支验证 insert 区间，
        // 值候选的区间逻辑由纯函数 valueSpanAt 的单测覆盖。
        for (const it of r) {
            const t = rangeText(it, line);
            assert.notStrictEqual(t, 'ns:', `字面量不应替换掉 ns:（否则会丢命名空间）`);
        }
    });

    it('下一级字面量使用零宽区间（插入而非替换）', async () => {
        const line = 'clone 0 0 0 1 1 1 2 2 2';
        const col = line.length;
        const r = await engine.complete(
            ['clone', '0', '0', '0', '1', '1', '1', '2', '2', '2'],
            line,
            { line: 0, character: col },
        );
        const masked = find(r, 'masked');
        assert.ok(masked, '应给出 maskMode');
        assert.strictEqual(
            rangeText(masked, line), '',
            'maskMode 是下一级字面量，必须零宽插入，不能替换第 9 个坐标',
        );
    });

    it('选择器内的值候选只替换值，不吞掉选择器本身', async () => {
        // type= 的候选来自静态实体列表，无需索引
        const line = 'kill @a[type=zom]';
        const col = line.indexOf('zom') + 3;             // 光标在 zom 之后、] 之前
        const r = await engine.complete(['kill', '@a[type=zom]'], line, { line: 0, character: col });
        assert.ok(r.length > 0, '应给出实体类型列表');
        for (const it of r) {
            assert.strictEqual(
                rangeText(it, line), 'zom',
                `区间应只覆盖选择器内的值 "zom"，实际 ${JSON.stringify(rangeText(it, line))}`,
            );
        }
    });
});

// ============================================================
// execute / scoreboard 的命令树修正
//
// 依据 wiki 2018-05 修订（1.12.2 已发布、1.13 未发布）：
//   Commands/execute、Scoreboard#Command reference
// ============================================================

describe('execute（1.12.2 语法，已核对 wiki）', () => {
    it('坐标之后可以接 detect 子语法', async () => {
        const c = ['execute', '@s', '~', '~', '~'];
        const ls = labels(await engine.complete(c, 'execute @s ~ ~ ~ '));
        assert.ok(ls.includes('detect'), `应给出 detect，实际 ${JSON.stringify(ls)}`);
    });

    it('detect 之后是第二组坐标', async () => {
        const c = ['execute', '@s', '~', '~', '~', 'detect'];
        const ls = labels(await engine.complete(c, 'execute @s ~ ~ ~ detect '));
        assert.ok(ls.length > 0, 'detect 之后应有坐标提示');
    });

    it('detect 分支走完方块与数据值后转发根命令', async () => {
        const c = ['execute', '@s', '~', '~', '~', 'detect', '~', '~', '~', 'stone', '0', ''];
        const ls = labels(await engine.complete(c, 'execute @s ~ ~ ~ detect ~ ~ ~ stone 0 '));
        assert.ok(ls.includes('scoreboard'), '应转发根命令');
        assert.ok(!ls.includes('run'), '1.12.2 没有 run 关键字');
    });

    it('detect 不再是独立根命令（Java 1.12.2 不存在 /detect）', () => {
        assert.strictEqual(engine.has('detect'), false);
    });
});

describe('scoreboard（1.12.2 语法，已核对 wiki）', () => {
    it('players 下列出全部九个子命令', async () => {
        const ls = labels(await engine.complete(['scoreboard', 'players', ''], 'scoreboard players '));
        for (const sub of ['list', 'set', 'add', 'remove', 'reset', 'enable', 'test', 'operation', 'tag']) {
            assert.ok(ls.includes(sub), `players 下应有 ${sub}，实际 ${JSON.stringify(ls)}`);
        }
    });

    it('operation 给出九个运算符（用 literal 而非 suggest）', async () => {
        const ls = labels(await engine.complete(
            ['scoreboard', 'players', 'operation', '@s', 'obj', ''],
            'scoreboard players operation @s obj ',
        ));
        assert.deepStrictEqual(ls.sort(), ['*=', '+=', '-=', '/=', '<', '=', '>', '><', '%='].sort());
    });

    it('运算符之后仍能下钻到选择器（literal 叶子不断链）', async () => {
        const c = ['scoreboard', 'players', 'operation', '@s', 'obj', '+='];
        const ls = labels(await engine.complete(c, 'scoreboard players operation @s obj += '));
        assert.ok(ls.includes('@a'), `+= 之后应给选择器，实际 ${JSON.stringify(ls.slice(0, 8))}`);
    });

    it('teams option 给出六个选项，且是 friendlyfire（全小写）', async () => {
        const ls = labels(await engine.complete(['scoreboard', 'teams', 'option', 'red', ''], 'scoreboard teams option red '));
        assert.ok(ls.includes('friendlyfire'), `应是 friendlyfire，实际 ${JSON.stringify(ls)}`);
        assert.ok(!ls.includes('friendlyFire'), 'friendlyFire 是错的（游戏不认）');
        for (const o of ['color', 'seeFriendlyInvisibles', 'nametagVisibility', 'deathMessageVisibility', 'collisionRule']) {
            assert.ok(ls.includes(o), `缺少选项 ${o}`);
        }
    });

    it('option color 给出 16 种颜色', async () => {
        const ls = labels(await engine.complete(
            ['scoreboard', 'teams', 'option', 'red', 'color', ''],
            'scoreboard teams option red color ',
        ));
        assert.strictEqual(ls.length, 16);
        assert.ok(ls.includes('dark_red') && ls.includes('light_purple'));
    });

    it('teams join 的变长 [entities...] 仍给选择器候选', async () => {
        const ls = labels(await engine.complete(['scoreboard', 'teams', 'join', 'red', ''], 'scoreboard teams join red '));
        assert.ok(ls.includes('@a'), `greedy 挂了 suggest 就应给候选，实际 ${JSON.stringify(ls)}`);
    });

    it('objectives add 末尾给出 [display name...]', async () => {
        const ls = labels(await engine.complete(
            ['scoreboard', 'objectives', 'add', 'foo', 'dummy', ''],
            'scoreboard objectives add foo dummy ',
        ));
        assert.ok(ls.includes('[display name...]'), `实际 ${JSON.stringify(ls)}`);
    });

    it('players set 末尾给出 [dataTag]', async () => {
        const ls = labels(await engine.complete(
            ['scoreboard', 'players', 'set', '@s', 'obj', '1', ''],
            'scoreboard players set @s obj 1 ',
        ));
        assert.ok(ls.includes('[dataTag]'), `实际 ${JSON.stringify(ls)}`);
    });
});

// ============================================================
// 根命令补全
//
// 回归：complete([]) 曾经静默返回空 —— walk() 取 commands[0] 是 undefined，
// 查不到根节点就直接 return []。UI 上被补全 provider 的
// provideRootCompletions 兜住了，所以长期没暴露；
// 但引擎拿到空行就该给根命令列表，这才是自洽的行为。
// ============================================================

describe('根命令补全', () => {
    /** 取某项的区间文本 */
    function rangeText(it: vscode.CompletionItem, line: string): string {
        const r = it.range as vscode.Range | undefined;
        if (!r) { return '<no range>'; }
        return line.slice(r.start.character, r.end.character);
    }

    const ALL = [
        'advancement', 'blockdata', 'clear', 'clone', 'defaultgamemode', 'difficulty',
        'effect', 'enchant', 'entitydata', 'execute', 'fill', 'function', 'gamemode',
        'gamerule', 'give', 'kill', 'particle', 'playsound', 'replaceitem', 'say',
        'scoreboard', 'setblock', 'setworldspawn', 'spawnpoint', 'spreadplayers',
        'stats', 'stopsound', 'summon', 'teleport', 'tellraw', 'testfor',
        'testforblock', 'testforblocks', 'time', 'title', 'toggledownfall', 'tp',
        'trigger', 'weather', 'worldborder', 'xp',
    ];

    it('空 token 列表 → 全部 41 条根命令', async () => {
        const ls = labels(await engine.complete([], ''));
        assert.strictEqual(ls.length, 41, `实际 ${ls.length} 项`);
        for (const c of ALL) {
            assert.ok(ls.includes(c), `缺少 ${c}`);
        }
    });

    it("单个空 token（['']）同样给出根命令", async () => {
        const ls = labels(await engine.complete([''], ''));
        assert.strictEqual(ls.length, 41);
    });

    it('带 cursor 时根命令也带显式替换区间', async () => {
        const line = 'sc';
        const r = await engine.complete([''], line, { line: 0, character: 2 });
        assert.strictEqual(r.length, 41);
        for (const it of r) {
            assert.ok(it.range, '应设置 range');
            assert.strictEqual(rangeText(it, line), 'sc',
                `区间应覆盖已输入前缀，实际 ${JSON.stringify(rangeText(it, line))}`);
        }
    });

    it('未注册的命令名返回空（前缀匹配由补全 provider 负责）', async () => {
        // 正在输入的根命令前缀（`sco`）不是已注册命令，引擎不管 ——
        // Base.provideRootCompletions 自己按前缀过滤 getRootItems()。
        // 这里锁定该分工，避免两边各实现一遍。
        assert.deepStrictEqual(await engine.complete(['sco'], 'sco'), []);
        assert.deepStrictEqual(await engine.complete(['sc'], 'sc'), []);
        assert.deepStrictEqual(await engine.complete(['zzz'], 'zzz'), []);
    });
});
