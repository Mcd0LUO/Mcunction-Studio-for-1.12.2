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
| `dsl/engine.ts` | ~360 | 补全引擎，walk/suggest 两阶段分离 + `validate()` 语法校验 |
| `core/data/IndexedStore.ts` | ~580 | 定义点引用计数（scoreboard/team）+ 按行清理 |
| `core/LineIndex.ts` | ~215 | 行级追踪 + 引用计数 + 位置反查 |
| `core/diagnostics/` | ~800 | 诊断（红线）：纯数据规则层 + vscode 适配层 |
| `core/symbols/` | ~500 | 符号抽取（行 → 带列区间的符号出现）+ 命名规则 |
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

6. **`greedy` 表示贪婪文本参数**（wiki 里的 `<message …>`）。
   它吃掉其后所有 token；普通 `argument` 每层只消费一个。
   `say` / `title` 的 raw json 都必须是 greedy，否则诊断会把合法命令判成多余参数。

7. **`core/diagnostics/` 与 `core/symbols/` 的规则层禁止 import vscode**。
   唯一豁免是适配层：`diagnostics/bridge.ts`、`diagnostics/vscodeAdapter.ts`、
   `symbols/bridge.ts` —— 它们把纯数据翻译成 vscode 类型，是唯一的接缝。
   纯层也**不得反向 import 适配层**（否则 vscode 会传递进来）。

   > 这条约束由 `npm run test:purity` **运行时强制**：
   > 那个运行器把 `require('vscode')` 换成抛错的陷阱（而非像其它测试那样注入 mock），
   > 再逐个加载纯层模块。违反时测试会直接指出是哪个文件。
   > 静态扫描还会检查未被加载的文件，并锁定豁免集清单。

   为什么值得：Node 测试长期依赖 `scripts/vscode-mock.cjs`，而 mock 的完备性
   是持续负担（每加一个 vscode API 就要补一次，漏补表现为「测试莫名报
   is not a function」）。纯层真的纯净，它的测试就永远不用跟着 mock 走。

8. **符号匹配按「角色」而非字符串**。`say total points` 里的 total 与
   `scoreboard objectives add total` 里的 total 是不同角色的同一串文本。
   重命名/查找引用必须走 `core/symbols/extractor`，
   绝不能图省事用"全工作区搜字符串"——那会改坏用户的数据。

9. **依赖索引的能力必须先过 `isIndexReady()` 闸门**。
   未打开数据包时索引为空，若照常跑"引用是否存在"检查，
   正确写法也会满屏红线（e2e 实测踩过）。诊断规则用 `needsIndex: true` 声明。

10. **名字的长度上限只有 wiki 写明的那几种才施加**。
    记分板目标与队伍是 16（显示名 32），来源见 `core/symbols/naming.ts` 注释。
    标签、假玩家名在 wiki 上没有写明上限，因此**不设限** ——
    用臆测的数字拒绝用户的合法输入，比漏报更糟。
    长度一律按 Unicode **码点**计（`codePointLength`），不用 `String.length`。

11. **重命名的替换区间不含假玩家的 `#`**（见 extractor 的 `hashStart`），
    因此插入的文本必须是 `bareName(newName)`。
    插入 `#newname` 会叠加成 `##newname` —— 这是修过的真 bug，e2e 有回归用例。

12. **新增可索引符号时，三个地方要同步**：
    `MinecraftExtractor` 的 handler、`extractSymbols` 的角色抽取、
   以及 `LineIndex` 的写入（`addScoreboard` / `addScoreboardRef` …）。
   漏掉第三处会导致「能补全、能跳转，但找不到引用」这种半残状态。

13. **补全的替换区间不能交给 VS Code 猜**。
    它按语言词法找「词」，而 Minecraft 的资源名/选择器里全是
    `:` `/` `.` `@` `#` —— 默认词法把这些当分隔符，
    于是 `function ns:` 的词范围为空、`function ns:a` 的只有 `a`，
    接受 `ns:test` 都会得到 `ns:ns:test`。

    两道防线都要有：
    - `syntaxes/language-configuration.json` 的 `wordPattern` 覆盖这些字符
      （兜住引擎未显式设置区间的路径，如根命令补全）
    - 引擎用 `withRanges()` 显式设置区间，语义分两类：
      **参数值候选**替换已输入的前缀，**下一级字面量**零宽插入

    ⚠️ 新增返回补全项的代码路径时，务必确认它走了 `withRanges`；
    漏掉的路径会退回词法推算，在含 `:` 的值上重现重复插入。

## 开发命令

```bash
npm run compile              # 编译（注释不进产物）
npm run lint                 # ESLint
npm run test:purity          # 纯净层守卫（16 项，无 mock：碰 vscode 即失败）
npm run test:engine          # 补全引擎行为测试（51 项）
npm run test:diagnostics     # 诊断规则 + 符号抽取（110 项）
npm run test:index           # 索引 / 缓存序列化（31 项）
npm run test:baseline        # 1.12.2 命令树基准（10 项）
npm run test:e2e             # 真实 VS Code 集成（16 项，含红线/引用/重命名/补全区间）
npm run bench:perf              # 合成包性能基准
npm run bench:perf -- --quiet   # 轻量负载（降低风扇噪音）
npm run bench:real -- "D:/path/to/data"
```

