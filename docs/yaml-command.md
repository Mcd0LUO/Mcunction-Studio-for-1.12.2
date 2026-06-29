# YAML 命令定义

在数据包的 `data/commands/` 目录下放置 `.yml` 文件即可为自定义命令添加补全支持。**无需编译，文件增删改即时热重载。**

## 快速开始

创建一个 `/mytp <target> <location>` 命令的补全：

```yaml
# data/commands/mytp.yml
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

### 转发节点 `forward`

转发到根命令列表，用于 `execute ... run` 等场景。

```yaml
forward: true
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
| `placeholder` | 仅展示参数名，不插入内容 | 自由输入的位置 |
| `none` | 空补全 | 不需要提示的位置 |

### 自定义静态列表

`suggest` 字段写成数组，直接内联补全项：

```yaml
# 简单值列表
suggest:
  - name: lobby
  - name: arena
  - name: shop

# 带描述的列表
suggest:
  - name: lobby
    description: 玩家大厅
  - name: arena
    description: PvP 竞技场
  - name: shop
    description: 商店区域
```

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
      description: 列出所有传送点
```

### 带转发的命令

`/runas <target> run <命令>`

```yaml
command: runas
description: 以指定实体身份执行命令
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - literal:
            name: run
            children:
              - forward: true
```

## 覆盖内置命令

同名 YAML 文件会**覆盖**内置 TypeScript 命令的补全定义。例如修改 `/tp` 的补全行为：

```yaml
# data/commands/tp.yml   ← 与内置同名
command: tp
children:
  - argument:
      name: <target>
      suggest: selectors
      children:
        - argument:
            name: <destination>
            suggest: functions   # 改成补全函数名
```

## 文件监听

- 创建新 `.yml` → 即时注册
- 修改 `.yml` → 即时更新
- 删除 `.yml` → 即时移除
- YAML 语法错误 → 弹窗提示文件名 + 错误原因，不崩溃

## 语法校验

```yaml
# ✅ 正确
argument:
  name: <target>
  suggest: selectors

# ❌ 错误：拼写错误
argumant:          # → 弹窗 "未知节点类型 argumant"
  name: <target>
```
