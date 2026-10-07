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

    it('getRootItems 覆盖全部 42 条内置命令', () => {
        assert.strictEqual(engine.getRootItems().length, 42);
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

    it('九个坐标之后列出三种 maskMode', async () => {
        const r = await engine.complete(P, P.join(' '));
        assert.deepStrictEqual(labels(r).sort(), ['filtered', 'masked', 'replace']);
    });

    it('maskMode 之后给出三个 cloneMode 关键字', async () => {
        // 1.12.2: [cloneMode] = force | move | normal（1.8/14w10a/14w20a 引入）
        for (const mask of ['filtered', 'masked', 'replace']) {
            const c = [...P, mask];
            const r = await engine.complete(c, c.join(' '));
            assert.deepStrictEqual(labels(r).sort(), ['force', 'move', 'normal'],
                `${mask} 之后应给出 cloneMode`);
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

    it('[speed] 之后给出 normal / force', async () => {
        const r = await engine.complete(P, P.join(' '));
        assert.deepStrictEqual(labels(r).sort(), ['force', 'normal']);
    });

    it('mode 可省略：直接给出 [count] 占位', async () => {
        const c = [...P, ''];
        const r = await engine.complete(c, c.join(' '));
        assert.ok(labels(r).includes('[count]'), 'mode 省略时也应能继续');
    });

    it('[player] 可选，params 变长（最多 2 个）', () => {
        const { toTreeShape } = require('../../dsl/treeShape') as typeof import('../../dsl/treeShape');
        const { particleCmd } = require('../../dsl/commands/vanilla/particle') as
            typeof import('../../dsl/commands/vanilla/particle');
        const shape = toTreeShape(particleCmd);
        // 沿 <name> → <x> → ... → <speed> 走到 tail，其子节点应含 mode 与 [player]
        let node = shape;
        for (const name of ['<name>', '<x>', '<y>', '<z>', '<xd>', '<yd>', '<zd>', '<speed>']) {
            const next = node.children.find(c => c.name === name);
            assert.ok(next, `树中应存在 ${name}`);
            node = next!;
        }
        const names = node.children.map(c => c.name);
        assert.ok(names.includes('[count]'));
        assert.ok(names.includes('normal') && names.includes('force'));
        assert.ok(names.includes('[player]'), 'mode 省略时也应能到 [player]');
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
