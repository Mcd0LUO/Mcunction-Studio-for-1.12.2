# YAML 命令定义方案 — 2026-06-29

## 动机

目前新增命令需要改扩展源码 + 编译。**外部数据包作者**无法为自己的自定义命令（EasyCber 等插件）添加补全支持。

目标：**数据包作者在项目里丢一个 YAML 文件即可为自定义命令提供补全，无需碰扩展源码。** 同时也服务于扩展内置命令的定义（替代手写 TypeScript）。

## 加载路径（外部拓展优先）

扩展启动时按顺序扫描：

```
1. <workspace>/data/commands/*.yml        ← 数据包作者放这里
2. <workspace>/.mcf/commands/*.yml        ← 备选路径
3. <extension>/builtin/commands/*.yml     ← 扩展内置（编译时打入 out/）
```

同名命令**用户定义覆盖内置**，方便数据包作者覆写原版命令的补全行为。

## YAML 节点模型

三种节点对应 DSL 的三种类型：

```yaml
# 字面量节点：精确匹配关键字
literal:
  name: add            # 关键字文本
  description: 添加    # 可选描述
  children: [...]      # 子节点

# 参数节点：消费一个输入位置
argument:
  name: <target>       # 参数名（展示用）
  suggest: selectors   # suggest 函数名（省略则占位）
  optional: false      # 可选参数
  children: [...]      # 后续节点

# 转发节点：execute run 场景
forward: true          # 转发到根命令
```

## 命令文件示例

### `effect.yml`

```yaml
command: effect
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <effect>
            suggest: effects
            children:
              - argument:
                  name: <duration>
                  suggest: placeholder
                  optional: true
                  children:
                    - argument:
                        name: <amplifier>
                        suggest: placeholder
                        optional: true
                        children:
                          - argument:
                              name: <hideParticles>
                              suggest: placeholder
                              optional: true
```

### `tp.yml`

```yaml
command: tp
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <destination>
            suggest: selectorsOrCoords
```

### `weather.yml`

```yaml
command: weather
children:
  - argument:
      name: <type>
      suggest: weatherTypes
      children:
        - argument:
            name: <duration>
            suggest: placeholder
            optional: true
```

### `scoreboard.yml`（简化片段）

```yaml
command: scoreboard
children:
  - literal:
      name: objectives
      children:
        - literal:
            name: add
            children:
              - argument:
                  name: <name>
                  suggest: scoreboards
                  children:
                    - argument:
                        name: <criteria>
                        suggest: criteria
        - literal:
            name: remove
            children:
              - argument:
                  name: <name>
                  suggest: scoreboards
        - literal: { name: list }
        - literal:
            name: setdisplay
            children:
              - argument:
                  name: <slot>
                  children:
                    - argument:
                        name: <objective>
                        suggest: scoreboards
  - literal:
      name: players
      children:
        - literal:
            name: tag
            children:
              - argument:
                  name: <target>
                  suggest: selectors
                  children:
                    - literal:
                        name: add
                        children:
                          - argument: { name: <name>, suggest: tags }
                    - literal:
                        name: remove
                        children:
                          - argument: { name: <name>, suggest: tags }
                    - literal: { name: list }
        - literal:
            name: add
            children:
              - argument:
                  name: <target>
                  suggest: selectors
                  children:
                    - argument:
                        name: <objective>
                        suggest: scoreboards
                        children:
                          - argument:
                              name: <value>
                              suggest: placeholder
```

## suggest 函数映射（内置）

YAML 中用字符串引用，引擎加载时映射：

| YAML 值 | 对应函数 |
|----------|----------|
| `selectors` | `ctx.cc.selectors()` |
| `scoresboards` | `ctx.cc.scoreboards()` |
| `teams` | `ctx.cc.teams()` |
| `tags` | `ctx.cc.tags()` |
| `functions` | `ctx.cc.functions()` |
| `effects` | 静态列表：27 种药水效果 |
| `weatherTypes` | `clear`, `rain`, `thunder` |
| `gameModes` | `survival`, `creative`, `adventure`, `spectator` + 数字 |
| `difficulties` | `peaceful`, `easy`, `normal`, `hard` |
| `criteria` | `dummy`, `trigger`, `deathCount`, ... |
| `operations` | `+=`, `-=`, `*=`, `/=`, `%=`, `>`, `<`, `><`, `=` |
| `teamOptions` | `color`, `friendlyFire`, `collisionRule`, ... |
| `selectorsOrCoords` | selectors + 坐标占位 |
| `coordinates` | `ctx.cc.coordinates()` |
| `items` | `ctx.cc.items()` |
| `blocks` | `ctx.cc.blocks()` |
| `entityTypes` | `ctx.cc.entityTypes()` |
| `placeholder` | 仅展示参数名，不插入内容 |
| `none` | 无补全 |

