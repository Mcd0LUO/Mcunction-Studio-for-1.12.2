# Change Log

All notable changes to the "mcfunction-studio-for-1-12" extension will be documented in this file.

# [1.6.11]

### 修复：参数填完后按空格，上一个参数的候选仍混进来

`scoreboard players tag @e[r=6,tag=enemy] ` 会返回 **9 项** ——
实体选择器（`@a`/`@p`/`@r`/`@s`/`@e`/`*`，以及来自 `fakePlayers()` 的假玩家名）
和正确的子命令（`add`/`remove`/`list`）混在一起。

影响面不止这一条，所有「选择器/参数 → 子字面量」的写法都中招：

| 写法 | 修复前 | 修复后 |
|---|---|---|
| `scoreboard players tag @a ` | 9 项（含 6 个选择器） | 3 项 |
| `title @a ` | 12 项（含 6 个选择器） | 6 项 |
| `advancement grant @s ` | 11 项（含 6 个选择器） | 5 项 |

根因在 `suggest()`：`walk()` 把 `@e[...]` 消费进 `<entity>` 之后
`consumedRealToken = true`，于是引擎以为"用户正在编辑这个参数"，
把该参数**自身**的候选值也吐了出来。而末尾的空 token 让前缀过滤失效
（前缀是空串，全匹配），选择器就全冒出来了。

现在按「末尾恰有一个空 token」判断光标是否已越过该参数：
越过时撤掉该参数自身的候选，只留子字面量。

### 修复：方括号已闭合仍弹括号内参数名

`kill @a[r=6]`（光标在 `]` 之后）会弹 24 个参数名
（`score`/`tag`/`team`/`r`/`x`/`y`/`z`/`type`…）。
`selectors()` 只看 token 是否以 `]` 结尾，却把 `r=6]` 当成待补的参数列表。

**但单纯加「以 `]` 结尾就返回空」会误杀另一种情况**：
`kill @a[type=zom]` 光标在 `zom` 之后、`]` 之前时，token 同样以 `]` 结尾。
所以改成**按光标位置**判断：光标在 `]` 之前才是「括号内」。

为此给 `SuggestContext` 加了 `cursorCharacter`，由引擎在
`complete()` 期间传入（`CompletionContext` 本身没有光标字段，
`dispatch()` 的 position 只是参数，suggest 工厂拿不到）。

### 测试
- engine 套件 104 → 110 passing：
  上述三类「参数已填完」写法各一条、光标仍在选择器 token 上时仍给候选、
  光标在括号内仍给括号内候选、括号闭合后不弹参数名。
- Node 侧合计 16 + 110 + 303 + 31 + 12 = 472 passing，lint 0 error；e2e 22。

# [1.6.10]

按 wiki（**Scoreboard#Command reference**，rev 1215518 / 2018-05-26）重查
scoreboard 语法与诊断，查出 4 个问题。

> 注意：`Commands/scoreboard` 页只有一行转述，真表格在 `Scoreboard` 页。

### 修复：`players tag … add` 被当成引用，新增标签一律误报「未定义」
- `scoreboard players tag @s add <tagName>` 是**定义**（把标签加到实体上），
  符号抽取器也把它记成 definition —— 但诊断规则把 `add` 和 `remove` 一起查了
  「是否存在」，于是**每写一个新标签都会报「标签 X 未定义」**，语义完全反了。
- `remove` 移除不存在的标签确实会失败（wiki 的成功条件），保留为 hint。

### 修复：objectives 显示名把 `<criteria>` 也算进去了
- 两种写法的显示名起点**不同**：
  ```
  scoreboard objectives add <name> <criteria> [display name...]   ← criteria 在中间
  scoreboard teams add      <name>            [display name...]
  ```
  规则一律用 `t.slice(4)`，于是 objectives 把 criteria 也算进显示名 ——
  `scoreboard objectives add foo dummy <32 字符>` 会被误报超长。
- 现在按命令分别取 `t.slice(5)` / `t.slice(4)`。

### 修复：队伍名超 16 字符不报
- wiki 原文（teams add）："''name'' must not be used by an existing team,
  **and must be at most 16 characters**" —— 与目标名上限相同，
  但此前只查了 `objectives`。

### 修复：队伍显示名超 32 字符不报
- wiki 原文：teams add 的 display name 同样限 32 字符，此前完全没查。

### 顺带核对（无问题）
- 命令树与 wiki 的 27 种形式逐条一致，含
  `players list [entity]`、`teams list [teamname]`、`teams leave [entities...]`
  （这三行在 wiki 里用的是另一套标记，容易漏读）。
