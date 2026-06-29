# DSL 全自动注册方案 — 2026-06-29

## 现状

`src/dsl/commands/index.ts` 手动 import + 注册 50 条命令，每新增一个命令文件就要改两处（import + 数组）。

```typescript
// 目前：每个命令一行 import
import { killCmd } from './vanilla/kill';
import { testforCmd } from './vanilla/testfor';
// ... 50 行
const ALL: RootNode[] = [killCmd, testforCmd, /* ... */];
```

## 目标

新增命令文件 **零配置**：丢一个 `.ts` 文件到 `vanilla/` 或 `easycber/` 目录，F5 重启自动生效。

## 方案：编译期 barrel export + 运行时动态扫描

### 方案 A：barrel re-export（推荐）

在每个命令目录加 `index.ts`，re-export 所有 `*Cmd`：

```
src/dsl/commands/vanilla/index.ts   ← 自动 re-export 目录下所有 Cmd
src/dsl/commands/easycber/index.ts  ← 同上
```

`vanilla/index.ts`：
```typescript
export { killCmd } from './kill';
export { testforCmd } from './testfor';
// ...
```

`commands/index.ts`：
```typescript
import * as vanilla from './vanilla';
import * as easycber from './easycber';

export function registerAll(engine: CompletionEngine): void {
    for (const mod of [vanilla, easycber]) {
        for (const cmd of Object.values(mod)) {
            if (cmd instanceof RootNode) { engine.register(cmd); }
        }
    }
}
```

**优点**：编译期检查，无运行时文件扫描，启动快。
**缺点**：仍需要维护 `vanilla/index.ts` 的 re-export 列表。

### 方案 B：文件系统扫描（类似旧 `autoRegisterProviders`）

在 `CompletionEngine` 添加静态扫描方法：

```typescript
static async autoRegister(engine: CompletionEngine, extPath: string): Promise<void> {
    const base = join(extPath, 'out', 'dsl', 'commands');
    for (const sub of ['vanilla', 'easycber']) {
        const dir = join(base, sub);
        const files = await fs.readdir(dir);
        for (const file of files) {
            if (!file.endsWith('.js') || file === 'index.js') { continue; }
            const mod = await import(join('..', 'dsl', 'commands', sub, file));
            for (const value of Object.values(mod)) {
                if (value instanceof RootNode) { engine.register(value); }
            }
        }
    }
}
```

**优点**：新增文件零修改，文件系统自动发现。
**缺点**：运行时开销（启动时扫描 + 动态 import），依赖编译产物路径。

### 方案 C：双轨 — barrel 为主 + 扫描为扩展（推荐）

1. 内置命令用 barrel（`vanilla/index.ts`, `easycber/index.ts`）
2. 额外扫描一个 `custom/` 目录，支持用户自定义命令

## 推荐：方案 B（扫描）

旧 `CommandRegistry.autoRegisterProviders` 已有成熟的扫描模式，DSL 直接复用。50 个文件扫描耗时 < 50ms，可忽略。

### 实现步骤

1. `CompletionEngine` 新增 `static async autoScan(context: vscode.ExtensionContext)`
2. 扫描 `out/dsl/commands/vanilla/` 和 `out/dsl/commands/easycber/`
3. `import()` 每个 `.js` 文件，提取 `RootNode` 实例，`engine.register()`
4. 跳过 `index.js`、`suggests.js` 等非命令文件
5. `extension.ts` 调用替代手动 `registerAll()`
6. `index.ts` 精简为仅保留 `registerAll` 作为手动注册入口（可选）

### 文件命名约定

- 命令文件：`xxx.ts` → 编译为 `xxx.js`，export `xxxCmd: RootNode`
- 辅助文件（跳过）：`index.ts`, `suggests.ts`

### 验收

- 新增 `src/dsl/commands/vanilla/foo.ts` → `tsc` → F5 → `[DSL]` 日志出现 `foo`
- 删除文件同理
- 旧 `index.ts` 手写列表可删除或精简

## 风险

- `import()` 路径为编译后 `out/` 下的相对路径，需确保 tsconfig `rootDir`/`outDir` 正确
- 循环依赖：命令文件 import `builder`/`suggests` → 无风险（单向依赖）
