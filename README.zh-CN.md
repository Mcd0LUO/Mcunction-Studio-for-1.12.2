[English](README.md) | [简体中文](README.zh-CN.md)

# Mcfunction Studio for 1.12

[![Marketplace](https://img.shields.io/vscode-marketplace/v/Mcd0-LUO.mcfunction-studio.svg?flat-square&label=marketplace)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)
[![Downloads](https://img.shields.io/visual-studio-marketplace/i/Mcd0-LUO.mcfunction-studio.svg?logo=visual-studio-code&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)

面向 **Minecraft 1.12.2** 数据包开发的 VS Code 拓展：为 `.mcfunction` 提供补全、跳转、
诊断与重构能力。

本拓展是原拓展 *McFunction Spirit for 1.12.2* 的后续重构版本，由 **Mcd0_LUO（小罗）** 维护。

---

## 功能

### 命令补全
手写的 1.12.2 命令树（42 条命令）驱动上下文感知补全。按 <kbd>Tab</kbd> 接受，
方向键浏览候选。

> 命令树按 **1.12.2** 语法建模，不是 1.13+。`execute` 没有 `run` 关键字，
> `clone` 是 `[maskMode] [cloneMode] [TileName] [dataValue]`，等等。

### 诊断（红线）
15 条规则在编辑时实时标出问题。每条规则都可通过 `mcfStudio.diagnostics.rules`
单独设为 `off` / `hint` / `information` / `warning` / `error`。

| 类别 | 示例 |
|------|------|
| 语法 | 未知命令、参数过多、`execute` 之后有多余内容 |
| 引用 | 未定义的记分板目标 / 队伍 / 标签 / 进度 / **函数** |
| 重复定义 | 同一目标或队伍被定义多次 |
| 取值 | 整数超出 int32、目标名 > 16 字符、显示名 > 32 字符、`score_X_min` 与 `score_X` 区间倒挂 |

参数还在输入途中不会报错；没有加载数据包时整体静默 ——
满屏红线比没有诊断更糟。

### 定义跳转
按住 <kbd>Ctrl</kbd> 并点击 记分板目标 / 函数 / 进度 / 标签 / 假玩家 / 队伍，跳转到定义处。

### 查找引用与重命名
<kbd>Shift</kbd>+<kbd>F12</kbd> 列出该符号在整个数据包中的全部引用。
<kbd>F2</kbd> 重命名符号，同时改掉定义与所有引用 ——
**包括选择器里的目标名**，如 `@a[score_points=10]`。

匹配按**角色**而非原始文本：`say` 消息里的同名字符串永远不会被改动。

### 文本组件预览
光标移到含 `tellraw` 或 `title` 的行，预览渲染后的组件内容（仅单行，带颜色）。

### 快速创建函数
- 右键左侧资源管理器中的目录 → **新建mcfunction文件**
- 或在 `function ns:path/to/fn` 上按住 <kbd>Ctrl</kbd> 点击路径：
  存在则跳转，不存在则创建文件并打开

### 快速记分板 debug
在编辑区右键 → **插入快速记分板debug**，插入一条 `tellraw`，
列出当前函数用到的所有记分板。

### YAML 自定义命令
把 `.yml` 文件放进 `.McfStudio/extra_command/` 即可为自己的命令添加补全。
**支持子文件夹递归，修改后即时热重载。** 见 [docs/yaml-command.md](docs/yaml-command.md)。

---

## 快速上手

1. 打开数据包的 **`data`** 文件夹作为工作区
   （通常是 `saves/<存档>/datapacks/<包>/data`）。
   只要工作区根下存在 `functions` 目录即可。
2. 打开任意 `.mcfunction` 文件 —— 拓展在 `mcfunction` 语言上激活。
3. 若激活时未能定位数据包目录，会提示一次；
   打开正确的文件夹后执行 **Mcfunction Studio: 刷新函数|计分板|进度|标签池**。
   之后才打开数据包目录也会自动重试一次。

### 配置

全部位于 `data/.McfStudio/`：

| 路径 | 用途 |
|------|------|
| `McfunctionStudio.json` | 忽略规则、并发数等 |
| `extra_command/*.yml` | 自定义命令定义 |
| `index-cache.json.gz` | 索引缓存（1.5.0+）。**可安全删除** —— 下次打开会重建；任一 `.mcfunction` 变更后自动失效 |

---

## 命令

| 命令 | 默认快捷键 |
|------|-----------|
| Mcfunction Studio: 新建mcfunction文件 | — |
| Mcfunction Studio: 刷新函数\|计分板\|进度\|标签池 | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> |
| Mcfunction Studio: 插入快速记分板debug | — |
| Mcfunction Studio: DSL管线调试: 切换日志开关 | — |

> 命令标题目前只有中文，通过 `package.nls.json` 做本地化已列入计划。

---

## 文档

- [快速上手](docs/quickstart.md)（工作区、缓存、配置、命令）
- [YAML 自定义命令](docs/yaml-command.md)
- [DSL 说明](docs/dsl-guide.md)
- [变更记录](CHANGELOG.md)

---

## 开发 / 测试

```bash
npm run compile

npm run test:purity        # 纯净层守卫：纯逻辑层不得 import vscode
npm run test:engine        # 补全引擎行为
npm run test:diagnostics   # 诊断规则 + 符号抽取
npm run test:index         # 索引 / 磁盘缓存序列化
npm run test:baseline      # 1.12.2 命令树基准
npm run test:e2e           # 真实 VS Code 集成（需本机已装 VS Code）

npm run bench:perf                      # 合成包 load / complete
npm run bench:perf -- --quiet           # 轻量负载
npm run bench:real -- "D:/path/to/data" # 测量真实数据包
```

改代码前请先读 [docs/AGENT.md](docs/AGENT.md)：那里记录了架构与若干关键设计约束。

---

## 已知问题

暂无。

## 待办

- 批量存档队伍 / 记分板 / 玩家数据 / 区块 / 实体管理
- 标准化函数文档
- 可视化编辑原始 nbtCompound 文件（`*.dat`、`*.mca`）

---

## 关于已移除的宏功能

自定义宏语言（`mcmacro`）于 1.3.0 引入，**已于 1.5.1 移除**。

- `.mcmacro` 文件不再被识别。
- 函数文件中残留的 `#@macro start: ...` / `#@macro end` 只是普通注释，可按需手动清理。
- 配置项 `IgnorePattern.Macro` 仅为兼容旧配置保留，已不生效。

---

## 联系

问题反馈：QQ **1473522801**，或在
[GitHub](https://github.com/Mcd0LUO/Mcunction-Studio-for-1.12.2/issues) 提 issue。