- int32 边界（±2147483647/8）正负两侧都正确。

### 新增测试
- `src/test/diagnostics/scoreboard-syntax.test.ts`，68 条：
  wiki 的 27 种写法逐条断言"零诊断"，定义/引用角色，四种长度上限的
  边界（16/17、32/33），13 种未定义引用，int32 边界。
- 诊断套件 235 → 303 passing。Node 侧合计 16 + 104 + 303 + 31 + 12 = 466。

# [1.6.9]

把**符号抽取**也做成穷举核验表（此前只有命令语法有），又查出两处漏洞。

### 新增：`src/test/symbols/symbol-table.test.ts`
命令 × 期望符号的核验表，96 条。期望值按 wiki 人工写出，不是从实现反推。
符号抽取是 References（Shift+F12）与 Rename（F2）的**唯一数据源** ——
抽漏一个位置，表现就是"重命名改了一部分、漏了一处"，
数据包改完是坏的而且**没有任何报错**。这类缺陷只能靠穷举发现。

### 修复：`stats … set <stat> <selector> <objective>` 的 objective 从未被抽
- 那个 `<objective>` 是记分板引用，重命名记分板目标时这一处会被漏改。
- 注意 `t[1]` 是字面量 `entity`/`block`，所以下标要多数一个
  （entity 形式在下标 6，block 形式在下标 8）。

### 修复：`entitydata {Tags:[…]}` 的标签定义从未被抽
- NBT 里的 `Tags:[...]` 是**标签定义**，但此前只处理 `summon`，
  且**写死下标 5** —— `summon creeper`（无坐标）的 NBT 也抽不到。
- 现在改为从参数区找第一个含 `Tags:[` 的 token，`summon` 与 `entitydata` 共用。

### 顺带确认（本次核验排除的疑点）
- `scoreboard players tag … remove` 记为 `reference` 而非 `definition` ——
  它引用一个已存在的标签，不是定义。`fake_player` 一律 `reference`
  （抽取是逐行的，无法判断哪次是首次出现）。
- 这两个 `role` 值目前**对行为没有任何影响**：`resolveSymbol` 两种角色都收，
  References 与 Rename 都不按角色过滤。定义跳转（Ctrl+Click）走的是
  `McFunctionDefinitionProvider` 那套独立的正则实现，不用符号层。
- 10 个测试文件**全部已接线**到某个 runner，没有静默遗漏。

### 测试
- 诊断/符号套件 139 → 235 passing（核验表 96 条）。
- Node 侧合计 16 + 104 + 235 + 31 + 12 = 398 passing，lint 0 error；e2e 22。

# [1.6.8]

**选择器参数位表基本全错** —— 这比 1.6.7 修的进度索引问题严重得多。

### 修复：`selectorPositions` 的位置表
- 该表此前写成「目标在下标 2 的一批实体命令」，而实际上**只有 `gamemode` 的目标真在下标 2**：
  `effect <player> …`、`give <player> …`、`execute <entity> …`、`title <player> …`
  等目标都在下标 1。实测 17 条命令里 **15 条抽不到选择器谓词**。
- 后果：`@a[tag=x]`、`@a[score_obj=1]`、`@a[team=red]` 这类引用
  **根本不进索引** —— Shift+F12 搜不到，重命名标签/队伍/记分板时这些引用全被漏改，
  改完数据包就是坏的。
- 现已逐条对照 wiki（各 `Commands/<name>` 页 2018-05 修订）的 Java Edition 语法重写，
  并为「目标位置随可选参数漂移」的命令（`tp`/`teleport`/`particle`/`spreadplayers`）
  与子命令形态（`scoreboard`/`stats`）分别列出位置。
- 顺带修正：`testforblock`/`testforblocks`/`summon` 此前被塞了并不存在的选择器位；
  `stats` 的位置少算了一个（忘了 `t[1]` 是字面量 `entity`/`block`）。

### 修复：`execute` 的外层选择器从未进索引
- `DataLoader.handleSingleLine` 按**活跃命令**分派，会把 `execute` 前缀剥掉：
  `execute @a[tag=x] ~ ~ ~ say hi` 的活跃命令是 `say`，
  于是 `execute` 的处理器**根本不会被调用**，外层选择器永远进不了索引。
- 现在对原始行补一次抽取。新增 `extractOuterSymbols`（只抽本层）——
  若这里也递归进内层，内层符号会被索引两遍，而 `LineIndex.appendEntries`
  不去重，引用计数会虚高。

