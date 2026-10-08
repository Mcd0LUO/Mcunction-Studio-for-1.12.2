# Change Log

All notable changes to the "mcfunction-studio-for-1-12" extension will be documented in this file.

# [1.5.1]

### 移除
- **宏（mcmacro）功能已移除**。该功能自 1.3.0 引入后未再维护，宏展开/折叠命令（`mcf-studio.unfoldMacro` / `foldMacro`）与 `mcmacro` 语言支持均已下线。
  - 移除 `mcmacro` 语言贡献与语法高亮；已有 `.mcmacro` 文件不再被识别
  - 配置项 `IgnorePattern.Macro` **仅为兼容旧配置文件保留**，不再生效（旧配置不会因此报错）
  - 函数文件中形如 `#@macro start: ...` / `#@macro end` 的内容为普通注释，可按需手动清理
- **EasyCber 插件支持已下线**。相关 YAML 命令集此前已不存在，本次移除残留的 `EasyCberExtractor`。
  - `/team add`、`/schedule function|repeat|random` 不再产生索引，使用这些命令的数据包将失去对应的定义跳转与补全

### 修复
- **`.mcfunction` 文件不会被识别为 mcfunction 语言**（此问题只有真实 VS Code 才能暴露）。语言贡献仅声明 `extensions: ["*.mcfunction"]`，而 VS Code 1.141 对已注册语言还需要 `filenamePatterns` 才能完成绑定 —— 实际打开 `.mcfunction` 得到的 `languageId` 是 `plaintext`，连带导致扩展不激活、全部功能无反应。现同时声明 `filenamePatterns`。
- **扩展无法激活**。`activationEvents` 是空数组，而 `contributes.languages` 只注册语言、**不触发激活** —— 用户打开 `.mcfunction` 文件时扩展根本不会被加载，补全/Hover/跳转全部无反应。现声明 `onLanguage:mcfunction`。
- **定位数据包目录失败时整个扩展静默失效**。`getRootDir()` 在未打开工作区、或打开的不是数据包时会抛异常，而 `activate()` 未捕获 —— 异常向上冒泡导致激活中断，扩展表现为「完全没反应」。现在照常注册全部 provider（静态补全不依赖项目数据），并给出一次明确提示；「刷新工作区」命令会重试定位。
- **索引 P0：同名定义跨文件互删**。两个文件定义同名 team/scoreboard 时，删除其中一个会连带删掉另一个的定义，导致补全与跳转丢失。现改为按定义点引用计数，并在定义点消失时把跳转指针迁移到仍存在的定义。磁盘索引缓存往返后计数同样有效。
- **索引 P0：大文件编辑崩溃**。`getMaxLine` 在单文件超过约 13 万行时因参数展开过多抛 `RangeError`。已改为逐行比较。
- **新克隆无法编译**。`src/dsl/global/` 为空目录且 git 无法跟踪，`npm run compile` 的拷贝步骤抛 `ENOENT`。已补占位文件。
- **发布包含无关文件**。`.vscodeignore` 遗漏 `docs/`、`scripts/`、`.idea/`、`out/test/` 等，打包条目从 146 降至 108。
- **标签 / 假玩家无法 Ctrl+Click 跳转**。二者此前能被正确识别，却因缺少目标解析分支而落到空返回。现按引用位置跳到首次出现处；`scoreboard players set #fp <obj>` 中按住 Ctrl 点击 `#fp` 也会跳到假玩家的写入位置。
- **`/effect <player> ` 补不出 `clear`**。`clear` 是 `<target>` 的兄弟字面量分支，此前补全只运行参数自身的 suggest，用户无法发现该分支。
- **`/weather clear` 重复提示自身**。枚举参数误用 `argument` + suggest 写法，导致输入关键字后仍被提示同一组选项、且无法下钻到 `[duration]`。改为显式 literal 分支。
- **重复定义弹窗刷屏**。大包首次加载时同名记分板可能弹几十次窗，现每个名称只提示一次，其余仅记日志。
- **新建函数文件不建立索引**。`onDidCreateFiles` 此前只登记资源名不解析内容，新建文件在下次刷新前没有任何标签/记分板索引。现补上解析；批量重命名的 `forEach(async)` 改为可等待的 `for...of`。
- **YAML 自定义数据通道静默失效**。`DataLoader` 中 4 处 `require` 被空 `catch` 吞掉，模块加载失败时完全无日志。已收敛为单一惰性访问器并在首次失败时报错。
- **`/execute` 补出错误的 `run` 关键字**。1.12.2 的 `execute <entity> <x> <y> <z> <command>` 第 5 个参数直接就是命令，并不存在 `run`（那是 1.13+ Brigadier 语法）。此前引擎在遇到 `forward_root` 节点时会硬编码插入一个 `run` 补全项，导致用户可能写出无法执行的命令。现已移除。
- **`/clone` 缺失 cloneMode 与数据值**。1.12.2 语法为 `clone <9 个坐标> [maskMode] [cloneMode] [TileName] [dataValue]`，此前缺失 `[cloneMode]`（`force|move|normal`，1.8 即引入）与尾部 `[dataValue]`（0–15），且 `filtered` 的 `<block>` 位置有误。现已补齐全部三种模式分支。
- **`/particle` 必填参数被误标为可选**。`<xd> <yd> <zd> <speed>` 在 1.12.2 中均为必填（1.13 起才允许省略），此前全部标成 `optional`；同时 `[mode]` 实际可选，此前把 `[player] [params]` 只挂在 `normal`/`force` 分支下，等于把 mode 变成必填。现已按 1.12.2 语义重写，`[params ...]` 支持变长（`iconcrack` 收 2 个）。
- **调试或测试时补全会静默失效**。`CompletionEngine` 原先在构造函数里覆盖静态字段，导致 `new` 第二个引擎（调试、热重载、单元测试）会把扩展正在使用的引擎替换成空的——实测补全项从 3 项掉到 1 项且无任何报错。现改为由装配点显式 `setCurrent()`，构造不再有副作用，`deactivate()` 也会释放引用。
- **音效补全每次按键重建 549 个对象**。`soundNames` 是唯一漏掉懒加载缓存的静态枚举（`items`/`blocks`/`entityTypes` 早有缓存）。实测 `/playsound` 单次补全从 **50.9 µs 降到 3.7 µs**，且仍返回完整 549 项。

