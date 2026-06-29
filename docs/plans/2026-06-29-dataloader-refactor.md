# DataLoader 数据层重构 Plan — 2026-06-29

- **复杂度等级**: Medium（内部重构，对外 API 不变）
- **模块**: `src/core/DataLoader.ts` + 新增 `src/core/IndexedStore.ts`
- **分支**: plugin

## 目标

解决 DataLoader 中数据存储碎片化、docCache 反向索引手动维护、清理逻辑重复等结构问题。

## 策略

**零 consumer 改动**：所有 public 方法签名保持不变，只改内部实现。

## 方案：抽取 IndexedStore

```
IndexedStore (新文件, ~200行)
├── 持有 5 个数据 Map + docCache
├── add(type, name, uri, line, meta?) → 一行调用，同时更新数据 Map 和 docCache
├── remove(type, name, decrement?) → 一行调用，同时清理数据 Map 和 docCache
├── clearFile(uri, startLine?, endLine?) → 统一的行级/文件级清理
├── getMap(type) / getDocCache() → 只读适配器（向后兼容）
└── refCount 递增/递减逻辑内置，消除 Bug #1 类隐患

DataLoader (~400行，从730行减少)
├── 用 IndexedStore 替代 5 个裸 Map + docCache
├── addTag/addTeam/addFakePlayer/addScoreboard → 委托给 store.add()
├── clearCache/clearSingleFileAllCache → 委托给 store.clearFile()
├── 所有 getter 保持不变（通过 store.getMap() 适配）
└── 消除所有重复的 "手动更新 docCache" 代码
```

## 验收标准

- [ ] `npm run compile` 零错误
- [ ] 所有 public 方法签名不变
- [ ] consumer 文件（Base.ts / DynamicDocManager.ts / HoverProvider.ts 等）零改动
- [ ] addTag Bug #1 的隐患在设计层面消除（refCount 逻辑在 store 内部，不暴露）
- [ ] clearCache / clearSingleFileAllCache 共享同一份清理逻辑
- [ ] 新增数据类型只需在 DataType enum + IndexedStore 加一项，不再需要改多处