## 文件结构

```
data/                        ← 随扩展打包，或放在 workspace 的 .vscode/ 目录
├── commands/
│   ├── vanilla/
│   │   ├── effect.yml
│   │   ├── tp.yml
│   │   ├── scoreboard.yml
│   │   └── ...
│   └── easycber/
│       ├── foreach.yml
│       └── ...
└── schema.json              ← YAML 语法校验 schema（可选）
```

或者直接放 `src/dsl/commands/vanilla/*.yml`，编译时复制到 `out/`。

## 加载流程

```
扩展启动
└── YamlCommandLoader.load(engine, context)
    ├── 扫描 data/commands/vanilla/*.yml
    ├── 扫描 data/commands/easycber/*.yml
    ├── 每文件：yaml.parse() → YamlNode → DSL RootNode
    └── engine.register(rootNode)
```

## Yaml → DSL 转换器

```typescript
// src/dsl/yaml/loader.ts
function yamlToDsl(node: YamlLiteral | YamlArgument): CommandNode {
    if ('forward' in node) { return new ForwardNode(); }
    if ('literal' in node) {
        const lit = literal(node.literal.name);
        if (node.literal.description) lit.description = node.literal.description;
        if (node.literal.children) lit.then(...node.literal.children.map(yamlToDsl));
        return lit;
    }
    if ('argument' in node) {
        const suggest = resolveSuggest(node.argument.suggest); // 查表
        const arg = argument(node.argument.name, suggest, { optional: node.argument.optional ?? false });
        if (node.argument.children) arg.then(...node.argument.children.map(yamlToDsl));
        return arg;
    }
    throw new Error('Invalid YAML node');
}
```

## 和现有 TypeScript DSL 的关系

双轨：

```
命令定义来源
├── YAML（data/commands/*.yml）     ← 无需编译，启动加载
└── TypeScript（src/dsl/commands/） ← 编译期检查，复杂逻辑
```

YAML 加载器生成的 `RootNode` 和 TypeScript 手写的 `RootNode` 是同一类型，都注册到 `CompletionEngine`。同名覆盖规则：后注册的覆盖先注册的（YAML 优先或 TS 优先可配）。

## 实施步骤

1. 安装 `js-yaml` 依赖（或手写简单 YAML 解析器，YAML 子集即可）
2. 创建 `src/dsl/yaml/loader.ts` — 扫描 + 解析 + 转换
3. 创建 `src/dsl/yaml/suggests.ts` — suggest 函数名 → 函数映射表
4. 迁移几条简单命令做 YAML 示例
5. `extension.ts` 中调用 `YamlCommandLoader.load()`
6. 可选：JSON Schema 用于编辑时校验

## 依赖

- `js-yaml`（npm）或手写简化解析器
- 文件系统访问：`vscode.workspace.fs` 或 Node `fs`

## 外部拓展 —— 数据包作者使用场景

### 场景

数据包 `my-datapack` 引入 EasyCber 的 `/mytp` 命令：

```mcfunction
# data/functions/test.mcfunction
mytp @a lobby
```

命令语法：`/mytp <target> <location>`

### 数据包作者操作

在数据包根目录创建：

```yaml
# data/commands/mytp.yml
command: mytp
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <location>
            suggest: none
```

F5 重载 → `.mcfunction` 文件中输入 `mytp ` → 弹出 `@a, @p, @r, @s, @e`。

### 热重载

扩展监听 `data/commands/` 目录的文件变更（`vscode.workspace.onDidChangeTextDocument` 或 `onDidCreateFiles`/`onDidDeleteFiles`），YAML 文件变化时自动重新加载，无需手动 F5。

### 错误处理

YAML 语法错误时 → 弹窗提示文件名 + 行号 + 错误原因，不崩溃。

```yaml
# 如果写成这样：
command: mytp
children:
  - argumant:    ← 拼写错误
      name: <target>
```

→ `mytp.yml(3): 未知节点类型 "argumant"，应为 literal / argument / forward`

### 覆盖内置命令

如果数据包想修改 `/tp` 的补全行为：

```yaml
# data/commands/tp.yml  ← 与内置同名
command: tp
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <destination>
            suggest: functions    ← 改成补全函数名而非坐标
```

用户定义的 `tp.yml` 覆盖扩展内置的 `tp` 注册。

## 验收

- 在打开的 workspace 中创建 `data/commands/test.yml` → F5 → 补全生效
- 修改 YAML → 自动热重载
- YAML 语法错误 → 弹窗提示，不崩溃
- 同名命令 → 用户定义覆盖内置
- `data/commands/` 目录不存在 → 静默跳过
- YAML 和 TS 同一条命令 → 按优先级覆盖