### 修复：`advancement test` 的进度名从未被抽出
- 提取器与诊断规则都只处理 `grant|revoke`，而 wiki 的 `test <player> <advancement>`
  里进度名在下标 3。于是 `advancement test @s ns:foo` 的引用既不进索引、
  缺失时也不会被 `resource/undefined-advancement` 报出。

### 修复：`execute` 内层命令的符号抽不出来
- `extractSymbols` 的所有分支都是 `t[0] === '<命令>'`，
  `execute … function ns:x` 的 `t[0]` 是 `execute`，内层符号一个都抽不出来。
  References / Rename 会**重新抽取原行算列区间**，抽不到就整条丢弃 ——
  重命名时行首的引用改了、`execute` 里那处漏掉。现已递归抽取并回补列偏移。

### 测试
- 符号层 +13：选择器参数位按命令分组（下标 1 / 下标 2 / 漂移位置 / 子命令形态）、
  无选择器命令的负例、`advancement test`、`execute` 内层符号与角色隔离。
- e2e 22 项（原 17）：新增「重命名改掉选择器内的引用」——
  用此前抽不到谓词的 `effect`/`give`/`execute` 验证端到端。

# [1.6.7]

修复重命名功能的残缺：**六种符号里有两种不能用**，另有一处让 `execute` 内层引用被漏改。

### 修复：进度引用从未进入索引
- `IndexedStore` 没有 `addAdvancementRef`，`MinecraftExtractor` 的 switch 也
  没有 `advancement` 分支（落到 `default: break` 被静默丢弃）。
  后果不止重命名 —— **Shift+F12 查找引用对进度一直返回空**。
  提取器本身没问题（`extractor.ts` 会产出 advancement 符号，
  `resource/undefined-advancement` 诊断也正常），断的是"提取结果 → 索引"这一环。
- 新增 `DataType.Advancement` 与 `addAdvancementRef`，`advancement` 命令挂上抽取器。
- `INDEX_CACHE_VERSION` **4 → 5**：旧缓存没有进度条目，
  加载后 References / Rename 对进度会静默失效，必须整体重建。

### 新增：function / advancement 重命名**连文件一起改**
- 这两类符号的名字**就是文件路径**（`data/functions/ns/a.mcfunction` → `ns:a`），
  没有"定义行"可改。此前 `function` 被直接拒绝（半吊子改引用会把数据包改坏），
  `advancement` 则既不拒绝也不工作。
- 现在两件事一起做：引用行里的旧资源名替换成新资源名 +
  `WorkspaceEdit.renameFile` 把文件挪到新路径。
- 新名支持两种写法：`ns:new`（完整资源名，可换命名空间/子目录）与
  `new`（只给末段，沿用原命名空间）。
- 安全约束：源文件必须存在；**目标已存在则拒绝**（宁可不动也不覆盖别人的文件）；
  拒绝 `..` 路径穿越；影响文件数超过 200 则拒绝。

### 修复：`execute` 内层命令的符号抽不出来
- `extractSymbols` 的所有分支都是 `t[0] === '<命令>'`，
  而 `execute @s ~ ~ ~ function ns:x` 的 `t[0]` 是 `execute` ——
  内层命令的符号**一个都抽不出来**。
- 索引侧不受影响（DataLoader 按"活跃命令"分派，拿到的是内层命令），
  但 References / Rename 会**用本函数重新抽取原行来算列区间**，抽不到就整条丢弃。
  表现：重命名 `function ns:a` 时，写在行首的引用改了，
  `execute … function ns:a` 里那处漏掉，改完数据包就是坏的。
- 现在递归抽取内层命令并回补列偏移，支持 `detect` 形式与嵌套 `execute`。

### 修复：e2e 夹具跨运行残留
- `.vscode-test.mjs` 的 `e2ePackDir()` 只 mkdir + 覆写，**从不清空目录**。
  上一轮遗留的文件会留在索引里：实测上一轮探针写的文件里也有 `prob_obj`，
  本轮重命名因此命中 **2 个文件**而非 1 个，断言失败而原因与被测代码无关。
- 该函数在 VS Code 启动之前执行，删除是安全的 —— 已加整目录清理。

### 测试
- e2e 21 项（原 17）：新增"重命名连文件一起改并更新全部引用"、
  "advancement 引用进索引：查找引用与重命名都可用"、"拒绝覆盖已存在的目标文件"、
  "重命名覆盖 scoreboard / team / tag / fake_player"。
