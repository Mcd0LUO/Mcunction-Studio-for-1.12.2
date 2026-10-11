/**
 * 纯净层测试运行器 —— 与其它 Node 测试的关键区别：
 *
 *   `run-diagnostics-tests.mjs` 注入 **mock**（假装 vscode 存在）；
 *   本脚本注入 **陷阱**（一旦碰 vscode 就抛错）。
 *
 * 目的：用运行时证据证明 core/diagnostics 与 core/symbols 的规则层
 * 真的不依赖 vscode —— 而不是靠"我看过源码"这种会过期的判断。
 *
 * 为什么值得单独一层测试：
 *   本项目的 Node 测试长期依赖 scripts/vscode-mock.cjs，
 *   而 mock 的完备性是个持续负担（每加一个 vscode API 就要补一次，
 *   漏补的表现是「测试莫名报 is not a function」）。
 *   只要纯层真的纯净，它的测试就永远不需要跟着 mock 走。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const orig = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        const from = parent && parent.filename ? parent.filename : '未知模块';
        throw new Error(
            `纯净层不得依赖 vscode：${from} 触发了 require('vscode')。\n` +
            `规则/算法层必须与宿主解耦（见 docs/AGENT.md 约束 7）。`,
        );
    }
    return orig.apply(this, arguments);
};

const Mocha = require('mocha');
const mocha = new Mocha({ timeout: 10000, reporter: 'spec' });
mocha.addFile(path.join(root, 'out/test/purity/purity.test.js'));
mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});