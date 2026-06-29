# YAML 命令定义

在数据包的 `.McfStudio/extra_command/` 目录下放置 `.yml` 文件即可为自定义命令添加补全支持。**支持子文件夹递归，修改后即时热重载。**

## 快速开始

创建一个 `/mytp <target> <location>` 命令的补全：

`.McfStudio/extra_command/mytp.yml`：
```yaml
command: mytp
description: 自定义传送命令
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <location>
            suggest:
              - name: lobby
                description: 大厅
              - name: arena
                description: 竞技场
              - name: shop
                description: 商店
```

效果：输入 `mytp ` → 弹出 `@a @p @r @s @e`，选 `@a` 后 → 弹出 `lobby arena shop`。

## 节点类型

### 参数节点 `argument`

消费一个输入位置，可指定 suggest 函数或静态列表。

```yaml
argument:
  name: <target>          # 参数名（展示用）
  suggest: selectors      # suggest 函数名（可选，省略则只展示占位符）
  optional: false         # 可选参数（默认 false）
  children: [...]         # 后续节点
```

### 字面量节点 `literal`

精确匹配关键字，用于子命令分支。

```yaml
literal:
  name: add               # 关键字文本
  description: 添加       # 可选描述
  children: [...]         # 后续节点
```

### 转发节点 `forward_root`

转发到根命令列表，用于 `execute`/`foreach`/`superexe` 的 `run` 子句。

```yaml
{ forward_root: true }
```

旧写法 `{ forward: true }` 仍兼容，但建议用 `forward_root`。

### 跳转节点 `jump`

向上跳 N 层后展示兄弟节点，用于 `superexe` 等可重复链式子命令。

```yaml
{ jump: 3 }    # 向上跳 3 层
{ jump: true } # 默认跳 1 层（回到直接父节点）
```

## suggest 函数

### 引用内置

`suggest` 字段写字符串即可引用内置函数：

| suggest 名 | 补全内容 | 常用场景 |
|-----------|----------|---------|
| `selectors` | `@a`, `@p`, `@r`, `@s`, `@e` + 参数 | 目标选择器 |
| `scoreboards` | 项目中已定义的记分板名称 | 记分板参数 |
| `teams` | 项目中已定义的队伍名称 | 队伍参数 |
| `tags` | 项目中已定义的标签名称 | 标签参数 |
| `functions` | 项目中所有函数名 | 函数参数 |
| `advancements` | 项目中所有进度名 | 进度参数 |
| `coordinates` | `~ ~ ~` 相对/绝对坐标 | 坐标参数 |
| `selectorsOrCoords` | selectors + 坐标占位符 | `/tp` 目标 |
| `items` | Minecraft 物品 ID 列表 | 物品参数 |
| `blocks` | Minecraft 方块 ID 列表 | 方块参数 |
| `entityTypes` | 实体类型列表 | `/summon` 实体 |
| `effects` | 27 种药水效果 | `/effect` |
| `weatherTypes` | `clear`, `rain`, `thunder` | `/weather` |
| `gameModes` | `survival`/`creative`/`adventure`/`spectator` | `/gamemode` |
| `difficulties` | `peaceful`/`easy`/`normal`/`hard` | `/difficulty` |
| `criteria` | `dummy`/`trigger`/`deathCount`/... | 记分板准则 |
| `operations` | `+=`/`-=`/`*=`/`/=`/`%=`/`>`/`<`/`><`/`=` | 运算操作符 |
| `teamOptions` | `color`/`friendlyFire`/`collisionRule`/... | 队伍选项 |
| `particleNames` | Minecraft 粒子效果 ID | `/particle` |
| `soundNames` | Minecraft 音效 ID | `/playsound` `/stopsound` |
| `gameRules` | 23 个 gamerule 名称 | `/gamerule` |
| `placeholder` | 仅展示参数名，不插入内容 | 自由输入的位置 |
| `none` | 空补全 | 不需要提示的位置 |

