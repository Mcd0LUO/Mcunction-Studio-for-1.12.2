# Mcfunction Studio for 1.12 — 快速上手

## 环境要求

- VSCode `^1.101.0`
- 一个 **Minecraft 1.12.2 数据包项目**（根目录或上级目录包含 `data/functions/` 结构）

## 安装

```
code --install-extension mcfunction-studio-1.4.0.vsix
```

## 开箱即用

打开数据包项目，扩展自动激活：

```
项目根目录/
├── data/
│   ├── functions/           ← 自动扫描 .mcfunction 文件
│   │   ├── tick.mcfunction
│   │   └── ...
│   ├── advancements/         ← 自动扫描进度 JSON
│   └── commands/            ← 可选：YAML 命令定义
│       └── my_command.yml
└── pack.mcmeta
```

### 补全

在 `.mcfunction` 文件中输入命令即触发补全。已支持 Minecraft 1.12.2 **全部原版命令** + **EasyCber 扩展命令**。

| 场景 | 行为 |
|------|------|
| 空行输入 | 列出所有命令 |
| `scoreboard ` | 列出 `objectives` / `players` / `teams` |
| `scoreboard players ` | 列出 `tag` / `add` / `set` / `operation` / ... |
| `scoreboard players tag @a ` | 列出 `add` / `remove` / `list` |
| `effect @p ` | 列出 27 种药水效果 |
| `function ` | 列出项目内所有函数 |

### 数据源

扩展自动解析 `.mcfunction` 文件，提取并索引：

- **函数名**：`function xxx` 调用
- **记分板名称**：`scoreboard objectives add <name>`
- **队伍名称**：`scoreboard teams add <name>`
- **标签名称**：`scoreboard players tag @s add <name>`
- **假玩家名称**：`scoreboard players add/set <fake_name>`

这些数据会自动出现在对应补全位置。

### 实用功能

- **Json 行内预览**：光标在 `tellraw @s { ... }` 行时，行尾渲染 JSON 组件样式
- **签名帮助**：输入 `(` 触发函数宏参数提示
- **定义跳转**：`Ctrl+Click` 函数名跳转到定义
- **Hover 提示**：悬停函数名查看函数信息

## 命令

| 命令 | 说明 |
|------|------|
| `mcf-studio.reloadWorkspace` | 重新扫描函数/记分板/进度（`Ctrl+Shift+P`） |
| `mcf-studio.createFunctionFile` | 右键文件夹 → 新建 mcfunction 文件 |
| `mcf-studio.fastScoreboardDebug` | 右键编辑区 → 插入快速记分板 debug |
| `mcf-studio.toggleDslDebug` | 切换补全管线日志开关 |

## 配置

项目根目录放置 `McfunctionStudio.json`：

```json
{
  "IgnorePattern": {
    "Function": [],
    "Advancement": [],
    "Macro": []
  },
  "Signature": true,
  "JsonPreview": {
    "LinePreview": true,
    "HoverPreview": true
  },
  "FileProcessing": {
    "MaxConcurrentReads": 100,
    "AutoRenameFunctionReference": true
  }
}
```

## 自定义命令补全

参见 [YAML 命令定义](yaml-command.md)。
