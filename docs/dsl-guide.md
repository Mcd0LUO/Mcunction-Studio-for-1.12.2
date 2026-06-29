# DSL 命令定义指南

## 概念

用**命令树**描述 Minecraft 命令的语法结构，引擎自动遍历树生成补全项。

三种节点类型：

| 节点 | 对应 Minecraft 语法 | 示例 |
|------|---------------------|------|
| 根命令 | `/scoreboard` | `command('scoreboard')` |
| 字面量 | `add`, `remove`, `if` | `literal('add')` |
| 参数 | `<target>`, `<name>` | `argument('<target>', suggestSelectors())` |
| 转发 | `execute ... run <命令>` | `forward()` |

## 快速开始

### 一个参数命令

`/effect <target> <effect> [duration] [amplifier] [hideParticles]`

```typescript
import { command, argument, optional } from '../builder';
import { suggestSelectors, suggestEffects } from './suggests';

export const effectCmd = command('effect')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<effect>', suggestEffects())
                    .then(
                        optional('[duration]').then(
                            optional('[amplifier]').then(
                                optional('[hideParticles]')
                            )
                        )
                    )
            )
    );
```

关键点：
- 参数之间用 `.then()` **嵌套**（不是平铺），表示顺序消费 token
- `optional()` 等价于 `argument(name, undefined, { optional: true })`
- `argument()` 第二个参数是 suggest 函数，不传则显示占位符

### 带分支的命令

`/function <name> [if|unless <selector>]`

```typescript
import { command, literal, argument } from '../builder';
import { suggestFunctions, suggestSelectors } from './suggests';

export const functionCmd = command('function')
    .then(
        argument('<name>', suggestFunctions())
            .then(
                literal('if').then(argument('<selector>', suggestSelectors())),
                literal('unless').then(argument('<selector>', suggestSelectors()))
            )
    );
```

关键点：
- `literal()` 节点按**精确匹配**路由
- 同一级可以 `.then()` 多个 literal（如 `if` 和 `unless`）
- literal 匹配**优先于** argument 匹配

### 更复杂的命令

`/scoreboard players tag <target> add <name>`

```typescript
literal('players')
    .then(
        literal('tag')
            .then(
                argument('<target>', suggestSelectors())
                    .then(
                        literal('add').then(argument('<name>', suggestTags())),
                        literal('remove').then(argument('<name>', suggestTags())),
                        literal('list')
                    )
            ),
        literal('add')
            .then(
                argument('<target>', suggestSelectors())
                    .then(
                        argument('<objective>', suggestScoreboards())
                            .then(argument('<value>'))
                    )
            ),
        // ...
    )
```

对应的命令树：

```
scoreboard
├── objectives
│   ├── add → <name> → <criteria>
│   └── remove → <name>
└── players
    ├── tag → <target> → add → <name>
    │                  → remove → <name>
    │                  → list
    ├── add → <target> → <objective> → <value>
    └── remove → <target> → <objective>
```

## Suggest 函数

suggest 函数签名：`(ctx: SuggestContext) => CompletionItem[]`

`SuggestContext` 提供：

```typescript
interface SuggestContext {
    cc: CompletionContext;      // selectors/scoreboards/teams/tags/functions/...
    item(label, desc, insert);  // 快捷工厂
    commands: string[];         // 当前已解析的完整命令片段
    lineText: string;           // 当前行原始文本
}
```

### 复用 CompletionContext（推荐）

```typescript
export function suggestScoreboards() {
    return (ctx: SuggestContext): CompletionItem[] =>
        ctx.cc.scoreboards();   // 直接委托
}
```

可用的 `ctx.cc` 方法：`selectors()`, `scoreboards()`, `teams()`, `tags()`, `functions()`, `entityTypes()`, `items()`, `blocks()`, `coordinates()`, `simpleSelectors()`

### 手写静态列表

```typescript
export function suggestEffects() {
    const effects = ['speed', 'slowness', 'haste', /* ... */];
    return (ctx: SuggestContext): CompletionItem[] =>
        effects.map(e => ctx.item(e, '', e, true, CompletionItemKind.Class));
}
```

`ctx.item(label, desc, insert, triggerNext?, kind?)` — 等价于 `CompletionContext.item()`，`triggerNext` 默认为 `true`（选中后自动触发下一级补全）。

## 规则速查

| 场景 | 写法 |
|------|------|
| 必选参数 | `argument('<name>', suggestXxx())` |
| 可选参数 | `optional('[name]', suggestXxx())` 或 `argument('[name]', suggestXxx(), { optional: true })` |
| 无建议的参数 | `argument('<name>')` — 显示占位符 |
| 关键字分支 | `literal('add').then(...)` |
| 多个分支 | `.then(literal('add').then(...), literal('remove').then(...))` |
| 连续参数 | `argument('<a>').then(argument('<b>').then(argument('<c>')))` |
| 转发到根命令 | `literal('run').then(forward())` — execute 的 run 子句 |
| 描述文本 | `literal('add').description = '添加'` 或 `command('tp').description = '传送实体'` |

## 注册

新命令写好后，在 `src/dsl/commands/index.ts` 中 import 并加入 `registerAll()`：

```typescript
import { myCmd } from './myCommand';
export { myCmd };

export function registerAll(engine: CompletionEngine): void {
    // ...
    engine.register(myCmd);
}
```

`extension.ts` 中的 `registerDemoCommands(engine)` 会自动包含。

## 双轨机制

```
用户输入 → Base.ts
         ├─ engine.has(command) → engine.complete()   ← DSL
         └─ CommandRegistry.getProvider()              ← 旧 Provider（回退）
```

- DSL 覆盖的命令：不再走旧 Provider
- DSL 未覆盖的命令：旧 Provider 正常工作
- 输出日志 `[DSL]` vs `[Legacy]`（`Ctrl+Shift+P` → `DSL管线调试` 开关）
