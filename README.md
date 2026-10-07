# mcfunction-studio-for-1-12 README

[![Marketplace](https://img.shields.io/vscode-marketplace/v/Mcd0-LUO.mcfunction-studio.svg?flat-square&label=marketplace
)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)
[![Downloads](https://img.shields.io/visual-studio-marketplace/i/Mcd0-LUO.mcfunction-studio.svg?logo=visual-studio-code&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)

***
#### 本拓展为原拓展 McFunction Spirit for 1.12.2 的后续重构开发版本
    Author Mcd0_LUO (小罗)
***
### 插件说明
* 建议使用 `saves/***/data` 即存档目录下的 **data** 文件夹作为工作区（只要工作区根下存在 `functions` 结构即可）
* 配置目录：`data/.McfStudio/`（`McfunctionStudio.json`、自定义 YAML 命令等）
* **索引缓存**（1.5.0+）：`data/.McfStudio/index-cache.json.gz`  
  - 用于跨会话加快函数/记分板/标签等索引加载；**可安全删除**，下次打开会全量解析并重建  
  - 任一 `.mcfunction` 变更后会自动失效并刷新  
* 如有任何拓展问题请以 qq | qq邮箱 联系开发者   id: 1473522801

***
### 文档索引
- [快速上手](docs/quickstart.md)（工作区、缓存、配置、命令）
- [YAML 自定义命令](docs/yaml-command.md)
- [DSL 说明](docs/dsl-guide.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)

### 开发 / 测试（维护者）
```bash
npm run compile
npm run test:index      # 索引单元测试
npm run test:baseline   # 1.12.2 命令树基准
npm run bench:perf      # 合成包 load/complete
npm run bench:real -- "D:/path/to/data"   # 真实 data 目录
```

***
### 功能介绍
定义跳转:
- 按住 **ctrl** 并点击 记分板|函数|进度|标签 |假玩家 |队伍 可跳转至定义

命令补全:
- 输入命令部分，自动弹出补全项，按下tab补全，可使用方向键选择补全项

文本组件预览:
- 光标移动至含tellraw | title 命令的行，将预览内容(仅单行带颜色)

快速创建函数:
- 方法一: 右键左侧工作区目录，点击新建mcfunction文件
- 方法二: 在任一函数文件中，输入function xxx:xxx ，按住ctrl并点击路径， 若存在则跳转至定义，否则创建并跳转

快捷操作:
- 在编辑区域右键可插入快速记分板debug，tellraw本函数用到的所有记分板

> **宏（mcmacro）功能已于 1.5.1 移除。** 1.3.0 曾引入自定义宏语言与宏展开/折叠命令，该功能随后被废弃。
> 若工作区里还有 `.mcmacro` 文件，它们不会再被识别；若函数文件中存在已展开的宏内容
> （形如 `#@macro start: ...` / `#@macro end` 的注释块），那只是普通注释，可按需手动清理。
> 配置文件中的 `IgnorePattern.Macro` 仅作旧配置兼容保留，已不生效。


### 已知问题
- NONE

TODO:
- 批量存档队伍管理
- 批量存档记分板管理
- 存档玩家数据管理
- 批量存档区块管理
- 批量存档实体清理
- 标准化函数文档
- 可视化编辑原始nbtCompound文件(*.dat,*.mca)
- ... 敬请期待
***
 
