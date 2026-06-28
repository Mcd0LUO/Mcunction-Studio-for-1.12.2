# DataLoader Bugfix Plan — 2025-06-28

- **复杂度等级**: Low（单文件内逻辑修正，不涉及 API/结构变更）
- **模块**: `src/core/DataLoader.ts`
- **分支**: plugin

## 本次修复

| 优先级 | Bug | 改动量 |
|--------|-----|--------|
| 1 | `addTag` 缺少 else | 1 行 |
| 2 | `case 'function'` 缺少 break | 1 行 |
| 3 | `loadData` 缺少 else 分支 | ~5 行 |
| 4 | `clearSingleFileAllCache` 计数不一致 | ~5 行 |
| 5 | `concurrentMap` 竞态（降级重写） | ~15 行 |

## 验收标准

- [ ] `addTag` 重复调用时计数正确递增
- [ ] `function` 命令解析不再穿透到 summon
- [ ] `loadData(false)` 也能正常加载
- [ ] `clearSingleFileAllCache` 对 tag/fakePlayer 行为与 `clearCache` 一致
- [ ] `npm run compile` 零错误

## 技术债务（本次不修）

- God Class 拆分（DataStore / ConfigManager / CacheManager / DataExtractor）
- `get*Data()` 返回可变 Map 引用
- 构造函数 fire-and-forget async init
- `loadSingleFuncFileByUri` / `loadSingleFuncFileByDoc` 重复代码
