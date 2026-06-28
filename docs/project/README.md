# McFunction Studio for 1.12.2

## 项目定位

为 Minecraft 1.12.2 Java Edition 的 `mcfunction` 语言提供 VS Code 编辑器支持。核心功能包括：

- **智能代码补全**：Minecraft 1.12.2 全命令体系（~48 条根命令）的参数级补全
- **定义跳转**：记分板、标签、队伍、函数、进度等资源的定义跳转
- **签名帮助**：命令参数提示（Scoreboard / Execute / Function / Summon 等）
- **Hover 信息**：鼠标悬停显示记分板/函数引用详情
- **宏系统**：自定义宏定义 (.mcmacro) 与展开/折叠，支持嵌套宏和参数重载
- **JSON 文本预览**：tellraw/title 命令的实时带颜色行内预览
- **快速调试**：基于函数上下文的快速记分板 debug tellraw 插入

## 理念

- **零配置**：开箱即用，自动识别 `data/functions` 目录结构
- **1.12.2 专属**：专注 Minecraft 1.12.2 版本，不追求跨版本兼容
- **编辑器原生**：充分利用 VS Code API，遵循编辑器交互惯例
- **性能优先**：并发文件加载、懒加载枚举、防抖更新

## 技术栈

| 层面 | 技术 |
|------|------|
| 语言 | TypeScript 5.8+ |
| 运行时 | Node.js 20+ |
| 编辑器 API | VS Code Extension API 1.101+ |
| 模块系统 | Node16 ESM |
| 包管理 | npm |
| 测试 | @vscode/test-cli + Mocha |
| Lint | ESLint 9 + TypeScript ESLint |

## 依赖

### 运行时
- VS Code ≥ 1.101.0

### 开发
- typescript ^5.8.3
- @types/vscode ^1.101.0
- @types/node ^20.19.33
- eslint ^9.25.1
- @typescript-eslint/* ^8.31.1
- @vscode/test-cli ^0.0.10
- @vscode/test-electron ^2.5.2
- @types/mocha ^10.0.10