- 符号层新增 7 项：`execute` 内层 function / scoreboard / 选择器引用 / `detect` 形式 /
  嵌套 execute / 半截 execute / `say` 的角色隔离。

# [1.6.6]

**逐命令对照 wiki 原文重查了全部 41 条内置命令**，修正 15 条命令的语法，
并新增一张 122 项的语法核验表把它固定下来。
依据：minecraft.wiki 各 `Commands/<name>` 页在 2018-06-01 之前的最后一个修订
（1.12.2 发布于 2017-09-18，1.13 发布于 2018-07-18，故该时点正文即 1.12.2 语法）。

### 命令语法修正（Java Edition 原文为准）
- `advancement` —— 漏了 `until`（只有 from / through）；`only` 与 `test` 尾巴的
  `[criterion]` 也漏了
- `clear` —— `[data] [maxCount] [dataTag]` 三个参数整个缺失
  （wiki 原文：五个参数**全部可选**）
- `clone` —— 此前写成 maskMode × cloneMode 的两层交叉矩阵，与原文不符。
  原文是**顺序可选**的 `[maskMode] [cloneMode] [TileName] [dataValue|state]`。
  顺带修掉 `.then(...).then(...)` 链在父节点上、导致 `[data]` 成了 `[block]` 兄弟的问题
- `fill` —— 缺 `[dataTag]`；缺 replace 的过滤形式 `replace <replaceTileName> [replaceDataValue]`
  （`outline` 经核对**确实是** 1.12.2 的 oldBlockHandling 取值，不是 1.13 新增，予以保留）
- `gamemode` —— `[player]` 可选，此前写成了必填
- `give` —— 缺 `[dataTag]`
- `particle` —— 四个尾巴参数是**顺序可选**，此前误写成并列选择；
  `[params ...]` 是**变长**的，改用 `greedy`（此前是固定的 `[params] [params2]`）
- `playsound` —— `<source>`（声音频道）整个漏了
- `setblock` / `testforblock` —— 缺 `[dataTag]`
- `spawnpoint` —— `[player]` 与 `[x y z]` 都可选，此前全部写成必填
- `stats` —— `clear` 分支也要接 `<stat>`，此前只写了 `literal('clear')`
- `teleport` —— 原文有五种形式（含 `facing`），此前只有一种；
  `facing` 之后可以是实体也可以是坐标（3 个 token）
- `testfor` —— 缺 `[dataTag]`
- `tp` —— 原文两种形式（`<destination player>` 与 `<x> <y> <z> [<yaw> <pitch>]`），此前只有一种

### 引擎
- `matchChild` 优先级改为 **literal → argument → greedy → forward_root**。
  `setblock`/`fill` 这类命令的尾巴三个参数互相独立，同一个节点下会同时挂
  枚举字面量与并列的 `greedy('[dataTag]')`；greedy 若优先会把 `destroy`、
  方块名一并吃掉，那些分支就永远进不去
- 参数节点无自身候选也无字面子节点时，**向参数子节点下钻**并带上其占位符。
  此前 `particle … <speed> ` 只会返回占位符 `<speed>`，
  而该位置真正要填的是下一级的 `[count]` / mode / `[player]`
- 参数节点的**参数子节点**候选也会一并给出（如 mode 可省略时 `[player]` 的选择器）

### Windows 大小写
- **Windows 文件系统大小写不敏感**：`function NS:foo` 能打开
  `data/functions/ns/foo.mcfunction`，游戏也能执行，不该报"函数不存在"。
  新增 `core/resName.ts`：精确命中优先，未命中时在 win32 上退回忽略大小写比较。
  放宽是单向的 —— `ns:foo` 与 `NS:foo` 同时存在时仍能精确区分。
  （macOS 未纳入：APFS 可格式化成大小写敏感，无法仅凭 `process.platform` 判断。）

### 引擎
- `matchChild` 优先级改为 **literal → argument → greedy → forward_root**。
  `setblock`/`fill` 这类命令的尾巴三个参数互相独立，同一个节点下会同时挂
  枚举字面量与并列的 `greedy('[dataTag]')`；greedy 若优先会把 `destroy`、
  方块名一并吃掉，那些分支就永远进不去
- 参数节点无自身候选也无字面子节点时，**向参数子节点下钻**并带上其占位符。
  此前 `particle … <speed> ` 只会返回占位符 `<speed>`，
  而该位置真正要填的是下一级的 `[count]` / mode / `[player]`
