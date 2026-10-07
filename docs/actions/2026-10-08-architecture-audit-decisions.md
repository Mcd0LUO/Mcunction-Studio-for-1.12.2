# 待决策清单 — 1.5.0 架构审计

**日期**: 2026-10-08
**触发**: 5 路并发只读审计（W9374 数据层 / W9375 DSL 引擎 / W9376 架构耦合 / W9377 测试工程 / W9378 功能覆盖）
**性质**: 以下条目需要维护者拍板，**不要自行执行**

---

## D1. 宏（mcmacro）功能：文档与实现严重脱节 🔴

**已证实的事实**（git 证据链 + 发布包交叉验证）：

| 证据 | 结论 |
|------|------|
| `git log --diff-filter=D -- src/macro/*` | 9 个宏文件在 commit `7b23c4d "yaml config"` 中被整体删除 |
| `git grep -i "unfoldMacro\|foldMacro\|mcmacro\|MacroEngine" -- src/` | **0 命中**（仅 `DataLoader.ts:21,128` 的 `IgnorePattern.Macro` 空占位配置） |
| 解包 `mcfunction-studio-1.5.0.vsix` | 仅剩 `extension/syntaxes/mcmacro-language-configuration.json`，无宏代码 |
| `src/extension.ts:53-70` | 只注册 4 条 `mcf-studio.*`，无 unfoldMacro/foldMacro |

**问题**：README.md:53-99 用 47 行详述宏功能，CHANGELOG 1.3.0 将其列为"重磅更新"。用户创建 `.mcmacro` 文件能获得语法高亮，但**永远不会展开**。

**决策选项**：

- [ ] **A. 恢复宏功能** —— 从 `7b23c4d^` 取回 `src/macro/*` 并适配新架构（IndexedStore/LineIndex）。约 1200 行，需重写与已删除依赖的接口
- [ ] **B. 正式废弃并清理文档**（推荐）—— 删除 README 宏章节、CHANGELOG 加废弃条目、`package.json` 移除 `mcmacro` 语言贡献、schema 移除 `IgnorePattern.Macro`、删除语法高亮文件
- [ ] **C. 仅改文档，功能标记为"计划中"** —— 保留 package.json 声明，文案改为"宏功能开发中"

**若选 B**，需一并决定 `syntaxes/mcmacro-language-configuration.json` 的去留。

---

## D2. JumpNode 死代码：删除还是接线？ 🟠

**已证实的事实**（W9375 实测）：

- `JumpNode` 机制约 50 行：`engine.ts:67-72`（walk jump 分支）、`:88-91`（`isLeafWithJump`）、`:114-129`（`jumpSiblings`）、`nodes.ts:92-98`（类定义）、`builder.ts:43`（`jump()` 工厂）
- 遍历全部 42 棵命令树：**reachable jump 节点数 = 0**
- `superexe` / `foreach` 命令文件不存在，全仓仅 3 处注释提及（`nodes.ts:77,87`、`builder.ts:29`）
- `docs/plans/2026-06-29-engine-refactor.md` 的 3 条 jump 验收标准**永久无法勾选**

**决策选项**：

- [ ] **A. 删除**（W9375 建议）—— `superexe` 是 1.13+ EasyCber 私有命令，与本项目 1.12.2 vanilla 定位不符。删除约 50 行，engine 从 241 行降至约 190 行
- [ ] **B. 保留并接线** —— 新建 `superexe.ts` / `foreach.ts` 让机制复活。约 150 行 + 3 条验收测试

---

## D3. `optional` 语义的最终定位 🟡

**已证实的事实**：

- `nodes.ts:27,72` 定义 `optional`，`builder.ts:22-27` 提供 `optional()` 工厂，20+ 命令使用
- `engine.ts` **全文 0 处读取**该字段（walk/suggest 均无 optional 分支）
- `treeShape.ts` **已正确序列化** `optional:true`（W9375 实测 effect 树三级 optional 齐备）
- **W9375 实测补全行为无害**：尾随参数允许停靠，`/effect @p speed 10 1 true` 后仍返回 `["[hideParticles]"]`（多余的幽灵提示，但不阻断）

