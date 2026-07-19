/**
 * P0 索引单元测试（Node + mocha + vscode mock）
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
mocha.addFile(path.join(root, 'out/test/index/indexed-store.test.js'));
mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});