- 参数节点的**参数子节点**候选也会一并给出（如 mode 可省略时 `[player]` 的选择器）
- **`complete([])` 不再静默返回空**。`walk()` 取 `commands[0]` 查根节点，
  空数组时拿到 `undefined` 就直接返回 `[]`。UI 上被补全 provider 的
  `provideRootCompletions` 兜住了（空行与未知命令走那条路），所以长期没暴露；
  但引擎拿到空行就该给根命令列表。现改为空 token 列表直接返回全部根命令
  （带 cursor 时同样设置显式替换区间）。

### 测试
- 新增 **`src/test/dsl/wiki-syntax.test.ts`**：122 项语法核验表，
  逐命令列出 wiki 原文里的每一种合法写法，断言**一条诊断都不能产生**。
  另有一条断言强制该表覆盖全部 41 条注册命令 —— 新增命令忘了补表会直接失败。
- 诊断回归增至 132 项（新增 `core/resName` 大小写策略 6 项）。
- **e2e 的根命令补全断言从 `> 0` 加强到"覆盖全部 41 条"**，并新增前缀过滤用例。
  原先只断言"有结果"，无法发现整体返回空或降级成只有 fastCommands。
- e2e 的"合法文件不被误报"夹具加入 `function NS:good`（大小写不匹配）。

# [1.6.5]

修复 `selector/invalid-score-range`（选择器记分板取值区间）的两处判断错误。

1.12.2 的两个谓词都是**单边**约束：
`score_X=v` 是**上界**（`score <= v`），`score_X_min=v` 是**下界**（`score >= v`）。
二者并存才构成闭区间，同目标出现多个谓词时必须**全部**满足。

### 修复
- **跨目标乱配**：`@a[score_a_min=1,score_b=-1]` 被误报"恒为空集"。
  旧写法只记住"最后一个 min"和"最后一个 max"，于是 a 的下界与 b 的上界
  被拿来比大小（1 > -1）—— 但 a 与 b 是独立目标，各只有一边约束，毫无矛盾。
  现在按**目标名分组**再比较。
- **只看最后一个谓词**：同目标有多个上下界时，后面的松约束会掩盖前面的紧约束。
  例：`@a[score_a_min=30,score_a_min=10,score_a=20]`
  只看最后一个是 min=10、max=20 判为合法；
  但 30 与 10 都要满足 ⇒ 有效下界 30 > 上界 20 ⇒ 区间为空。
  现在取**闭包**：有效下界 = max(所有 `_min`)，有效上界 = min(所有上界)。
  只有单边约束时不构成区间，永远可满足，不报错。

### 改进
- 报错信息现在点名目标并给出闭包来源，例如
  `目标 "a" 的取值区间为空：有效下界 max(score_a_min=30, score_a_min=10)=30
   大于有效上界 score_a=20，该选择器永远不会匹配到实体`

### 测试
- 新增诊断回归 18 项：跨目标、同目标闭包（空/非空）、单边约束、区间退化成一个点。
- e2e 的"合法文件不被误报"夹具加入 `kill @a[score_used_min=1,score_named=-1]`。

# [1.6.4]

**诊断层曾把 `execute` 与 `scoreboard` 大面积误报，本次全部修正。**
两者都逐行对照 wiki 2018-05 修订（1.12.2 已发布、1.13 未发布）核对过：
`Commands/execute`、`Scoreboard#Command reference`。

### 修复
- **每一条 `execute` 都被报两个 error**（最严重的一条）。
  `forward_root` 在树里是叶子节点，引擎无法消费内层命令的参数，
  于是内层命令的每个 token 都被当成"多余 token" ——
  连 `execute @s ~ ~ ~ say hello` 这种完全合法的写法也会被标红两条
  （`多余的参数 "hello"` + `execute 之后的内容无法解析`）。
  现改为：进入 `forward_root` 后，其后的 token **全部属于内层命令**，不再计入 leftover。
- **`execute` 缺少 `detect` 子语法**。
  1.12.2 有两种形式：
  `execute <entity> <x> <y> <z> <command>` 与
  `execute <entity> <x> <y> <z> detect <x2> <y2> <z2> <block> <dataValue> <command>`。
  此前只建模了前者。
- **`/detect` 被错误注册成独立根命令**。Java 1.12.2 **没有** `/detect` ——
  wiki 上 `Commands/detect` 那一页描述的是 Education Edition 的 Agent 命令
  `detect <direction>`（forward/back/left/right/up/down），与 Java 无关。
  该命令文件已删除。
