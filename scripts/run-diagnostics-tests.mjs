/**
 * 诊断层测试（Node + mocha + vscode mock）
 *
 * 独立于 test:engine —— 诊断规则是纯数据层，跑 mock 即可，
 * 不需要真实 VS Code（真实宿主只用于验证 DiagnosticCollection 能出红线）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const vscodeMock = require('./vscode-mock.cjs');
const orig = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return orig.apply(this, arguments);
};

const Mocha = require('mocha');
const mocha = new Mocha({ timeout: 10000, reporter: 'spec' });
mocha.addFile(path.join(root, 'out/test/diagnostics/diagnostics.test.js'));
mocha.addFile(path.join(root, 'out/test/diagnostics/scoreboard-syntax.test.js'));
mocha.addFile(path.join(root, 'out/test/diagnostics/perf-guard.test.js'));
mocha.addFile(path.join(root, 'out/test/symbols/symbols.test.js'));
mocha.addFile(path.join(root, 'out/test/symbols/symbol-table.test.js'));
mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});