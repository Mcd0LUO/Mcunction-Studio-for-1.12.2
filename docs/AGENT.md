# Mcfunction Studio for 1.12 — 开发者入口

面向维护者与 AI 助手的快速索引。面向使用者的文档见 [README](../README.md) 与 [快速上手](quickstart.md)。

## 项目定位

VS Code 扩展，为 Minecraft **1.12.2** 数据包的 `.mcfunction` 文件提供：
定义跳转、命令补全、标签/记分板/队伍/假玩家索引、JSON 文本预览、磁盘级增量索引缓存、
以及供数据包作者自行扩展命令补全的 YAML 机制。

## 架构速览

```
用户输入 (.mcfunction)
   │
   ├─ completionProvider/Base.ts ── 解析命令行
   │       └─ dsl/engine.ts ── walk(消费 token) + suggest(生成补全)
   │              ├─ commands/vanilla/*.ts   42 条 1.12.2 内置命令
   │              └─ yaml/loader.ts         用户 YAML（.McfStudio/extra_command/）
   │
   └─ 索引层
          core/DataLoader.ts ── 扫描 / 并发 / 增量解析调度
                 ├─ core/data/IndexedStore.ts ── 定义点引用计数
                 │       └─ core/LineIndex.ts ── 行级追踪 + 类型索引
                 ├─ core/data/IndexCache.ts ── 磁盘缓存（v4，gzip + fingerprint）
                 └─ dsl/yaml/extractor.ts ── 用户自定义类型的提取
```

### 关键模块

| 模块 | 行数 | 职责 |
|------|------|------|
| `core/DataLoader.ts` | ~730 | God Class：配置 + 并发 + 扫描 + 解析调度 + 缓存持久化 |
| `dsl/engine.ts` | ~200 | 补全引擎，walk/suggest 两阶段分离 |
| `core/data/IndexedStore.ts` | ~540 | 定义点引用计数（scoreboard/team）+ 按行清理 |
| `core/LineIndex.ts` | ~215 | 行级追踪 + 引用计数 + 位置反查 |
| `utils/EnumLib.ts` | ~1510 | 懒加载静态枚举（物品/方块/实体/粒子/音效） |

## 关键设计约束（改动前务必了解）

1. **`rootDir` 的持有者是 `core/paths.ts`**，不是 `extension.ts`。
   历史上 core/ 下的模块反向 import 装配点，形成六节点循环，
   导致 `require` 数据层直接崩溃。**新增模块请一律从 `core/paths` 取。**

2. **`CompletionEngine` 的全局引用必须显式 `setCurrent()`**。
   构造函数刻意不产生副作用 —— 否则调试/测试中 `new` 一个就会篡改全局、让补全静默失效。

3. **`optional` 只是标记，不是行为**。引擎的 walk/suggest 不读取它；
   仅 `toTreeShape()` 把它写进基准快照。若要让引擎真正支持跳过可选参数，
   需要实现回溯与 sibling 探测（Brigadier 风格），属引擎能力扩展。

4. **literal 叶子不能有兄弟续接**。引擎 `matchChild` 匹配到 literal 后
   不会回退到兄弟节点，所以 `literal('x').then(...)` 必须给每个字面量分支各自挂上尾巴。

5. **同名定义必须按定义点计数**。`teams`/`scoreboards` 早期是无条件 `delete`，
   导致删一个文件连带删掉另一个文件的同名定义。现由 `_scoreboardDefs`/`_teamDefs` 追踪。

## 开发命令

```bash
npm run compile        # 编译（注释不进产物）
npm run lint           # ESLint
npm run test:engine    # 补全引擎行为测试（37 项）
npm run test:index     # 索引 / 缓存序列化（31 项）
npm run test:baseline  # 1.12.2 命令树基准（8 项）
npm run bench:perf              # 合成包性能基准
npm run bench:perf -- --quiet   # 轻量负载（降低风扇噪音）
npm run bench:real -- "D:/path/to/data"
```

构建发布包：`npx @vscode/vsce package --allow-missing-repository`

## 约定

- **Minecraft 版本语法必须查 wiki 的 History 段**，不能凭记忆或页面标题推断。
  wiki 页面标题里的「1.13 前（old）」指的是 *1.13 之前*，而 1.8~1.12 共用同一套语法 ——
  本项目历史上曾因此误判 5 条命令为「语法错误」。
  查 1.12 时期的精确原文可用 MediaWiki API：
  `?action=query&prop=revisions&rvstart=2018-06-01&rvdir=older`
- **提交前跑完三个测试脚本 + lint**（当前应分别为 37 / 31 / 8 passing，lint 0 error）。
- 迭代计划写 `docs/plans/`，缺陷报告写 `docs/bugs/`，待决策项写 `docs/actions/`，
  阶段快照写 `docs/status/`。

## 文档索引

| 文档 | 用途 |
|------|------|
| [quickstart.md](quickstart.md) | 用户快速上手 |
| [dsl-guide.md](dsl-guide.md) | 命令树定义写法 |
| [yaml-command.md](yaml-command.md) | 自定义命令补全 |
| [status/2026-10-08-v1.5.0-audit.md](status/2026-10-08-v1.5.0-audit.md) | 1.5.1 审计与修复快照 |
| [actions/2026-10-08-architecture-audit-decisions.md](actions/2026-10-08-architecture-audit-decisions.md) | 审计结论与待决策项（含已推翻的结论勘误） |
| [plans/](plans/) | 历史设计记录 |