### 重构
- **断开循环依赖**。`rootDir` 的持有者从 `extension.ts` 迁至新增的 `core/paths.ts`，`DataLoader` / `IndexCache` / `MinecraftUtils` / `CodeLens` / `DynamicDocManager` 不再反向依赖装配点。此前 `require` 数据层会因 `Base` 的类字段初始化器提前执行而崩溃，现在各模块可独立加载，为引擎单测铺平了道路。
- 补全引擎：合并 argument 与其兄弟 literal 的补全项；`SuggestContext` 构造收敛为一处（此前重复 3 次）；改用只读访问器取代私有字段的下标穿透。
- **移除死代码约 1369 行**：`JumpNode` 机制（其服务的 `superexe`/`foreach` 属于已下线的 EasyCber）、未被引用的 `utils/nbt/*` 与 `JsonMsgParser`、`EnumLib` 中三个零引用枚举。YAML 里若写 `jump` 现在会明确报错而非静默失效。

### 索引缓存
- **磁盘缓存语义升级至 v4**。此前指纹只覆盖扫描结果（受 `IgnorePattern` 过滤），被排除文件的索引不参与校验 → 幽灵索引跨会话永久存活并被反复写回磁盘，缓存体积单调增长。现改为以索引的真实文件键（`LineIndex.indexedFiles()`）为剔除依据，且在缓存恢复后同样执行剔除——缓存内从此不可能存在幽灵条目。**旧缓存会失效重建一次**。

### 性能
- `npm run bench:perf -- --quiet` 提供轻量负载（L 规模降为 200 文件、采样轮数与补全次数减半），避免高负载跑基准时风扇噪音。

### 构建
- 发布产物不再保留源码注释（`tsconfig` 启用 `removeComments`）。`out/**/*.js` 体积从 433 KB 降到 368 KB（**-15.1%**，注释行 1039 → 80）。sourceMap 仍在本地产出供调试使用，且已由 `.vscodeignore` 排除、不进发布包。

### 测试
- 新增 `npm run test:engine`：45 条测试 = 37 条补全引擎行为（matchChild 优先级、argument 合并兄弟 literal、枚举分支下钻、walk token 消费、forward_root 转发、`clone`/`particle` 的 1.12.2 语法保真、JumpNode 移除、全局引用隔离、健壮性）+ 8 条激活冒烟（`activationEvents` 声明、正常数据包工作区的定位与索引、异常环境优雅降级、deactivate 释放引用），此前 `engine.ts` 与扩展激活路径均零断言覆盖
- 新增 12 条索引回归用例（同名定义引用计数、缓存往返、def 指针迁移、大文件行号、引用位置查询、告警去重、幽灵索引）
- 新增 `npm run test:e2e`：6 条**真实 VS Code 集成测试**（由 `@vscode/test-electron` 在 Electron 宿主中运行），验证语言绑定、扩展激活、补全 provider 注册、命令注册 —— 这些只有真实宿主才能确认，Node + mock 环境完全测不出。
- `syntaxes/language-configuration.json` 补上 Tokenization 规则（此前只有注释/括号/缩进配置，没有任何着色规则，`.mcfunction` 打开后无关键字高亮）。

# [1.5.0] - 2026-7-19 — 稳定版

### 命令（1.12.2）
- `effect` 补齐 `clear` 分支
- `time set` 支持 `day|night|noon|midnight`；`time query` 支持 `daytime|gametime|day`
- `title` 补齐 `clear|reset|title|subtitle|actionbar|times` 参数树
- `scoreboard players remove` 补齐 `<count>`
- 基准测试锁定：`function`（含 if/unless）、`effect`、`time`、`title`、`scoreboard.players.remove`

