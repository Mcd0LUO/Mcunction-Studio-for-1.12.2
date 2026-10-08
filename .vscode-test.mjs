import { defineConfig } from '@vscode/test-cli';
import fs from 'node:fs';

/**
 * 复用本机已安装的 VS Code，避免每次测试都重新下载一份。
 * 找不到时回退到 test-cli 默认行为（自动下载 stable）。
 */
function localVscodePath() {
	if (process.env.VSCODE_EXECUTABLE_PATH) { return process.env.VSCODE_EXECUTABLE_PATH; }
	const candidates = [
		'D:/tools/ide/VSCode/Code.exe',
		'C:/Program Files/Microsoft VS Code/Code.exe',
		'C:/Users/' + (process.env.USERNAME ?? '') + '/AppData/Local/Programs/Microsoft VS Code/Code.exe',
	];
	for (const c of candidates) {
		if (c && fs.existsSync(c)) { return c; }
	}
	return undefined;
}

const executablePath = localVscodePath();

/**
 * 真实 VS Code 集成测试配置。
 *
 * 只跑 out/test/e2e/** —— 这些测试在真正的 Electron 宿主中运行，
 * 用于验证「扩展能否被 VS Code 识别并激活」这类只有真实宿主才能确认的事。
 *
 * src/test/{index,dsl}/** 下的测试依赖 scripts/vscode-mock.cjs 注入的
 * vscode 桩，在真实宿主中会拿到真实 API，因此由 npm run test:index /
 * test:engine 单独执行（Node + mock）。
 */
export default defineConfig({
	files: 'out/test/e2e/**/*.test.js',
	version: 'stable',
	...(executablePath ? { executablePath } : {}),
	// 集成测试涉及工作区与补全，给足超时
	timeout: 120000,
	mocha: {
		ui: 'tdd',
		timeout: 60000,
	},
});
