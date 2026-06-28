# 快速开始

## 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 编译
npm run compile

# 3. 监听模式（开发时使用）
npm run watch

# 4. Lint
npm run lint

# 5. 测试
npm test
```

## 调试

在 VS Code 中按 F5 启动 Extension Development Host，在新窗口中打开一个 Minecraft 数据包项目。

## 项目结构要求

工作区需包含以下结构：

```
<workspace>/
└── data/
    ├── functions/          # .mcfunction 文件
    │   └── <namespace>/
    │       └── **/*.mcfunction
    ├── advancements/       # .json 进度文件
    │   └── <namespace>/
    │       └── **/*.json
    └── mcmacro/            # .mcmacro 宏定义文件
        └── <namespace>/
            └── **/*.mcmacro
```

## 配置文件

在工作区根目录创建 `McfunctionStudio.json`：

```json
{
  "IgnorePattern": {
    "Function": ["debug/"],
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
  },
  "HoverProvider": {},
  "CommandSchemaCheck": true
}
```