### 索引与性能
- 索引正确性：LineIndex / 多 Tag / clear 无幽灵引用
- 加载：默认并发 16、mtime 增量跳过、单飞行 loadData
- **磁盘索引缓存** `data/.McfStudio/index-cache.json.gz`（相对路径 + gzip + path|mtime 指纹）
  - 跨会话冷启动可跳过全量解析；改文件或删缓存会自动重建
- 补全热路径：items/blocks 缓存

### 文档
- README：工作区、`.McfStudio`、索引缓存、文档索引
- `docs/quickstart.md`：对齐 1.5.0（缓存、配置默认并发 16、extra_command 路径）

# [1.4.2] - 2026-6-30
- 修复了scoreboard链接不跳转的问题
- 优化了命令节点定义

# [1.4.0] - 2026-6-29
- 底层重构命令调用方式，改为链式节点树，优化性能
- 新增自定义yaml 命令配置，可自定义补全
 
# [1.3.3] - 2026-2-4
### 修复
- 修复了json文本换行预览的混乱bug，现在直接移除了该换行逻辑
- 新增了对json文本translate键的解析支持
- 修复了json文本组件解析时 样式代码作用域异常继承的问题

# [1.3.2] - 2026-2-2
### 修复
- 修复了 trigger 命令 未筛选‘trigger’型记分板的bug
- 修复了 advancement 进度文件不会动态更新到全局资源池的bug

# [1.3.1] - 2026-1-31
### 更新
- 更新了快速根命令 'tag' 按下补全 tag 即可快速插入 scoreboard players tag
- 完善了宏定义的文档教程

# [1.3.0] - 2026-1-30
### 重磅更新
- 添加了自定义宏语言mcmacro, 语法详见技术文档 (支持宏展开|宏折叠)  | BETA TEST
  - **[已于 1.5.1 移除]**
### 更新
- 新增配置项: IgnorePattern.Macro（[已于 1.5.1 移除，仅保留旧配置兼容]）| AutoRenameFunctionReference.AutoRenameFunctionReference 详细介绍请悬浮鼠标在配置中查看
### 修复
- 修复了重命名函数
- 修复了复制进工作区的文件不会自动解析的bug

# [1.2.1] - 2026-1-23
### 修复
- 修复了detect子命令后命令参数补全失效的问题

# [1.2.0] - 2026-1-22
### 更新
- 现在summon 命令支持对nbt内的Tags进行补全

# [1.1.13] - 2026-1-22
### 更新
- 添加了 testfor|testforblock|testforblocks 的补全支持
### 修复
- 修复了fill 命令错误的补全item的bug(应为block)


# [1.1.12] - 2026-1-21
### 修复
- 修复了输入了score_后不弹出记分板补全的bug


## [1.1.11] - 2026-1-20
### 修复
- 修复了假玩家名无法补全的bug
### 调整
- 删除了记分板性能分析
- 移除了仅重载配置，保留了重载并重启扩展

##  [1.1.10] - 2026-1-18
### 修复
- 修复了函数重命名不会更新函数资源池的bug

## [1.1.9] - 2026-1-18
### 修复
- 为scoreboard 的 operation 补充了 "=", "><" 运算符

## [1.1.8] - 2026-1-9
### 优化
- 优化了存档结构解析逻辑，更具有鲁棒性，现在可以兼容任何合理的存档函数结构辣！！！
- 删除了resolve函数的报错，避免占据大批量控制台空间。

## [1.1.7] - 2025-12-30
### 更新
- 更新了对scoreboard players enable|list|test , playsound , stopsound的支持
### 修复
- 修复了gameLoopFunction的大小写问题与其后函数的跳转问题


## [1.1.6] - 2025-12-29
### 更新
- 添加了命令difficulty, clone, enchant的支持
- 修复了trigger <记分板> 链接失效问题
- 完善了gamerule可选项
### 变更
- 暂时删除了选择器诊断

## [1.1.5] - 2025-12-20
### 更新
- 支持了较小范围的原始json消息文本补全，需在引号内按ctrl + space 触发补全


## [1.1.4] - 2025-12-19
### 更新
- 完善了配置文件的IgnorePattern部分
- 新增了鼠标悬浮 scoreboard | function 快速查看信息


## [1.1.3] - 2025-12-16
### 更新
- 函数补全新增 "THIS" 补全当前函数
- 新增了快捷当前函数记分板debug功能 (右键菜单-插入快速记分板debug)


## [1.1.2] - 2025-12-2
### 修复
- 修复了新增函数不会添加到函数池的问题
- 修复了加载提示
### 更新
- 配置文件 McfunctionStudio.json

## [1.1.1] - 2025-12-2
### 更新
- 更新了一键重命名函数，可自动更改函数调用
- 优化了函数逻辑，加强并发
### 修复
- 修复了插件无法运行的bug
### 已知问题
- 加载提示有误

## [1.1.0]
### 更新
- 动态加载新创建的scoreboard|tag|data|team  [之前仅在打开工作区时加载一次]
- 合并了旧插件的json预览功能

## [1.0.1] 更新测试
- 更换icon

## [1.0.0]
- 完成基本命令补全 #除json文本组件补全
- 完成定义跳转 (ctrl + 点击)