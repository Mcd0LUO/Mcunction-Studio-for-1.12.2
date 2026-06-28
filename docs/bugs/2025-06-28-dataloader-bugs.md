# DataLoader Bug Report — 2025-06-28

> 版本: plugin branch, 基于 1.3.3
> 文件: src/core/DataLoader.ts

## Bug #1 — `addTag` 无条件重置计数

- **严重等级**: 🔴 Critical
- **定位**: [DataLoader.ts:212-218](src/core/DataLoader.ts#L212-L218)
- **描述**: `addTag` 先检查已有值并 +1，然后无条件 `set(tagName, 1)`，导致每次调用都重置为 1，引用计数永不增长。正确逻辑应该用 `else`。
- **修复方案**: 将 `this.tagsData.set(tagName, 1)` 放入 `else` 分支。
- **已修复**: ✅

## Bug #2 — `handleSingleLine` switch 缺少 `break` 导致穿透

- **严重等级**: 🔴 Critical
- **定位**: [DataLoader.ts:640-649](src/core/DataLoader.ts#L640-L649)
- **描述**: `case 'function'` 没有 `break`，每个 function 命令都会穿透到 `case "summon"` 执行 `extractSummonData`。造成无效解析和不正确的假玩家数据。
- **修复方案**: 在 `case 'function'` 分支末尾添加 `break`。
- **已修复**: ✅

## Bug #3 — `loadData` 缺少 `else` 分支（非并发模式不加载）

- **严重等级**: 🟠 High
- **定位**: [DataLoader.ts:550-563](src/core/DataLoader.ts#L550-L563)
- **描述**: `useConcurrentControl=true` 时走 `if` 分支加载文件，`false` 时无 `else` 分支，函数文件完全不被加载。但 `loadFunctionData` 调用时传 `useConcurrentControl=true`，所以目前碰不到；如果有人传入 `false`，则静默失败。
- **修复方案**: 添加 `else` 分支，直接遍历 `functionPaths` 调用 `loadSingleFuncFileByUri`。
- **已修复**: ✅

## Bug #4 — `clearSingleFileAllCache` 对 tag/fakePlayer 直接删除而非递减

- **严重等级**: 🟠 High
- **定位**: [DataLoader.ts:345-352](src/core/DataLoader.ts#L345-L352)
- **描述**: `clearCache`(行级) 使用 `count > 1 ? decrement : delete` 模式维护引用计数，但 `clearSingleFileAllCache`(文件级) 直接 `delete`，行为不一致。删除整文件缓存时，应遍历所有行并递减计数（或调用 `clearCache` 逐行清理）。
- **修复方案**: 统一使用 `clearCache` 的递减模式；改调用 `clearCache(doc, 0, docCacheEntry.size)` 或在删除前迭代所有行做递减处理。
- **已修复**: ✅

## Bug #5 — `concurrentMap` 清理逻辑竞态问题

- **严重等级**: 🟡 Medium
- **定位**: [DataLoader.ts:100-105](src/core/DataLoader.ts#L100-L105)
- **描述**: `e` 在 `then` 回调中通过 `executing.indexOf(e)` 查找自身，但多个 Promise 同时 resolve 时，`e` 可能已被其他回调的 `splice` 移除，`indexOf` 返回 -1 导致 `splice(-1, 1)` 删除数组最后一个元素（另一个正在运行的 Promise）。
- **修复方案**: 重写并发控制，改为分批 `Promise.allSettled` 模式，或使用计数器+信号量替代 `splice(indexOf(...), 1)`。
- **已修复**: ✅
