import { defineConfig } from '@vscode/test-cli';
import fs from 'node:fs';
import path from 'node:path';

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
 * e2e 专用数据包的落盘位置。
 *
 * 必须是**固定**路径：测试用例要断言具体文件的内容，
 * 不能用 mkdtemp 每次生成随机目录（否则测试无从知道打开的是哪个文件）。
 *
 * ⚠️ 每次启动前**整目录清空**。这个函数在 VS Code 启动之前执行，
 *    所以删除是安全的。不清的话上一轮遗留的夹具会留在索引里：
 *    实测过一次——上一轮探针写的文件里也有 `prob_obj`，
 *    于是本轮重命名 `prob_obj` 命中了 **2 个文件**而非 1 个，
 *    断言 `edit.size === 1` 失败，而失败原因跟被测代码毫无关系。
 */
function e2ePackDir() {
	const p = path.join(rootDir(), '.vscode-test', 'e2e-pack');
	fs.rmSync(p, { recursive: true, force: true });
	fs.mkdirSync(path.join(p, 'data', 'functions', 'ns'), { recursive: true });
	fs.writeFileSync(path.join(p, 'data', 'functions', 'ns', 'a.mcfunction'), [
		'scoreboard objectives add kills dummy',
		'scoreboard players tag @s add marked',
		'effect @p speed',
		'',
	].join('\n'));
	return p;
}

function rootDir() {
	return path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'));
}

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
/**
 * 隔离的 user-data-dir。
 *
 * 用真实 profile 会有两个问题：
 *   1. 上次会话的工作区会被恢复，**覆盖** launchArgs 里的目录
 *      （实测开成了一个已被删除的临时目录，rootDir 定位失败）；
 *   2. 扩展的全局状态（index-cache 等）跨轮次残留，测试之间互相污染。
 * 因此给测试单独一份 profile，测完即弃。
 */
function userDataDir() {
	const p = path.join(rootDir(), '.vscode-test', 'user-data');
	fs.mkdirSync(p, { recursive: true });
	return `--user-data-dir=${p}`;
}

export default defineConfig({
	files: 'out/test/e2e/**/*.test.js',
	version: 'stable',
	...(executablePath ? { executablePath } : {}),
	/**
	 * 预置一个真实的数据包工作区。
	 *
	 * 索引型能力（References / Rename / "未定义引用"诊断）需要 rootDir，
	 * 而它只能从工作区文件夹推导。测试内用 vscode.openFolder 打开会**重启窗口**
	 * 并杀死测试运行器，因此在启动参数里带上工作区路径才是可行做法。
	 *
	 * 该目录由 scripts/make-e2e-pack.mjs 生成，内容与 e2e 用例断言一致。
	 */
	launchArgs: [
		e2ePackDir(),
		// VS Code 会恢复**上次会话**的工作区，从而覆盖上面的 launchArgs 目录。
		// 早期版本误开一个已被删除的临时目录，导致 rootDir 定位失败、
		// 索引型用例（References / Rename）全部拿不到数据。
		'--disable-workspace-trust',
		'--skip-release-notes',
		userDataDir(),
		// 关闭自动更新检查：离线环境下每次启动都要等网络超时
		'--disable-updates',
	],
	// 集成测试涉及工作区与补全，给足超时
	timeout: 120000,
	mocha: {
		ui: 'tdd',
		timeout: 60000,
	},
});
