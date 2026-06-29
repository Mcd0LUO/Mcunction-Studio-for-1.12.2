# Engine 重构 Plan — 2026-06-29

- **复杂度**: 中
- **涉及模块**: `src/dsl/engine.ts`（仅此一个文件）
- **验收标准**: superexe 链式子命令（if/unless/positioned/facing/run）任意组合补全正确，不弹出重复节点

## 根因

当前 `complete()` 方法把"tree walk（token 消费）"和"suggest（补全生成）"混在一起，导致以下边界 case 无法干净处理：

1. **最后一个 token 是否消费** — literal 要消费才能下钻，argument 要不消费留给 VSCode 过滤。逻辑互相矛盾，只能加 if/else 硬判
2. **jump 触发时机** — jump 节点可能出现在 tree walk 中（消费 token 时），也可能出现在 suggestFor 中（作为子节点），两处逻辑不一致
3. **ancestors 栈** — 初始携带 root、jump 层数从当前节点算还是父节点算，多次踩坑

## 方案：分离 walk 和 suggest

```typescript
// 1. walk — 尽全力消费 token，不管是不是最后一个
walk(root, commands): { node, ancestors } {
    let node = root, cursor = 1
    for (; cursor < commands.length; cursor++) {
        next = matchChild(node, commands[cursor])
        if (!next) break
        if (next is jump) { node = pop ancestors by jump.levels; continue }
        ancestors.push(node)
        node = next
    }
    return { node, ancestors }
}

// 2. suggest — 独立方法，只处理当前节点的补全
suggest(node, ancestors): CompletionItem[] {
    if (node is forward_root) return rootCommands
    if (node has jump child) { show jump target siblings }
    if (node has literal children) { show them }
    if (node has argument children) { call suggest function or show placeholder }
}
```

jump 仅在 walk 阶段消费 token 时触发（`matchChild` 返回 jump → 弹栈 → 继续循环）。suggest 阶段跳转改为"当节点有 jump 子节点时，展示跳转目标的兄弟"。

## 关键简化

- **去掉 "最后一个 token 不消费"** — walk 消费到底，VSCode 自己过滤
- **jump 层数** — 只从 ancestors 栈弹（不含当前节点），语义清晰
- **去掉 commands.length === 1 特殊处理** — walk 到底后 suggest，没子节点自然返回空

## 影响范围

仅 `engine.ts` 一个文件，约 80 行重构为 60 行。不改变外部 API（`register`/`has`/`getRootItems`/`complete` 签名不变）。不影响 nodes/builder/YAML 层。

## 验收

- [ ] `superexe if entity @s ` → `['if','unless','positioned','run']`（jump 触发）
- [ ] `superexe if entity @s if ` → `['entity','block']`（第二个 if 消费进分支）
- [ ] `superexe if entity @s positioned ` → `['<pos>']`（jump 后再接 positioned）
- [ ] `effect @p ` → 27 个药水效果
- [ ] `scoreboard objectives add ` → scoreboard 名称补全
- [ ] `function myfunc ` → `['if','unless']`
- [ ] 所有 50 条命令补全正常（无回归）