测试分四层，**各管各的盲区**：

| 层 | 环境 | 能测 | 测不到 |
|----|------|------|--------|
| `test:purity` | Node，**vscode 陷阱**（无 mock） | 纯层是否真的与宿主解耦 | 功能正确性 |
| `test:engine/index/diagnostics/baseline` | Node + `scripts/vscode-mock.cjs` | 纯逻辑、规则、索引 | 宿主 API 是否存在 |
| `test:e2e` | 真实 VS Code（复用 `D:/tools/ide/VSCode`） | 语言绑定、激活、provider 注册、红线渲染、引用/重命名 | — |
| 手工安装 vsix | 真实用户环境 | 发布流程 | — |

> `test:purity` 与其它 Node 测试的区别只有一点：它注入的是**陷阱**而不是 mock。
> 因此它不受 mock 完备性影响 —— 这也是「新增纯逻辑该往哪放」的答案：
> 放进纯层，测试就永远不用改 mock。

> **e2e 必须带真实工作区。** `.vscode-test.mjs` 通过 `launchArgs` 注入
> `.vscode-test/e2e-pack`，并用独立的 `--user-data-dir`。
> 否则 VS Code 会恢复上次会话的工作区，指向一个已被删除的临时目录，
> rootDir 定位失败，所有依赖索引的用例（引用、重命名、未定义诊断）全部拿不到数据 ——
> 且表现为「测试莫名失败」，很难联想到是工作区问题。

> 语言绑定失败（`languageId = plaintext`）只有第三层能发现：
> 扩展加载成功、贡献点在、语言也在 `getLanguages()` 里，但就是不绑定。

构建发布包：`npx @vscode/vsce package --allow-missing-repository`

## 约定

- **Minecraft 版本语法必须查 wiki 的 History 段**，不能凭记忆或页面标题推断。
  wiki 页面标题里的「1.13 前（old）」指的是 *1.13 之前*，而 1.8~1.12 共用同一套语法 ——
  本项目历史上曾因此误判 5 条命令为「语法错误」。
  查 1.12 时期的精确原文可用 MediaWiki API：
  `?action=query&prop=revisions&rvstart=2018-06-01&rvdir=older`
- **提交前跑完 Node 侧五个测试脚本 + lint**
  （当前应分别为 16 / 63 / 122 / 31 / 12 passing，lint 0 error）。
  改动 `package.json` 的 `contributes`、扩展激活、语言绑定相关代码时，
  额外跑 `npm run test:e2e`。
- **命令语法一律查 wiki 原文，且必须查 `Scoreboard#Command reference` 这类
  表格页而不是同名子页**。教训：
  - `Commands/scoreboard` 只有一行转述，真表格在 `Scoreboard#Command reference`
  - `Commands/detect` 是 Education Edition 的 Agent 命令，**不是** Java 的 `/detect`
    （Java 里 `detect` 只是 `execute` 的子语法）
  - `scoreboard` 的 `[dataTag]`(NBT)、`[display name...]`、`players test`
    都是这样查出来的 —— 凭印象写的树会缺一大片
- **变长/自由文本参数用 `greedy`**，不要用普通 `argument`。
  否则多写的词会被诊断误判成"多余参数"
  （`say hello world`、`set @s obj 1 {a: 1}`、`teams join red @a @p` 都属此类）。
- 迭代计划写 `docs/plans/`，缺陷报告写 `docs/bugs/`，待决策项写 `docs/actions/`，
  阶段快照写 `docs/status/`。

## 文档索引

| 文档 | 用途 |
|------|------|
| [quickstart.md](quickstart.md) | 用户快速上手 |
| [dsl-guide.md](dsl-guide.md) | 命令树定义写法 |
| [yaml-command.md](yaml-command.md) | 自定义命令补全 |
| [status/2026-10-08-v1.5.0-audit.md](status/2026-10-08-v1.5.0-audit.md) | 1.5.1 审计与修复快照 |
| [plans/2026-07-20-diagnostics-design.md](plans/2026-07-20-diagnostics-design.md) | 诊断层设计与规则清单 |
| [actions/2026-10-08-architecture-audit-decisions.md](actions/2026-10-08-architecture-audit-decisions.md) | 审计结论与待决策项（含已推翻的结论勘误） |
| [plans/](plans/) | 历史设计记录 |

### 对外文档（面向用户，需双语同步）

| 文件 | 语言 | 说明 |
|------|------|------|
| [../README.md](../README.md) | English | 市场页默认展示这一份 |
| [../README.zh-CN.md](../README.zh-CN.md) | 简体中文 | |

两份 README 首行都是语言切换链接，**改动功能后要同时更新两份**，
否则两种语言会描述不一致。相对链接（如 `docs/quickstart.md`）在 GitHub 上直接生效，
在市场页则由 `package.json` 的 `repository` 字段解析 —— 该字段不可删。
