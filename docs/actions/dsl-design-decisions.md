# 决策记录：命令构造器 DSL 设计决策

> 日期: 2026-06-20
> 状态: ✅ 已确认

## 决策 1: execute 的嵌套子命令问题 ✅

**选择**: 方案 A — `forward()` 标记 + CompletionEngine 特殊处理
**理由**: 保留 DSL 统一性，CompletionEngine 遇到 `forward` 节点时返回到根命令列表的补全

## 决策 2: 选择器参数的嵌套结构 ✅

**选择**: 方案 A — 选择器作为特殊 PositionalDef，suggest 函数处理内部逻辑
**理由**: 选择器逻辑已在现有 Base.ts 中成熟实现，不宜重复抽象。DSL 中通过 `suggest` 回调委托给现有的选择器补全函数

## 决策 3: NBT 内嵌补全 ✅

**选择**: 方案 A — NBT 补全独立于命令 DSL，作为 PositionalDef.suggest 的返回
**理由**: NBT 补全逻辑独立且成熟，有自己的一整套 parser（NbtTokenizer/NbtAst），不宜过度抽象到命令 DSL 中

## 决策 4: 旧 Provider 兼容期 ✅

**选择**: 方案 A — 双轨并行（DSL 优先，未定义命令回退到旧 Provider）
**理由**: 降低风险，渐进迁移。CompletionEngine 先查 DSL 注册表，未找到的命令回退到旧 `CommandRegistry` 的动态 import 体系