### 自定义静态列表

```yaml
suggest:
  - name: lobby
    description: 大厅
  - name: arena
    description: 竞技场
```

### 自定义动态列表（extract）

`suggest` 也可以引用 `extract` 的类型名，引擎自动回退查找。见下方「数据提取」章节。

## 完整示例

### 简单参数命令

`/heal <target> [amount]`

```yaml
command: heal
description: 治疗实体
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <amount>
            suggest: placeholder
            optional: true
```

### 分支命令

`/warp set|tp|list [name]`

```yaml
command: warp
description: 传送点管理
children:
  - literal:
      name: set
      description: 设置传送点
      children:
        - argument:
            name: <name>
            suggest: placeholder
  - literal:
      name: tp
      description: 传送到传送点
      children:
        - argument:
            name: <name>
            suggest:
              - name: spawn
              - name: lobby
              - name: shop
  - literal:
      name: list
      description: 列出传送点
```

### 带转发的命令

`/runas <target> run <任意命令>`

```yaml
command: runas
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - literal:
            name: run
            children:
              - { forward_root: true }
```

### 可重复链式子命令

`/superexe [if|unless|positioned|facing] [...] run <任意命令>`

```yaml
command: superexe
children:
  - literal:
      name: if
      children:
        - literal:
            name: entity
            children:
              - argument:
                  name: <sel>
                  suggest: selectors
                  children:
                    - { jump: 3 }       # ← 跳 3 层回 superexe 层
        - literal:
            name: block
            children:
              - argument:
                  name: <x>
                  suggest: coordinates
                  children:
                    - argument:
                        name: <y>
                        suggest: coordinates
                        children:
                          - argument:
                              name: <z>
                              suggest: coordinates
                              children:
                                - { jump: 5 }   # ← 跳 5 层回 superexe 层
  - literal:
      name: positioned
      children:
        - argument:
            name: <pos>
            suggest: selectors
            children:
              - { jump: 2 }
  - literal:
      name: run
      children:
        - { forward_root: true }
```

**jump 层数怎么数**：从放 jump 的节点开始，往上数到目标节点。只数祖先，自己不算。

```
superexe           ← 目标 (距离 3)
├── if             ← 距离 2
│   ├── entity    ← 距离 1
│   │   └── sel   ← 这里放 jump: 3
│   └── block     ← 距离 2
│       ├── x     ← 距离 3
│       │   └── y ← 距离 4
│       │       └── z ← 这里放 jump: 5
├── positioned     ← 距离 1
│   └── pos       ← 这里放 jump: 2
└── run
```

## 数据提取 `extract`

YAML 不仅能定义补全，还能定义**如何从函数文件中提取数据**——就像内置的 `scoreboard teams add <name>` 自动提取队伍名一样。

```yaml
command: warp
extract:
  - pattern: "set <name>"    # /warp set xxx → 提取 xxx
    type: warp
children:
  - literal:
      name: tp
      children:
        - argument:
            name: <location>
            suggest: warp   # ← 引用 type 名
```

效果：
1. 函数文件中有 `/warp set lobby` → 自动提取 `lobby`，跨文件汇总
2. 输入 `/warp tp ` → 弹出所有已提取的 warp 名

`extract` 语法：

```yaml
extract:
  - pattern: "<模式>"    # 空格分隔，字面量精确匹配，<name> 捕获值
    type: <类型名>        # suggest 引用用
```

## 文件结构

```
项目/.McfStudio/extra_command/
├── mytp.yml              # 所有 .yml 文件均会被递归扫描
├── utils/
│   └── economy.yml       # 支持子文件夹
└── admin/
    └── warp.yml
```

- 创建/修改/删除 `.yml` → 即时生效
- YAML 语法错误 → 弹窗提示，不崩溃
- 同名命令覆盖内置 TypeScript 定义
- 热重载快捷键：`Ctrl+Shift+R` 或命令面板 "刷新函数|记分板|进度|标签池"
