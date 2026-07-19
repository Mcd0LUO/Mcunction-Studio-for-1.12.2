/**
 * 编译产物上跑 1.12.2 命令树基准测试（Node + mocha，无 Electron）。
 *
 *   npm run test:baseline
 *   STRICT_BASELINE=1 npm run test:baseline   # 含 known-gap 全部必须对齐
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ---- mock vscode before any out/* load ----
const vscodeMock = require('./vscode-mock.cjs');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return originalLoad.apply(this, arguments);
};

// 确保 baseline JSON 出现在 out/test/baseline（tsc 默认不拷 json）
const srcBaseline = path.join(root, 'src/test/baseline/mc112-commands.baseline.json');
const outBaselineDir = path.join(root, 'out/test/baseline');
const outBaseline = path.join(outBaselineDir, 'mc112-commands.baseline.json');
fs.mkdirSync(outBaselineDir, { recursive: true });
fs.copyFileSync(srcBaseline, outBaseline);

const testFile = path.join(root, 'out/test/baseline/command-tree.diff.test.js');
if (!fs.existsSync(testFile)) {
    console.error('Missing', testFile, '— run npm run compile first');
    process.exit(1);
}

// mocha programmatic
const Mocha = require('mocha');
const mocha = new Mocha({
    timeout: 10000,
    reporter: 'spec',
});
mocha.addFile(testFile);

mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});
