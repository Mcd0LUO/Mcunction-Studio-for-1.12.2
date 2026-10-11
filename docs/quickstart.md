# Mcfunction Studio for 1.12 — 快速上手

**当前稳定版：1.6.3**

## 环境要求

- VS Code `^1.101.0`
- Minecraft **1.12.2** 数据包：工作区为 **`data`** 目录（其下有 `functions/`），或上级包含该结构

## 安装

```bash
# Marketplace 搜索 "Mcfunction Studio for 1.12"
# 或本地 vsix：
code --install-extension mcfunction-studio-1.6.3.vsix
```

## 推荐目录结构

```
存档或工程/
└── data/                          ← 建议作为工作区根（rootDir）
    ├── functions/                 ← 扫描 *.mcfunction
    │   └── ns/
    │       └── tick.mcfunction
    ├── advancements/              ← 扫描进度 JSON
    └── .McfStudio/                ← 扩展配置与缓存（自动/可手写）
        ├── McfunctionStudio.json  ← 用户配置
        ├── index-cache.json.gz    ← 索引缓存（1.5.0+，可删）
        └── extra_command/         ← 可选：自定义 YAML 命令
            └── my_command.yml
```

> 旧文档里的 `data/commands/` 已改为 **`data/.McfStudio/extra_command/`**，详见 [yaml-command.md](yaml-command.md)。

## 索引缓存（1.5.0）

| 项 | 说明 |
|----|------|
| 路径 | `data/.McfStudio/index-cache.json.gz` |
| 作用 | 跨会话冷启动跳过全量解析函数文件，加快记分板/标签/函数等索引就绪 |
| 失效 | 任一 `.mcfunction` 增删或 mtime 变化；或缓存 version 升级 |
| 安全 | **可随时删除**；下次打开会全量扫描并重建 |
| 性能量级（大包 ~2000 文件） | 无缓存全量解析约数秒；有缓存约 **~0.1s**；会话内 reload 未改文件约 **&lt;0.1s** |

## 补全

在 `.mcfunction` 中输入命令即触发。覆盖 1.12.2 原版主干命令。
非原版命令（其他插件的自定义命令）可通过 [YAML 命令定义](yaml-command.md) 自行添加补全。

| 场景 | 行为 |
|------|------|
| 空行输入 | 列出根命令 |
| `scoreboard ` | `objectives` / `players` / `teams` |
| `effect @p ` | 效果 id 或 `clear` |
| `time set ` | 数值或 `day` / `night` / `noon` / `midnight` |
| `title @a ` | `clear` / `reset` / `title` / `subtitle` / `actionbar` / `times` |
| `function ` | 项目内函数名（支持 `if` / `unless` 选择器，1.12.2 合法） |

### 数据源（自动从 mcfunction 抽取）

- **函数名**、**记分板**、**队伍**、**标签**、**假玩家**、**进度**

## 实用功能

- Json 行内 / Hover 预览（tellraw、title 等）
- 签名帮助、定义跳转（`Ctrl+Click`）
- **诊断（红线）**：16 条规则实时标注语法 / 未定义引用 / 重复定义 / 取值越界
- **查找引用**（`Shift+F12`）与**重命名**（`F2`），按角色匹配，不会误改 `say` 消息；
  重命名函数/进度时会连磁盘文件一起改
- 快速新建函数、记分板 debug 插入

### 诊断规则

规则级别可在 VS Code 设置里逐条调整（`mcfStudio.diagnostics.rules`）：

```jsonc
{
  "mcfStudio.diagnostics.rules": {
    "resource/undefined-scoreboard": "off",   // 关闭该条
    "syntax/unknown-command": "warning"       // 降级
  }
}
```

可选级别：`off` / `hint` / `information` / `warning` / `error`。
未列出的规则使用各自的默认级别。

> 引用类规则默认给 `hint` 而非 `error`：数据包常把定义与引用拆在不同文件里，
> 编辑中间态会短暂"悬空"，标红会让屏幕全是红线。
> 未加载数据包时全部索引类规则自动静默。

## 命令面板

| 命令 | 说明 |
|------|------|
| `mcf-studio.reloadWorkspace` | 刷新函数/记分板/进度等（默认 `Ctrl+Shift+R`） |
| `mcf-studio.createFunctionFile` | 右键文件夹 → 新建 mcfunction |
| `mcf-studio.fastScoreboardDebug` | 插入快速记分板 debug |
| `mcf-studio.toggleDslDebug` | 切换 DSL 补全管线日志 |

## 配置

路径：`data/.McfStudio/McfunctionStudio.json`（首次可自动生成）。

```json
{
  "IgnorePattern": {
    "Function": [],
    "Advancement": []
  },
  "Signature": true,
  "JsonPreview": {
    "LinePreview": true,
    "HoverPreview": true
  },
  "FileProcessing": {
    "MaxConcurrentReads": 16,
    "AutoRenameFunctionReference": true
  },
  "CommandSchemaCheck": true
}
```

> 默认并发读取为 **16**（过大对小文件磁盘无收益）。

## 自定义命令补全

参见 [YAML 命令定义](yaml-command.md)。

## 维护者：测试与基准

```bash
npm run compile
npm run test:purity       # 纯净层守卫（纯逻辑层不得 import vscode）
npm run test:engine       # 补全引擎行为
npm run test:diagnostics  # 诊断规则 + 符号抽取
npm run test:index        # 索引 / 缓存序列化
npm run test:baseline     # 1.12.2 命令树基准（function/effect/time/title/...）
npm run test:e2e          # 真实 VS Code 集成（需本机已装 VS Code）
npm run bench:perf        # 合成包
npm run bench:real -- "D:/path/to/data"   # 真实 data 目录
```

更细的设计记录见 `docs/plans/`（如 `2026-07-19-stable-1.5.0.md`、`2026-07-19-index-disk-cache.md`）。
