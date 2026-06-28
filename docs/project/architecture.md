# 架构设计

## 现有架构（v1.3.5 | 重构前）

```
src/
├── extension.ts                  # 插件入口，注册所有 Provider
├── core/                         # 核心模块
│   ├── CommandRegistry.ts        # 命令 Provider 注册表（动态 import）
│   ├── DataLoader.ts             # 数据加载器（函数/进度/宏 文件解析）
│   ├── Signature.ts              # 签名帮助
│   ├── CodeLens.ts               # 配置文件 CodeLens
│   ├── McFunctionDefinitionProvider.ts  # 定义跳转
│   ├── HoverProvider.ts          # Hover 信息
│   ├── DynamicDocManager.ts      # 文件变更监听与缓存管理
│   ├── LinePreviewManager.ts     # JSON 文本行内预览
│   └── VsCommandProcessor.ts     # VS Code 命令处理
├── completionProvider/           # 代码补全
│   ├── Base.ts                   # 补全基类
│   ├── Minecraft.ts              # 顶层补全入口（根命令列表）
│   ├── macro/                    # 宏补全
│   └── command/                  # 48+ 个命令补全 Provider
│       ├── Scoreboard.ts
│       ├── Execute.ts
│       ├── Tellraw.ts
│       ├── Function.ts
│       ├── ... (45+ more)
├── macro/                        # 宏系统
│   ├── MacroTokenizer.ts         # 词法分析器
│   ├── TokenStream.ts            # Token 流
│   ├── CharStream.ts             # 字符流
│   ├── MacroAST.ts               # AST 构建器
│   ├── MacroManager.ts           # 宏注册表
│   ├── MacroApply.ts             # 宏展开/折叠核心
│   ├── MacroDefinitionProvider.ts # 宏定义跳转
│   └── ASTVisualizer.ts          # AST 可视化
└── utils/                        # 工具
    ├── CommandUtils.ts           # 命令解析（split/extract/findActiveCommand）
    ├── MinecraftUtils.ts         # Minecraft 资源路径工具
    ├── EnumLib.ts                # 枚举库（方块/物品/实体/粒子/声音...）
    ├── JsonMessageUtils.ts       # JSON 消息处理（tellraw）
    ├── JsonMsgParser.ts          # JSON 消息解析器
    ├── nbt/                      # NBT 解析
    │   ├── NbtTokenizer.ts
    │   ├── NbtAst.ts
    │   ├── NbtAstNode.ts
    │   └── NBTUtils.ts
    └── StringBuilder.ts          # 高性能字符串构建器
```

## 核心设计缺陷

### 1. 命令补全缺乏声明式定义
每个命令的补全逻辑用大量 if/else 嵌套在 `provideCommandCompletions` 中手写，无法从代码中直接看出命令结构。

**示例（Scoreboard.ts）：**
```typescript
if (commands.length === 3) { return [...] }
if (commands[1] === "objectives") { ... }
else if (commands[1] === "players") { ... }
// 6 层嵌套 if/else，数百行代码
```

### 2. 动态导入脆弱
`CommandRegistry.autoRegisterProviders` 通过 `import('completionProvider/command/' + file)` 动态加载，依赖文件名约定 `${Name}CompletionProvider`，TypeScript 编译后路径不同。

### 3. 单例滥用
`DataLoader`、`MacroManager`、`MinecraftCompletionProvider`、`McFunctionDefinitionProvider` 等使用单例模式，全局可变状态难以测试和推理。

### 4. 关注点混乱
`DataLoader` 同时负责文件发现、内容解析、数据提取、缓存管理、配置加载——违反单一职责原则。

### 5. 缺乏测试架构
无单元测试，核心逻辑（命令解析、宏展开、补全生成）不可验证。

## 目标架构（v2.0 | 重构后）

采用**命令 DSL 驱动**的分层架构：