- **`run` 关键字的检查从"有剩余 token 就算错"改为精确识别**。
  只有内层命令的**第一个** token 是 `run` 时才报错（`syntax/execute-run`），
  不再牵连合法的内层命令参数。
- **新增 `syntax/unknown-inner-command`**：`execute @s ~ ~ ~ giv @s stone`
  这类内层命令名拼错能被抓出来（引擎不递归校验内层命令，但至少确认命令存在）。
- **`scoreboard` 命令树缺漏多处**（原文件自己就写着 `TODO: 参数结构待修正`）：
  - `players set/add/remove` 与 `players tag add/remove` 尾巴的 **`[dataTag]`（NBT）**
  - `objectives add` 与 `teams add` 的 **`[display name...]`**（可多词）
  - 整个缺失的子命令：`players list`、`players test`、`teams list`
  - `objectives setdisplay` / `players reset` 的可选参数
  - `teams join <team> [entities...]`（可选且变长）、`teams leave [entities...]`
  - `teams option` 的六个选项及其取值枚举
  - `operation` 的九个运算符改用 literal（此前用 argument+suggest，输入后仍重复提示自身且无法下钻）
- **`teams option` 的选项名是 `friendlyfire`（全小写）**，此前写成 `friendlyFire`，游戏不认。
- **`teams leave @a` 把实体报成"队伍未定义"**。诊断规则按 `t[2] !== 'add'` 就检查
  `t[3]`，而 `teams leave` 根本没有队伍参数（`t[3]` 是实体）。
  现逐个子命令判断 `t[3]` 是否为队伍名。

### 重构
- **`greedy` 节点支持候选提供者**。变长参数需要"既吃掉后续全部 token
  （否则 `set @s obj 1 {a: 1}` 的 `{a:` / `1}` 会被误报），
  又在首个 token 上给补全（`[entities...]` 给选择器列表）" ——
  普通 `ArgumentNode` 做不到前者，故给 `greedy` 也挂上 `suggest`。

### 测试
- `execute` 与 `scoreboard` **首次纳入 1.12.2 命令树基准**（`required`）。
  这两个命令此前完全不在基准里 —— 正是没有基准兜底，上述错误才长期存在。
- 新增 22 项诊断回归（execute 三种形式 + scoreboard 六类）+ 12 项引擎补全断言。
- e2e 的"合法文件不被误报"夹具加入 execute/scoreboard 的上述写法。

# [1.6.3]

### 修复
- **扩展图标尺寸不合法**。`package.json` 的 `"icon"` 指向 `icons/dark.png`，
  而那是 **16×16** 的语言图标 —— 远低于市场要求的 128×128，
  商店页会显示一个模糊的小图。现改指向 `icons/main_icon.png`（128×128）。
- **`icons/main_icon.png` 是无关的水晶图形**（128×128 但从未被引用）。
  现替换为命令方块。

### 变更
- `icons/main_icon.png` 改为命令方块。切分方式：以方块灰面中心 (161,152) 为准，
  取 190×190 的窗口（源图 x=[66,255]、y=[57,246]），再以高质量双三次缩放到 128×128。
  方块灰面占图标的 71%，四周保留源图紫色底。

  窗口边界依据实测：方块灰面为 x=[94,228]、y=[85,219]（135×135），
  该范围内背景像素数为 0；四条边向内一格均为方块灰、向外一格均为投影，
  再外一格才是紫色场 (105,80,193)。190 的窗口完整落在紫色场 x=[34,273] 之内。

`icons/dark.png` / `icons/light.png`（16×16，语言图标）**未作改动**。

# [1.6.2]

### 修复
- **补全会重复插入命名空间**（`function ns:` → `function ns:ns:test`）。
  根因是 `.mcfunction` 的 `language-configuration.json` **从未声明 `wordPattern`**，
  VS Code 于是用默认词法推算补全的替换范围 —— 而默认词法把
  `:` `/` `.` `@` `#` 全当分隔符：
  - `function ns:` 光标在末尾 → 词范围**为空** → 插入即变成 `ns:ns:test`
  - `function ns:a` 光标在末尾 → 词范围只有 `a` → 同样得到 `ns:ns:test`
  - `kill @` 同理 → `@@a`

  现声明 `wordPattern` 覆盖这些字符，并**由引擎显式设置替换区间**（双保险）。

