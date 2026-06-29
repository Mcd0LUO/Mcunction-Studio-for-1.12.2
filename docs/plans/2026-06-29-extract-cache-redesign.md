# Extract 缓存方案重设计

## 现状问题

当前 YAML extractor 只有两层简单 Map：

```
customData: type → Set<value>         全局汇总
fileEntries: file → (type → Set)     按文件清除
```

缺少：
- **引用计数**：同一值在多处引用时，删一处不应全部删除
- **行级追踪**：增量解析只改一行，却要清空整个文件重建
- **与 IndexedStore 重复**：两套类似逻辑各自维护

## 目标

一套统一缓存层，替换 `extractor.ts` 的 `customData` 和 `IndexedStore` 为同一抽象，所有数据（内置 + YAML 自定义）统一管理。

## 方案：`LineIndex`

### 数据结构

```
LineIndex {
    entries:    Map<file, Map<line, Entry[]>>   // 行级索引
    typeIndex:  Map<type, Map<value, RefCount>> // type → value → 引用计数
}

Entry {
    type: string        // "scoreboard" | "team" | "tag" | "warp" | ...
    value: string       // 提取的值
    meta?: unknown      // 额外数据（如 scoreboard 的 criteria/desc）
}

RefCount {
    count: number       // 被引用次数
    locations: Set<file-line>  // 所有引用位置
}
```

### 操作

```typescript
// 写入：解析一行时
addLine(file: string, line: number, entries: Entry[]): void {
    // 1. 清除该行旧数据（覆盖更新）
    const old = clearLine(file, line);
    // 2. 写入新数据
    lineIndex.set(file, line, entries);
    // 3. 更新引用计数
    for (const e of entries) {
        const rc = typeIndex.get(e.type, e.value);
        rc.count++;
        rc.locations.add(file + ':' + line);
    }
}

// 清除一行（该行被删除或修改）
clearLine(file: string, line: number): Entry[] {
    const old = lineIndex.get(file, line);
    for (const e of old) {
        const rc = typeIndex.get(e.type, e.value);
        rc.count--;
        rc.locations.delete(file + ':' + line);
        if (rc.count === 0) {
            typeIndex.remove(e.type, e.value); // 彻底删除
        }
    }
    return old;
}

// 清除整个文件
clearFile(file: string): void {
    for (const [line, entries] of lineIndex.entriesFor(file)) {
        clearLine(file, line);
    }
}

// 全量清空（reload 前）
clear(): void {
    lineIndex.clear();
    typeIndex.clear();
}

// 查询：按 type 获取所有值
getByType(type: string): { value: string; refCount: number }[] {
    return typeIndex.getByType(type);
}
```

### 数据流

```
函数文件解析 → handleSingleLine
  ├── 内置 handler（MinecraftExtractor/EasyCberExtractor）
  │   → store.addScoreboard(name, file, line)
  │   → store.addTeam(name, file, line)
  │   → store.addTag(name, file, line, refCount)
  │   └── 内部转为 addLine(file, line, [Entry("scoreboard", name)])
  │
  └── YAML extract handler
      → applyExtractForFile(file, line, commands)
      → addLine(file, line, [Entry("warp", "lobby")])
```

### 增量更新

```
用户修改一行：
  parseLines(file, lines, startLine)  ← 只解析修改行
  → handleSingleLine(file, line, i)
  → addLine(file, line, entries)     ← 自动清除旧行 + 写入新行
  → 旧值 refCount--，新值 refCount++
```

### 引用计数

```
函数 A: /warp set lobby   → warp::lobby refCount=1
函数 B: /warp set lobby   → warp::lobby refCount=2
删除函数 A                 → warp::lobby refCount=1（不删除）
删除函数 B                 → warp::lobby refCount=0（删除）
```

### 内置类型迁移

当前 `IndexedStore` 持有独立 Map：`scoreboards`, `teams`, `tags`, `functions`, `fakePlayers`。改为委托给 `LineIndex`：

```typescript
class IndexedStore {
    private index = new LineIndex();

    addScoreboard(resName, name, line, uri, criteria, desc) {
        this.index.addLine(uri.toString(), line, [
            { type: 'scoreboard', value: name, meta: { criteria, desc } }
        ]);
    }

    getScoreboards(): Map<string, ScoreboardData> {
        return this.index.getByType('scoreboard');
    }
}
```

### 兼容性

- `DataLoader.getScoreboardsData()` 签名不变
- `DataLoader.getTeamsData()` 签名不变
- `getCustomData(type)` 签名不变（查 `typeIndex`）
- `clearAllCustomData()` → `lineIndex.clearBySource('yaml')`（可选，或全局 `clear()`）

## 实施步骤

1. 新建 `src/core/LineIndex.ts`（~120 行）
2. 重构 `IndexedStore` 委托给 `LineIndex`
3. 删除 `extractor.ts` 中的 `customData`，改用 `LineIndex`
4. 删除 `clearFileExtract` / `clearAllCustomData` 等独立函数
5. 验证所有补全 + extract 功能正常

## 文件变更范围

| 文件 | 变更 |
|------|------|
| `src/core/LineIndex.ts` | 新建 |
| `src/core/data/IndexedStore.ts` | 委托给 LineIndex |
| `src/dsl/yaml/extractor.ts` | 删除 customData/fileEntries，用 LineIndex |
| `src/core/DataLoader.ts` | 无变化（handleSingleLine 不变） |

## 验收

- [ ] 内置 scoreboard/team/tag 补全正常
- [ ] YAML extract 补全正常
- [ ] 删行 → 值即时消失
- [ ] 同值多处引用 → 删一处不减原始
- [ ] `Ctrl+Shift+R` 全量重载正常
- [ ] 增量编辑 → 只更新被修改的行