```
src/
├── extension.ts                  # 入口：注册 DSL 命令树
├── dsl/                          # 命令 DSL（核心创新）
│   ├── api/                      # 链式 API
│   │   ├── RootCommand.ts        # buildRootCommand()
│   │   ├── SubCommand.ts         # buildSubCommand()
│   │   ├── Flag.ts               # buildFlag()
│   │   ├── Option.ts             # buildOption()
│   │   ├── Positional.ts         # buildPositional()
│   │   └── CommandContext.ts     # 命令上下文
│   ├── registry/                 # 注册表
│   │   └── CommandRegistry.ts    # registerCommand()
│   ├── completion/               # DSL → CompletionItem 生成器
│   │   └── CompletionEngine.ts   # 自动从命令树生成补全
│   ├── signature/                # DSL → SignatureHelp 生成器
│   │   └── SignatureEngine.ts    # 自动从命令树生成签名帮助
│   └── types/                    # DSL 类型定义
│       └── types.ts
├── commands/                     # 命令定义（DSL 描述）
│   ├── _defs/                    # 所有命令在此用 DSL 声明
│   │   ├── scoreboard.ts
│   │   ├── execute.ts
│   │   ├── tellraw.ts
│   │   ├── function.ts
│   │   └── ... (48+ commands)
│   └── index.ts                  # 汇总并注册所有命令
├── core/                         # 核心服务
│   ├── loader/                   # 数据加载（拆分 DataLoader）
│   │   ├── FileDiscoverer.ts     # 文件发现
│   │   ├── FunctionParser.ts     # 函数文件解析
│   │   ├── MacroParser.ts        # 宏文件解析
│   │   └── ConfigLoader.ts       # 配置加载
│   ├── workspace/                # 工作区管理
│   │   ├── WorkspaceIndex.ts     # 资源索引（记分板/标签/队伍/函数）
│   │   └── DocWatcher.ts         # 文档变更监听
│   ├── definition/               # 定义跳转
│   │   └── DefinitionProvider.ts
│   ├── hover/                    # 悬停信息
│   │   └── HoverProvider.ts
│   ├── preview/                  # 文本预览
│   │   └── LinePreview.ts
│   └── codelens/                 # Code Lens
│       └── ConfigCodeLens.ts
├── macro/                        # 宏系统（保留，优化）
│   ├── Tokenizer.ts
│   ├── AST.ts
│   ├── Manager.ts
│   ├── Expander.ts
│   └── DefinitionProvider.ts
├── resources/                    # 游戏数据（拆分 EnumLib）
│   ├── blocks.ts
│   ├── items.ts
│   ├── entities.ts
│   ├── sounds.ts
│   ├── particles.ts
│   ├── enchantments.ts
│   ├── stats.ts
│   └── index.ts
├── utils/                        # 工具
│   ├── command-parser.ts         # 命令文本解析（精简自 CommandUtils）
│   ├── minecraft-path.ts         # 路径工具（精简自 MinecraftUtils）
│   ├── nbt/                      # NBT 解析
│   └── string-builder.ts
└── types/                        # TypeScript 类型
    └── index.ts
```

## 命令 DSL 设计

DSL 提供 Builder Pattern 的链式调用接口，将 Minecraft 命令的树形语法结构映射为可遍历的命令树节点：

```
MC 命令语法               DSL 映射
──────────────────────────────────────────────
scoreboard                → buildRootCommand("scoreboard")
  objectives              →   .subcommand(buildSubCommand("objectives"))
    add <name> <type>     →     .subcommand(buildSubCommand("add")
                                      .positionalArg(name)
                                      .positionalArg(type))
    remove <name>         →     .subcommand(buildSubCommand("remove")
                                      .positionalArg(name))
  players                 →   .subcommand(buildSubCommand("players"))
    add <target> <obj>    →     .subcommand(...)
    set <target> <obj>    →     .subcommand(...)
    ...
```

**完整 DSL API 设计：**

```typescript
// 根命令节点
buildRootCommand(name: string)
  .description(desc: string)
  .flag(flag: FlagBuilder)         // 全局 flag
  .subcommand(sub: SubCommandBuilder) // 子命令
  .build(): RootCommandNode

// 子命令节点
buildSubCommand(name: string)
  .desc(desc: string)
  .flag(flag: FlagBuilder)
  .option(opt: OptionBuilder)
  .positionalArg(pos: PositionalBuilder)
  .subcommand(sub: SubCommandBuilder)  // 递归嵌套
  .build(): SubCommandNode

// 参数类型
buildFlag(name: string)      // 布尔标志，如 -v / --verbose
buildOption(name: string)     // 键值选项，如 -m "msg" / --message "msg"
buildPositional(name: string) // 位置参数
  .required(true)
  .suggest(provider: SuggestFn)  // 绑定补全建议来源

// 注册
registerCommand(root: RootCommandNode)
```

补全引擎遍历命令树：匹配用户输入路径 → 收集当前节点的所有可能的子节点（子命令/参数/标志/选项）→ 转换为 `vscode.CompletionItem[]`。

签名引擎同理：匹配当前路径 → 收集参数列表 → 转换为 `vscode.SignatureHelp`。
