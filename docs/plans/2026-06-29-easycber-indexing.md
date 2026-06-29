# EasyCber 命令索引 Round 1 — 2026-06-29

- **复杂度等级**: Low（追加新 extractor，不改已有逻辑）
- **模块**: `src/core/DataLoader.ts` + `src/core/IndexedStore.ts`
- **分支**: plugin

## 背景

`handleSingleLine` 当前只索引原版命令（scoreboard / function / summon），EasyCber 的 11 个命令完全不被索引。导致用户在 EasyCber 命令中定义的 team、引用的 scoreboard/function，在 go-to-definition、hover、补全中全部不可见。

## 方案

两步走：

### Step 1: switch → 注册表

```typescript
// 旧
switch (commands[0]) {
    case 'scoreboard': ...
    case 'function': ...
    case 'summon': ...
}

// 新
const handler = this.commandHandlers.get(commands[0]);
if (handler) { handler(uri, index, commands); }
```

`commandHandlers` 在构造函数中注册，新增命令只需一行 `set`。

### Step 2: 追加 EasyCber extractor

| 命令 | 索引的数据 | 实现 |
|------|-----------|------|
| `team add <name>` | TeamData | `store.addTeam()` |
| `schedule function <func>` | FunctionData (引用) | `store.addFunctionRef()` |
| `schedule repeat <func>` | FunctionData (引用) | `store.addFunctionRef()` |
| `schedule random <func>` | FunctionData (引用) | `store.addFunctionRef()` |
| `score set <obj> <sel> from score <sel2> <obj2>` | ScoreboardData (引用) | 无新存储，仅验证路径 |
| `var set <ns> <name> from score <sel> <obj>` | ScoreboardData (引用) | 同上 |

注：`foreach`/`superexe`/`dispatch` 的 `run` 子句内可能含 function 调用，但需要递归解析命令链，本轮不做。

## 验收标准

- [ ] `npm run compile` 零错误
- [ ] `team add xxx` 的 team 名出现在补全列表中
- [ ] `schedule function/repeat/random` 的函数引用被计入 functionData
- [ ] 已有 switch-case 行为完全保留（scoreboard / function / summon）