**注意**：这修正了文档继承的"optional 是核心缺陷"判断——它在**补全体验**上是粗糙的幽灵提示，在**正确性**上无破坏。

**决策选项**：

- [ ] **A. 实现引擎级 optional 支持** —— walk 需支持回溯与 sibling 探测（真正的 Brigadier 风格贪心/回溯）。属引擎能力扩展，工作量大
- [ ] **B. 保留为文档标记** —— 明确 `optional` 仅用于 treeShape 快照/文档生成，补注释说明，补引擎"参数已满则不提示"的小修
- [ ] **C. 删除** —— 清理半实现状态

---

## D4. ~~7 条命令 1.12.2 语法错误~~ **← 本条结论已被推翻，见下方勘误**

> ### ⚠️ 勘误（2026-10-08，经 wiki 核实）
>
> **D4 的核心结论是错的，请勿据此改动代码。**
>
> 原判断依据 worker 的源码比对（未查 wiki）。经查 [minecraft.wiki 1.13 前 execute 页面](https://minecraft.wiki/w/Commands/execute_(old)) 与 [/spreadplayers](https://minecraft.wiki/w/Commands/spreadplayers)：
>
> - `/execute <entity> <x> <y> <z> <command>` —— **1.8 引入，1.12.2 仍然有效**，扩展定义**正确**
> - `spreadplayers <center> <spreadDistance> <maxRange> <respectTeams> <targets>` —— `<center>` 是 vec2、`<respectTeams>` 存在，1.12.2 **正确**；`maxHeight`/`under` 变体是 1.16 才加入，扩展未包含也**正确**
>
> 错误的根源：把 wiki 页面标题里的「**1.13 前**（old）」误读成「1.12 之前」。实际上 1.8~1.12 都用这套语法。
>
> **教训**：Minecraft 版本语法必须查 wiki 的 History 段确认变更版本，不能凭记忆或页面标题推断。
>
> 仍待逐条 wiki 核实的是原表中的：`clone` / `replaceitem` / `stats` / `worldborder` / `particle`，以及缺分支的 `detect` / `entitydata` / `blockdata`。

<details>
<summary>原始（已被推翻的）判断，保留供追溯</summary>

W9378 逐文件核对 42 个 vanilla 命令，声称 **A 类（定义即错）= 7 条**。

| 命令 | 声称的错误定义 | 声称的"1.12.2 正确语法" |
|------|--------------|----------------------|
| `execute` | `<target> <x> <y> <z>`（称为 1.8 前语法） | `as\|at\|if\|unless\|run` |
| `spreadplayers` | `<x> <z> <dist> <range> <respectTeams> <targets>`（称为 1.8 前语法） | `<amountSpread> <spreadDistance> <spreadTargets> [maxY]` |
| `clone` | `masked`/`replace`/`filtered [block]` | maskMode `normal\|skip\|copy` |
| `replaceitem` | 尾部 `[data] [dataTag]`（称为 1.13 NBT 形式） | `[count] [replace...]` |
| `stats` | `clear` / `set <type> <selector> <scoreboard>` | `stats <target> <statistic> <value>` |
| `worldborder` | 含 `literal('get')`（称为 1.13 才有） | — |
| `particle` | `<xd>..<count>` 全标 optional | 前四参数必填 |

</details>

### 4-b. 待核实：`advancement` 跳转正则（W9378 的另一条指控）

W9378 称 `McFunctionDefinitionProvider.ts:259` 的正则用了 1.13 的 `only|from|until|through`，而 1.12 是 `grant|revoke`。**这条同样未经 wiki 核实**，需查 `/advancement` 页面后确认。

---

## D5. 循环依赖的修复范围 🟠

W9375 发现 **六节点循环依赖**（最高架构债）：

```
core/DataLoader → extension → completionProvider/Minecraft → Base → dsl/engine
                → completionProvider/CompletionContext → core/DataLoader
```

**实测后果**：裸 `require('out/core/DataLoader.js')` 抛 `TypeError: CompletionContext is not a constructor`，**必须手工 stub `extension` 模块才能驱动引擎**。这直接导致 engine.ts 零单测覆盖。

另 W9376 统计 `import { rootDir } from '../extension'` 反向依赖共 **5 条**（DataLoader / MinecraftUtils / IndexCache 等）。

**决策选项**：
- [ ] **A. 只解最内层环**（W9375 建议，收益最高）—— `CompletionContext` 改 `import type`（编译后零 require）+ `rootDir` 抽到无副作用的 `core/paths.ts`。约 5 行改动即可让引擎可独立测试
- [ ] **B. 全面重构依赖注入** —— 消除全部 5 条 rootDir 反向依赖 + 双单例。改动大，涉及面广

---

## D6. 约 1400 行死代码的删除 🟢

W9376 + 主会话交叉验证，以下**零外部引用**：

| 模块 | 行数 | 验证方式 |
|------|------|---------|
| `src/utils/nbt/*`（4 文件） | 766 | grep 73 处匹配全在目录内部互引，外部零引用；且被编译进 `out/` 随扩展发布 |
| `src/utils/JsonMsgParser.ts` | 351 | grep 仅 3 处匹配，其中 1 处是 `tellraw.ts:1` 的**注释**提及 |
| `EnumLib` 中 `MinecraftStats` / `MinecraftStatsDetail` / `Enchantments` | 约 90 | 仅在 EnumLib.ts 内部出现 |

**决策**：
- [ ] **A. 删除全部**（约 1400 行）—— 但需确认 nbt 是否为"未来功能预留"（summon NBT 补全曾依赖它，现已改由其他方式实现）
- [ ] **B. 保留 nbt，删除 JsonMsgParser + 3 个枚举** —— 保守方案
- [ ] **C. 全部保留** —— 仅在 README/plan 中标注为未启用模块

---

## D7. `.vscodeignore` / CI / 仓库卫生 🟢 → 已部分执行

**已由本次会话直接修复**（阻断级，无需决策）：

| 项 | 状态 |
|----|------|
| `src/dsl/global/` 空目录导致新克隆 compile 崩溃（ENOENT） | ✅ 已修 —— 提交 `README.md` 占位文件，cpSync 验证通过 |
| `.vscodeignore` 漏配，146 条目中 36 条为垃圾 | ✅ 已修 —— 条目数 146 → **108** |
| **P0-1** 同名 Team/Scoreboard 定义跨文件互删（数据丢失） | ✅ 已修 + 7 条回归测试 |
| **P0-2** `getMaxLine` 在 >13 万行时抛 RangeError | ✅ 已修 + 3 条回归测试 |

**P0-1 修复说明**：根因是 `teams`/`scoreboards` 为 `Map<name, data>` 单值结构，`removeMeta` 无条件 `delete`，而 `_docIndex` 里 a、b 两行都记着同名定义。已在 `IndexedStore` 增加 `_scoreboardDefs`/`_teamDefs` 定义点集合 + `_releaseDef()` 递减释放，并让 `def` 指针在定义点消失时迁移到存活定义点；`importState` 时从 `docIndex` 重建计数（无需改磁盘格式，故未 bump `INDEX_CACHE_VERSION`）。

复现（修复前 → 修复后）：
```
两文件同名 team red → 删 a.mcfunction
  修复前: teams.size 1 → 0（b 的定义被连带删除）
  修复后: teams.size 1 → 1（b 保住），删光才归零
```

**P0-2 修复说明**：`Math.max(...keys())` 展开参数过多会撑爆调用栈，实测阈值约 12.5–13 万行。改为循环取最大值（`LineIndex.ts:148` 与 `IndexedStore.ts:299` 各 3 行）。

**待决策**：

- [ ] **是否加 CI**（`.github/workflows/ci.yml`）—— W9377 列出理由：目前无任何自动化关卡，"克隆即崩"这类问题本可被 CI 第一秒抓住
- [ ] **26 个 vsix 是否移出仓库根** —— 已确认**从未进入 git**（`git ls-files '*.vsix'` = 0），仓库实际仅 287.85 KiB，非体积问题，仅本地发版习惯。建议移到被忽略的 `dist-artifacts/`
- [ ] **是否把 lint 挂进测试脚本** —— 现状 `test:index`/`test:baseline` 只跑 compile 不跑 lint

### D7-b. W9374 列出的其余 P1/P2（本会话未动，待决策）

| # | 级别 | 位置 | 问题 | 建议 |
|---|------|------|------|------|
| P1-3 | 🟠 | `DataLoader.ts:499-512` | **被 `IgnorePattern` 排除的文件，索引成为跨会话永久幽灵**。剔除流程只遍历 `fileMtimes`，而被排除文件不在其中；每轮还写回磁盘，缓存体积单调增长。唯一自愈=手删缓存 | 改为遍历 `LineIndex` 全部文件键与 `getAllFunctionsPaths()` 求差集（需 bump cache version） |
| P1-4 | 🟠 | `IndexedStore.ts:88-99` | **重复定义告警风暴**：50 个文件同名 → 49 次弹窗；且并发解析下定义归属随机漂移 | 告警去重或改 `console.warn` |
| P1-5 | 🟠 | `DynamicDocManager.ts:18-27` | **`onDidCreateFiles` 只加 resName 不建索引**：新建文件在下次 `loadData` 前没有任何标签/记分板索引 | create 分支补 `loadSingleFuncFileByUri` |
| P2-8 | 🟡 | `DataLoader.ts` 4 处 | `require('../dsl/yaml/extractor')` 被空 catch 吞掉；`:625` 在**每行**解析时执行，热路径 | 提为模块顶层惰性求值 + catch 内 `console.warn` |
| P2-9 | 🟡 | `DynamicDocManager.ts:30,49` | 事件过滤规则不一致（languageId vs 后缀）；`forEach(async)` 反模式不等待 | 统一规则 + 改 `for...of` + await |
| P2-11 | ⚪ | `IndexedStore.ts:314,346` | `getTags()`/`getFunctions()` 每次调用重建整张 Map（2 万条下 1.8ms/次），补全热路径高频调用 | 加脏标记缓存 |

---

## D8. 文档漂移的处理原则 🟡

已证实的漂移（详见 `docs/plans/2026-06-29-dsl-auto-register.md` 等）：

| 文档 | 问题 |
|------|------|
| `docs/AGENT.md` | **0 字节空文件** |
| `docs/dsl-guide.md:180-190` | "双轨机制 / 旧 Provider 回退 / CommandRegistry" 在代码中 grep **0 命中**，架构段完全失效 |
| `docs/yaml-command.md:3,293` | 称"即时热重载"，但 `loader.ts:4` 注释明确"不监听文件变更"，`watcher` 字段（`:40`）从未被赋值 |
| `docs/quickstart.md:48` | "覆盖 1.12.2 原版主干 + EasyCber 等扩展" —— EasyCber YAML 已删除 |
| `docs/plans/2026-06-29-dsl-auto-register.md` | 方案 A/B/C 全部未落地，`CompletionEngine.autoScan` 为 `undefined` |
| `docs/plans/2026-06-29-engine-refactor.md` | 验收基于不存在的 `superexe` 命令，真实达成 3/7 |
| README.md:101 | "已知问题: NONE" 失真 |
| 文档称 50 条命令，实际 42 条 | — |

**决策**：
- [ ] **A. 逐份订正为当前事实** —— 工作量适中，但能让文档重新成为可信依据
- [ ] **B. 归档未落地方案为"已归档-未采纳"** —— 保留历史决策痕迹，但标注状态
- [ ] **C. 只修架构性失效段落**（dsl-guide 双轨段、quickstart EasyCber 提及），不动 plan 历史文档

---

## 附：W9374（数据层审计）结论归并

9 条怀疑点以代码事实裁决（**5 证实 / 4 证伪**），2 个 P0 已由本会话修复并加回归测试（见 D7）。

**证伪的怀疑点**（避免后续无谓返工）：

| 怀疑点 | 裁决 | 依据 |
|--------|------|------|
| `addScoreboard` 重名 return 不写 `_docIndex`，会删别人记分板 | **证伪** — `return` 在 `_indexLine` 之前，被拒方不写 `_docIndex` | 真实问题在别处：`rememberFile` 在 return 前已执行；Team 路径确有跨文件互删（= P0-1） |
| `loadSingleFuncFileByDoc(startLine)` 只往后解析会行号错位 | **证伪** — `clearCache:286-291` 把 `endLine` 取 `max(doc.lineCount-1, maxDoc, maxLi)`，恰好覆盖位移区间 | 但它依赖 `getMaxLine`，正是 P0-2 |
| `buildPayload` 写绝对 resName 影响可移植性 | **风险被高估** — `resName`（`ns:func`）本身与路径无关，路径字段已全部相对化 | 实测同一 pack 换机器换盘符完全可移植 |
| fingerprint 的 mtime 精度不够 | **精度足够** — NTFS 两次连续写得到 `...347.46` 与 `...348.69`，亚毫秒且互不相同 | 唯一残留：同 mtime 不同内容（理论上的 1 秒粒度文件系统） |

**W9374 明确标注"不建议动"的地方**（看起来脏但实为合理设计）：

1. **`LineIndex` 引用计数模型本身** —— `count` 与 `locations.size` 并存看似冗余，实则 `count` 支持同行多 Tag，`locations` 供调试与跳转定位
2. **`removeMeta` 的 `default` 分支留空** —— 容易误判为"漏写"，实则正确：Tag/FakePlayer/YAML 的计数本就由 `LineIndex.clearLine` 统一处理，在这里再动会**双重扣减**
3. **`clearCache` 取 `endLine = Math.max(...)`** —— 看似多余，实为行号位移场景的正确性关键；修 P0-2 时**保留这个 max 语义**，只换实现
4. **磁盘缓存的相对路径压缩**（`FileTable`/`toPosixRel`）—— 看着过度设计，实为跨机器可移植性保证，**不要退回绝对路径**
5. **fingerprint 用 mtime 而非内容 hash** —— 改内容 hash 会让冷启动退化为"读全部文件"，与 index-cache 省 I/O 的初衷冲突

**DataLoader God Class 拆分落实度**（对照 `docs/plans/2025-06-28-dataloader-bugfix.md:25-30` 自列的 4 项技术债）：

| 计划项 | 落实情况 |
|--------|---------|
| God Class 拆分 | **1/4** —— DataStore ✅（已抽出 IndexedStore + LineIndex）；ConfigManager ❌（配置读写仍在 `DataLoader:146-198`）；CacheManager ❌（磁盘缓存仍在 `:406-461`）；DataExtractor 部分 ✅（Minecraft/EasyCber 已抽出，YAML extractor 仍是 require 动态调用） |
| `get*Data()` 返回可变 Map 引用 | ❌ 未修（`DataLoader:206-211` 仍直接返回 store 内部 Map，实测可外部污染） |
| 构造函数 fire-and-forget async init | ✅ 已修（改为显式 `init()`） |
| `loadSingleFuncFileByUri/Doc` 重复代码 | ❌ 未修 |

结论：DataLoader 仍是 God Class，682 行承担配置 + 并发 + 扫描 + 解析调度 + 磁盘缓存五责。

**最大架构债（六节点循环依赖）** —— W9375 发现，本会话已精确定位触发点：

```
core/DataLoader → extension → completionProvider/Minecraft → Base → dsl/engine
                → completionProvider/CompletionContext → core/DataLoader

实测 require('out/core/DataLoader.js') → TypeError
根因（比报告更精确）：Base.ts:47 的类字段初始化器
    protected ctx = new CompletionContext(DataLoader.getInstance())
在模块加载期立即执行，此时 DataLoader 因循环依赖尚未完成初始化 → undefined
给足 vscode stub 仍崩溃，确认是循环依赖而非缺 vscode
```

这直接导致 `engine.ts` 无法写单测，是 D5 建议优先解最内层环的原因。