- **参数已输入一半时，参数自身的候选值被吞掉**。
  引擎原先在参数有字面量子节点时直接返回那些字面量：
  输入 `function ns` 只看到 `if` / `unless`，函数名一个都补不出来。
  现按语义区分两类候选 ——
  **参数值候选**替换已输入的前缀，**下一级字面量**插入在光标处。
  这也顺带修正了 `clone <9 坐标>` 处接受 `masked` 会**替换掉第 9 个坐标**的问题。

### 重构
- **删除死代码 `CompletionContext.wordRange()`**。它没有任何调用点，
  且用的正是上面那套不可靠的词法推算 —— 留着只会误导后来者以为补全区间由它决定。

### 测试
- 新增纯函数 `valueSpanAt(lineText, character)`（`core/symbols/extractor.ts`）
  并配 9 项单测：普通 token、含命名空间的 token、选择器内只取值、
  多谓词、空值、坐标、越界夹取。
- e2e 新增 2 项，覆盖「接受候选后不出现 `ns:ns:`」与
  「下一级字面量必须是零宽区间」。后者已反向验证：移除修复后会失败。

# [1.6.1]

### 修复
- **重命名假玩家会写出 `##newname`**。替换区间只覆盖名字本身（不含 `#`），
  而旧逻辑在带 `#` 的位置插入了 `#newname`，叠加原有的 `#` 就成了两个。
  现统一插入裸名，`#` 由原文本保留。e2e 已加回归用例
  （已确认该用例在旧逻辑下确实失败）。
- **名字长度在两处判定不一致**。重命名校验用 `String.length`（UTF-16 码元），
  诊断规则用码点计数 —— 星平面字符（emoji、`𝕏`）会得到不同结论。
  现统一按码点计。
- **重命名对标签、假玩家名误加 16 字符上限**。wiki 只写明了记分板目标与队伍
  的上限（均为 16，显示名 32），标签与假玩家名没有写明。
  用臆测的数字拒绝用户的合法输入比漏报更糟，现只对 wiki 确认过的类型设限。
- **假玩家重命名时输入 `#newname` 会被拒绝**。现在允许 `#` 前缀（校验时剥掉），
  与用户直觉一致。

### 重构
- **新增 `core/symbols/naming.ts`**：把「名字多长算合法、哪些字符不能出现」
  收敛到一处，消除诊断与重命名各写一份导致的漂移。
  长度上限与来源（wiki Commands/scoreboard 2018-05-26 修订原文）写在注释里。
- **`isValidName` 从 `RenameProvider.ts`（import vscode）迁到纯层**。
  它是纯逻辑，却因为住在适配层文件里，迫使符号测试必须引入 vscode mock。

### 测试
- **新增 `npm run test:purity`（16 项）—— 纯净层守卫**。
  与其它 Node 测试的区别只有一点：它注入的是**陷阱**而不是 mock ——
  把 `require('vscode')` 换成抛错，再逐个加载纯层模块。
  两道防线：静态扫描（覆盖未被加载的文件，并锁定适配层豁免集清单）
  + 运行时加载（覆盖传递依赖）。
  已验证该守卫在人为注入 vscode 依赖时会失败，并指出具体文件。

  动机：Node 测试长期依赖 `scripts/vscode-mock.cjs`，而 mock 的完备性是
  持续负担（本周期就因漏补 `registerReferenceProvider`、`WorkspaceEdit` 等
  报过「测试莫名失败」）。纯层真的纯净，它的测试就永远不用跟着 mock 走。

# [1.6.0]

### 新增
- **查找引用（Shift+F12）**。光标停在记分板目标 / 队伍 / 标签 / 假玩家 / 函数 / 进度上，
  可列出跨文件的全部引用位置。区间精确到 token，不高亮整行。
- **重命名（F2）**。跨文件重命名记分板目标、队伍、标签、假玩家，
  同时改掉定义与全部引用，**包括选择器里的 `score_<目标名>=`**。
  - 消息文本（`say total points` 里的 total）不会被误改 —— 按**角色**而非按字符串匹配
  - 假玩家保留 `#` 前缀
  - 拒绝非法名（超 16 字符、含空格或命令分隔符）
  - 不支持函数重命名（改名需同时改文件名，语义不对），显式拒绝而非半吊子处理

### 修复
- **Ctrl+Click 跳转与查找引用对记分板目标、队伍完全失效**。
  `LineIndex` 只写入了 tag / fake_player / function 三类，scoreboard 与 team 从未入索引，
  而 `getLocations()` 的唯一数据源就是它 —— 于是这两类符号既跳不动、也找不到引用。
