/**
 * CompletionEngine 行为测试（Node + mocha + vscode mock）
 *
 * 独立于 test:index —— 引擎测试不需要磁盘与索引数据，
 * 用空 DataLoader 即可驱动（循环依赖已断开，引擎可独立 require）。
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
mocha.addFile(path.join(root, 'out/test/dsl/engine.test.js'));
mocha.addFile(path.join(root, 'out/test/dsl/wiki-syntax.test.js'));
mocha.addFile(path.join(root, 'out/test/activation.test.js'));
mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});
