/**
 * 纯净层守卫 —— 证明规则/算法层真的不依赖 vscode。
 *
 * 由 scripts/run-purity-tests.mjs 运行：那个运行器把 require('vscode')
 * 换成了**抛错的陷阱**（而不是像其它测试那样注入 mock）。
 * 因此本文件里任何对纯层模块的 require，只要它（含传递依赖）
 * 碰了 vscode，就会立刻炸掉。
 *
 * ⚠️ 本文件本身绝不能 `import * as vscode from 'vscode'`。
 *
 * 两道防线：
 *   静态扫描 —— 逐文件检查源码里有没有 vscode import（覆盖未被加载的文件）
 *   运行时   —— 在陷阱下真的加载并跑一遍（覆盖传递依赖，比静态扫描更强）
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/** 纯层的两个根目录（相对仓库根） */
const PURE_ROOTS = [
    path.join('src', 'core', 'diagnostics'),
    path.join('src', 'core', 'symbols'),
];

/**
 * 允许 import vscode 的适配层文件。
 *
 * 这是**刻意的最小豁免集**：它们负责把纯数据翻译成 vscode 类型，
 * 是纯层与宿主之间唯一的接缝。
 */
const ALLOWED_ADAPTERS = new Set(['bridge.ts', 'vscodeAdapter.ts']);

/** 仓库根：out/test/purity → 上溯三级 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function listTsFiles(dir: string): string[] {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) { return []; }
    const out: string[] = [];
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listTsFiles(rel));
        } else if (entry.name.endsWith('.ts')) {
            out.push(rel);
        }
    }
    return out;
}

function allPureFiles(): string[] {
    const files: string[] = [];
    for (const root of PURE_ROOTS) { files.push(...listTsFiles(root)); }
    return files;
}

function isAdapter(relPath: string): boolean {
    return ALLOWED_ADAPTERS.has(path.basename(relPath));
}

/** 去掉注释与字符串字面量，避免把注释里的 "vscode" 当成真实依赖 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');
}

describe('纯净层守卫/静态扫描', () => {
    it('纯层目录下确实有文件（防止扫描逻辑失效后静默通过）', () => {
        const files = allPureFiles();
        assert.ok(
            files.length >= 8,
            `纯层文件数异常偏少（${files.length}）——扫描路径可能写错了`,
        );
    });

    it('除适配层外，纯层文件不得 import vscode', () => {
        const offenders: string[] = [];
        for (const rel of allPureFiles()) {
            if (isAdapter(rel)) { continue; }
            const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
            if (/from\s+['"]vscode['"]/u.test(src) || /require\(\s*['"]vscode['"]\s*\)/u.test(src)) {
                offenders.push(rel);
            }
        }
        assert.deepStrictEqual(
            offenders, [],
            `以下文件破坏了纯净层约束（应把宿主相关代码挪到 bridge.ts / vscodeAdapter.ts）：\n${offenders.join('\n')}`,
        );
    });

    it('除适配层外，纯层文件不得 import 适配层（否则 vscode 会传递进来）', () => {
        const offenders: string[] = [];
        for (const rel of allPureFiles()) {
            if (isAdapter(rel)) { continue; }
            const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
            // 匹配 import ... from './bridge' / '../vscodeAdapter' 等
            const re = /from\s+['"][^'"]*\/(bridge|vscodeAdapter)['"]/u;
            if (re.test(src)) { offenders.push(rel); }
        }
        assert.deepStrictEqual(
            offenders, [],
            `以下纯层文件反向依赖了适配层：\n${offenders.join('\n')}`,
        );
    });

    it('适配层豁免集是最小的（新增豁免必须是有意为之）', () => {
        const adapters = allPureFiles().filter(isAdapter);
        assert.deepStrictEqual(
            adapters.map(p => path.basename(p)).sort(),
            ['bridge.ts', 'bridge.ts', 'vscodeAdapter.ts'],
            '适配层清单变了。若确有必要新增，请同时更新本断言与 docs/AGENT.md',
        );
    });
});

describe('纯净层守卫/运行时加载', () => {
    /** 纯层全部可独立加载的模块（相对 out/） */
    const PURE_MODULES = [
        '../../core/diagnostics/types',
        '../../core/diagnostics/selector',
        '../../core/diagnostics/runner',
        '../../core/diagnostics/rules/syntax',
        '../../core/diagnostics/rules/resource',
        '../../core/diagnostics/rules/value',
        '../../core/symbols/extractor',
        '../../core/symbols/resolver',
        '../../core/symbols/naming',
    ];

    for (const m of PURE_MODULES) {
        it(`可在无 vscode 环境下加载 ${m}`, () => {
            // 陷阱已在 runner 里装好；只要传递依赖碰到 vscode 这里就会抛
            const mod = require(m);
            assert.ok(mod && typeof mod === 'object', `${m} 未导出任何内容`);
        });
    }

    it('诊断调度器在无 vscode 环境下能真的产出诊断', () => {
        const { DiagnosticRunner, ALL_RULES } = require('../../core/diagnostics/runner');
        const { ValidationContext } = require('../../core/diagnostics/types');

        const ctx = new ValidationContext({
            commandTable: () => [],
            hasScoreboard: () => false,
            hasTeam: () => false,
            hasTag: () => false,
            hasFunction: () => false,
            hasAdvancement: () => false,
            definitionsOf: () => [],
        });
        const runner = new DiagnosticRunner({ rules: ALL_RULES, ctx, levels: {} });

        // 17 字符 > 上限 16：这是纯取值规则，不依赖索引
        const longName = 'a'.repeat(17);
        const diags: Array<{ ruleId: string }> = runner.checkDocument([`scoreboard objectives add ${longName} dummy`]);
        assert.ok(
            diags.some((d: { ruleId: string }) => d.ruleId === 'scoreboard/name-too-long'),
            `纯层应能在无 vscode 下判定超长名，实际诊断：${JSON.stringify(diags)}`,
        );
    });

    it('符号抽取器在无 vscode 环境下可用', () => {
        const { extractSymbols } = require('../../core/symbols/extractor');
        const syms = extractSymbols('scoreboard players set @s kills 1');
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].value, 'kills');
    });

    it('命名规则在无 vscode 环境下可用', () => {
        const { isValidSymbolName, NAME_MAX } = require('../../core/symbols/naming');
        assert.strictEqual(isValidSymbolName('a'.repeat(NAME_MAX), { maxLength: NAME_MAX }), true);
        assert.strictEqual(isValidSymbolName('a'.repeat(NAME_MAX + 1), { maxLength: NAME_MAX }), false);
    });
});