- **选择器里的引用从未被索引**。索引只覆盖 `scoreboard` / `function` / `summon` 三条命令，
  `kill @a[score_x=1]` 里的引用在索引里根本不存在。现对全部可带选择器的命令抽取引用。
- **重命名会改坏选择器**（新功能自测发现）。`@a[score_shared=5]` 的目标名在 **key** 里，
  若按谓词的 value 定位，改名会把 `5` 换掉。现在区间指向 key 中的目标名。
- **打开数据包根目录时 rootDir 定位失败**。`getRootDir()` 只做「从工作区根逐级向上」查找
  `data`，于是最常见的布局（工作区根就是数据包根、`data` 是子目录）反而失败，
  表现为扩展无反应。现三种布局都支持：工作区是数据包根 / 工作区就是 data / 工作区是 data 的子目录。
- **激活之后才打开数据包目录的用户，功能一直不可用**。`activate()` 时 `workspaceFolders`
  可能尚未就绪，此前只能手动执行「刷新工作区」重试。现监听 `onDidChangeWorkspaceFolders` 自动重试。
- **`scoreboard players operation` 的目标位置取错下标**（诊断与符号抽取均受影响）。
  1.12.2 实为 `operation <targetName> <targetObjective> <operation> <selector> <objective>`，
  两个 objective 在下标 4 与 7，此前误取 3 与 5 ——
  连带导致 `players operation Steve kills += Steve src` 把玩家名 Steve 报成"记分板目标未定义"。
  诊断规则现已改为复用符号抽取器，避免同一套下标在两处各写一遍。

### 重构
- **新增 `core/symbols/` 符号层**。`LineIndex` 只有行号没有列位置，不足以支撑重命名；
  新的抽取器在解析当下即算出字符区间，不给索引增加负担。
  诊断层的记分板引用检查也改为复用它。
- **e2e 测试改为在启动参数里注入真实数据包工作区**（`.vscode-test/e2e-pack`），
  并使用隔离的 `--user-data-dir`。此前 VS Code 会恢复上次会话的工作区，
  覆盖 launchArgs 指向一个已被删除的临时目录，导致索引型用例全部拿不到数据。

# [1.5.2]

### 新增
- **诊断（红线）**。此前扩展只有补全/Hover/跳转，从不告诉用户「你写错了」。新增 15 条规则，覆盖 4 类问题：
  - **语法**：未知命令（1.13+/模组命令）、参数个数超出 1.12.2 语法、`execute` 之后有多余内容
  - **引用**：未定义的记分板目标/队伍/标签/进度、**不存在的 function**（error）、`trigger` 未定义目标
  - **重复定义**：同名记分板目标/队伍被定义多次
  - **取值**：整数超出 32 位有符号范围、记分板目标名 > 16 字符、显示名 > 32 字符、选择器 `score_X_min` > `score_X`（恒为空集）、`c=` 非法

  规则级别可在 `mcfStudio.diagnostics.rules` 逐条调整或关闭（`off`）。
  设计见 [docs/plans/2026-07-20-diagnostics-design.md](docs/plans/2026-07-20-diagnostics-design.md)。

### 修复
- **`/say` 被当成没有参数**。1.12.2 的 `say <message …>` 是**贪婪文本参数**（wiki 原文末尾的省略号），此前定义成了空节点，导致 `say hello world` 里的每个词都被判为多余 token。新增 `greedy` 节点类型（`say` / `title` 的 raw json 参数）。
- **`/kill` 目标被误标为必填**。wiki 原文是 `kill [player|entity]`，1.12.2 中目标**可省略**（缺省为命令执行者，注明 "optional until 1.13"）。此前按必填实现，会把命令方块里的裸 `kill` 判成缺参数。
- **`/title` 的 raw json 参数被当作单 token**。改用贪婪节点。

### 重构
- **命令树基准补齐 `say` / `kill` 条目**并纳入 `required`。此前这两条命令不在基准里，上述两个 1.12.2 语义错误正是因为没有基准覆盖才长期存在。`title` 的 raw json 参数同步按 wiki 原文更新为贪婪。
- **引擎新增 `validate()`**。`walk()` 遇到匹配不上的 token 原本直接 `break` 丢弃，现在把「未消费的 token」作为结构化结果返回（`leftovers` / `reachedLeaf` / `trailing` / `extraOnLeaf` / `missingRequired`），诊断层据此判定语法错误。`complete()` 行为不变。

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