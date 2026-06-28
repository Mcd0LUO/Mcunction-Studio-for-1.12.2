# 迭代路线图

## v1.x（当前稳定版，功能冻结）
- ✅ Minecraft 1.12.2 全命令补全
- ✅ 定义跳转、Hover、签名帮助
- ✅ 宏定义与展开/折叠
- ✅ JSON 行内预览
- ✅ 快速调试工具

## v2.0（全量重构）

### Phase 1: DSL 核心 + 基础架构
- [ ] 命令 DSL API 实现（RootCommand / SubCommand / Flag / Option / Positional）
- [ ] 命令注册表（替代动态 import）
- [ ] 补全引擎（DSL 命令树 → CompletionItem）
- [ ] 签名引擎（DSL 命令树 → SignatureHelp）
- [ ] 基础工具提取（command-parser / minecraft-path）
- [ ] 游戏资源数据拆分（拆分 EnumLib → resources/）

### Phase 2: 命令迁移
- [ ] 迁移 48+ 命令到 DSL 定义
- [ ] 每个命令的补全/签名自动生成
- [ ] 验证：所有命令补全行为与 v1 一致

### Phase 3: 核心服务重构
- [ ] DataLoader 拆分（FileDiscoverer / FunctionParser / MacroParser / ConfigLoader）
- [ ] WorkspaceIndex 实现（替代分散的 Map 存储）
- [ ] DocWatcher 提取（从 DynamicDocManager）
- [ ] DefinitionProvider / HoverProvider 适配新架构

### Phase 4: 宏系统重构
- [ ] Tokenizer / AST 代码清理
- [ ] MacroManager 重构（去除单例，依赖注入）
- [ ] 错误报告增强

### Phase 5: 测试 + 文档
- [ ] 核心 DSL 单元测试
- [ ] 补全引擎测试
- [ ] 签名引擎测试
- [ ] 命令解析测试
- [ ] 集成测试

### Phase 6: 扩展功能
- [ ] Command 校验（根据 DSL 定义 check 命令合法性）
- [ ] 可视化命令树调试面板
- [ ] 命令使用统计
