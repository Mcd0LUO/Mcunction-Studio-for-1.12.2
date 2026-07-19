/**
 * 1.12.2 命令树基准 diff 测试
 *
 * - required 命令必须与 baseline 完全一致（function / effect）
 * - 其余登记命令输出路径级差异，默认以 known-gap 报告（不 fail），
 *   设置 STRICT_BASELINE=1 时全部必须对齐
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { RootNode } from '../../dsl/nodes';
import { toTreeShape, diffTreeShape, formatShapeDiffs, TreeShape } from '../../dsl/treeShape';
import { functionCmd } from '../../dsl/commands/vanilla/function';
import { effectCmd } from '../../dsl/commands/vanilla/effect';
import { timeCmd } from '../../dsl/commands/vanilla/time';
import { titleCmd } from '../../dsl/commands/vanilla/title';
import { scoreboardCmd } from '../../dsl/commands/vanilla/scoreboard';

interface BaselineFile {
    version: string;
    required: string[];
    commands: Record<string, TreeShape & { _note?: string }>;
}

/** 已实现命令的根节点表（可扩展） */
const IMPLEMENTED: Record<string, RootNode> = {
    function: functionCmd,
    effect: effectCmd,
    time: timeCmd,
    title: titleCmd,
    scoreboard: scoreboardCmd,
};

function loadBaseline(): BaselineFile {
    const candidates = [
        path.join(__dirname, 'mc112-commands.baseline.json'),
        path.join(__dirname, '../../../src/test/baseline/mc112-commands.baseline.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8')) as BaselineFile;
        }
    }
    throw new Error('mc112-commands.baseline.json not found');
}

/**
 * 支持 "scoreboard.players.remove" 形式的子路径基准：
 * 从实际整树按 literal 名下降，沿途裁剪兄弟分支，便于局部 diff。
 */
function projectActual(root: RootNode, baselineKey: string): TreeShape {
    const parts = baselineKey.split('.');
    const shape = toTreeShape(root);
    if (parts.length === 1) {
        return shape;
    }

    let cursor: TreeShape = shape;
    for (let i = 1; i < parts.length; i++) {
        const seg = parts[i];
        const next = (cursor.children || []).find(
            c => c.kind === 'literal' && c.name === seg
        );
        if (!next) {
            return { kind: 'root', name: root.commandName, children: [] };
        }
        cursor.children = [next];
        cursor = next;
    }
    return shape;
}

function stripNotes(shape: TreeShape & { _note?: string }): TreeShape {
    const { _note, ...rest } = shape as TreeShape & { _note?: string };
    void _note;
    return {
        ...rest,
        children: (rest.children || []).map(c => stripNotes(c as TreeShape & { _note?: string })),
    };
}

function rootNameForKey(key: string): string {
    return key.split('.')[0];
}

describe('1.12.2 command tree baseline', () => {
    const baseline = loadBaseline();
    const strict = process.env.STRICT_BASELINE === '1';
    const reports: string[] = [];

    it('baseline file loads and has required commands', () => {
        assert.strictEqual(baseline.version, '1.12.2');
        assert.ok(baseline.required.includes('function'));
        assert.ok(baseline.required.includes('effect'));
    });

    for (const [key, expectedRaw] of Object.entries(baseline.commands)) {
        const isRequired = baseline.required.includes(key)
            || baseline.required.includes(rootNameForKey(key));
        // 子路径 key（scoreboard.players.remove）仅在 strict 或显式 required 全名时强制
        const mustPass = baseline.required.includes(key)
            || (isRequired && !key.includes('.'));

        it(`${mustPass ? '[required]' : '[gap]'} ${key}`, function () {
            const rootName = rootNameForKey(key);
            const impl = IMPLEMENTED[rootName];
            assert.ok(impl, `no implementation registered for root "${rootName}"`);

            const expected = stripNotes(expectedRaw);
            const actual = projectActual(impl, key);
            const diffs = diffTreeShape(expected, actual);
            const report = formatShapeDiffs(key, diffs);
            reports.push(report);

            if (diffs.length > 0) {
                console.log('\n' + report);
            } else {
                console.log('\n' + report);
            }

            if (mustPass || strict) {
                assert.deepStrictEqual(
                    diffs,
                    [],
                    `${key} diverges from 1.12.2 baseline:\n${report}`
                );
            }
            // known-gap：不 assert，只打印 diff，便于对比差异
        });
    }

    after(() => {
        console.log('\n======== Baseline diff summary ========');
        for (const r of reports) {
            console.log(r);
        }
        console.log('=======================================');
    });
});

describe('1.12.2 semantics notes (documentation locks)', () => {
    it('function if/unless is valid 1.12.2 (not 1.13+)', () => {
        const shape = toTreeShape(functionCmd);
        const nameArg = shape.children[0];
        assert.strictEqual(nameArg?.kind, 'argument');
        const lits = (nameArg.children || []).filter(c => c.kind === 'literal').map(c => c.name);
        assert.ok(lits.includes('if'), 'function must expose if');
        assert.ok(lits.includes('unless'), 'function must expose unless');
    });

    it('effect exposes clear alongside effect id', () => {
        const shape = toTreeShape(effectCmd);
        const target = shape.children[0];
        const names = (target.children || []).map(c => c.name);
        assert.ok(names.includes('clear'), 'effect <target> clear');
        assert.ok(names.includes('<effect>'), 'effect <target> <effect>');
    });
});
