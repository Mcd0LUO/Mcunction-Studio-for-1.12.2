# Plan: effect clear + 1.12.2 命令树基准测试

**日期**: 2026-07-19  
**复杂度**: 低  
**版本目标**: 1.4.2 补丁向

## 背景

审计中误将 `/function ... if|unless` 标为 1.13+；**1.12.2 官方语法即为**：

```
function <name> [if|unless <selector>]
```

当前 `function.ts` 定义正确，应写入基准并锁定。

`/effect` 在 1.12.2 另有清除分支：

```
effect <player> <effect> [seconds] [amplifier] [hideParticles]
effect <player> clear
```

当前定义缺失 `clear`，需补齐。

## 模块

| 模块 | 动作 |
|------|------|
| `src/dsl/commands/vanilla/effect.ts` | 增加 `literal('clear')` 与 effect 参数并列 |
| `src/dsl/treeShape.ts` | 命令树结构序列化（忽略 suggest 实现） |
| `src/test/baseline/mc112-commands.baseline.json` | 1.12.2 期望树形 |
| `src/test/baseline/command-tree.diff.test.ts` | 实际树 vs 基准 diff |
| `scripts/run-baseline-tests.mjs` | Node 侧 vscode mock + 跑测试 |
| `package.json` | `test:baseline` script |

## 验收标准

1. `effect @p clear` 路径在 DSL 树上存在（`effect → <target> → clear`）。
2. `function` 基准包含 `if` / `unless` 分支，测试 **通过**（非缺陷）。
3. `npm run test:baseline` 可在无 VS Code 窗口下跑通；对纳入基准的命令输出 **路径级 diff**。
4. 基准中尚未对齐的命令以 diff 报告形式暴露（不强制一次修完）。

## 技术债

- 引擎仍不识别 `optional`；基准只锁**树形结构**，不测 walk/suggest 运行时。
- scoreboard / title / time 等可后续扩基准，本次以 effect + function 为必过项，其余可选登记为 known-gap。

## 追加（同日）：端到端性能基线

| 脚本 | 内容 |
|------|------|
| `npm run bench:perf` | 合成 S/M/L 数据包上 `loadData` 墙钟；`complete()` 含 selectors/blocks/items/sounds 的 p50/p95 |
| `npm run bench:baseline` | 树 dump / Enum 过滤微基准（不含扫盘） |

`scripts/bench-perf.mjs` + 增强版 `scripts/vscode-mock.cjs`（真实 fs / findFiles）。
