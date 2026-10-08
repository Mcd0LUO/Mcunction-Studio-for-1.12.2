# 诊断层设计（Diagnostics）

> 目标：为 `.mcfunction` 提供红线（Diagnostics）能力，规则可插拔，纯数据层不依赖 `vscode`。
> 版本：1.5.2　状态：设计已定，实现进行中

---

## 1. 为什么做，而不做 LSP

LSP 的核心卖点是多客户端复用 + 超大索引规模，本项目两个都不占：
工作区就是一个数据包目录（几百个文件），磁盘缓存还是 mtime 指纹 + gzip 命中。
迁移成本却很高——`SuggestionProvider` 的契约直接返回 `vscode.CompletionItem[]`（68 处触点），
`DataLoader`/`IndexedStore` 内部处处是 `vscode.workspace.fs` 与 `uri.toString()`。
结论：**不做 LSP**，先做诊断。

## 2. 分层

```
                    ┌─────────────────────────────────────┐
  vscode 层         │ DiagnosticCollection                │  ← 只有这层碰 vscode API
                    │ DiagnosticManager（调度/去抖/增量）  │
                    └──────────────┬──────────────────────┘
                                   │ Diagnostic[]（纯数据）
                    ┌──────────────▼──────────────────────┐
  规则层（纯净）    │ DiagnosticRule  接口                  │  ← 零 vscode 依赖
                    │  · SyntaxRules（引擎驱动）            │
                    │  · ResourceRules（索引驱动）          │
                    └──────────────┬──────────────────────┘
                                   │ ValidationContext（只读门面）
                    ┌──────────────▼──────────────────────┐
  数据层            │ DataLoader / IndexedStore / CompletionEngine │
                    └─────────────────────────────────────┘
```

**硬约束：规则层不得 `import * as vscode`。** 这是让整套东西可单测、可复用到
未来 headless 场景（也是将来真要 LSP 时唯一不需要重写的部分）。

## 3. 核心类型

```ts
// 字符区间（非 vscode.Range，适配层再转）
export interface Span { readonly start: number; readonly end: number; }

export const enum Severity {
    Error = 'error',   // 一定导致命令执行失败
    Warning = 'warning', // 能跑但大概率是错的
    Hint = 'hint',      // 合法但可疑
}

export interface Diagnostic {
    readonly ruleId: string;
    readonly severity: Severity;
    readonly message: string;
    readonly line: number;      // 0-based
    readonly span: Span;        // 行内字符区间
    readonly code?: string;     // 稳定机器码，供 suppress/统计
}

export interface RuleContext {
    /** 该行全文 */
    readonly lineText: string;
    /** 行号（0-based） */
    readonly line: number;
    /** 已切分的命令 token */
    readonly tokens: readonly string[];
    /** 命令全名（execute 展开后的最内层），如 "scoreboard.players.add" */
    readonly commandName: string;
    /** 空白/注释行、命令不完整（用户正在敲）时为 true —— 规则应跳过 */
    readonly isIncomplete: boolean;
    /** 数据访问门面 */
    readonly ctx: ValidationContext;
}

export interface DiagnosticRule {
    readonly id: string;
    readonly description: string;
    /** 默认级别；规则可自行降级（如引用类默认 Hint） */
    readonly severity: Severity;
    /** 只对这些命令生效；undefined = 全部 */
    readonly commands?: readonly string[];
    check(rc: RuleContext): Diagnostic[] | void;
}

export interface RegisteredRule extends DiagnosticRule {
    /** 'error' 计入 Problems 面板错误数 */
    readonly defaultEnabled: boolean;
}
```

## 4. ValidationContext —— 数据访问门面

规则**不直接摸 DataLoader**，而是通过一个只读门面。这样：
1. 规则可单测（塞一个 fake 进去）
2. 未来抽 headless core 时门面签名不用变

```ts
export class ValidationContext {
    constructor(deps: {
        hasCommand(name: string): boolean;
        hasScoreboard(name: string): boolean;
        hasTeam(name: string): boolean;
        hasTag(name: string): boolean;
        hasFunction(res: string): boolean;
        /** 某对象的重复定义点（resName:line 列表），空数组 = 无重复 */
        definitionsOf(kind: 'scoreboard'|'team', name: string): readonly string[];
        hasAdvancement(res: string): boolean;
    });
    // 加上 selectTokens() / parseSelector() 等纯函数
}
```

## 5. 规则清单

| ruleId | 级别 | 检查 | 数据来源 |
|---|---|---|---|
| `syntax/unknown-command` | Error | 命令名不在引擎注册表 | `engine.has()` |
| `syntax/unexpected-token` | Error | walk 未能消费完所有 token | 引擎校验（新增 `validate()`） |
| `syntax/arg-count` | Error | 已到叶子节点但仍有 token | 引擎校验 |
| `resource/undefined-scoreboard` | Hint | 引用了未定义的目标 | `hasScoreboard` |
| `resource/undefined-team` | Hint | 引用了未定义的队伍 | `hasTeam` |
| `resource/undefined-tag` | Hint | 引用了未定义的标签 | `hasTag` |
| `resource/undefined-function` | Error | `function ns:foo` 但文件不存在 | `hasFunction` |
| `resource/undefined-advancement` | Hint | advancement 引用不存在 | `hasAdvancement` |
| `resource/duplicate-scoreboard` | Warning | 同名目标被定义多次 | `definitionsOf` |
| `resource/duplicate-team` | Warning | 同名队伍被定义多次 | `definitionsOf` |
| `score/out-of-int32` | Warning | 字面量超出 [-2^31, 2^31-1] | 纯解析 |
| `scoreboard/name-too-long` | Warning | 目标名 > 16 字符 | wiki 确认 |
| `scoreboard/display-name-too-long` | Hint | 显示名 > 32 字符 | wiki 确认 |
| `selector/invalid-score-range` | Error | `score_a=5,score_a_min=10` → 下界 > 上界 | 纯解析 |
| `selector/invalid-count` | Warning | `c=` 非正整数 | 纯解析 |

### 5.1 为什么"未定义记分板"是 Hint 不是 Error

用户常常分两个文件写：a.mcfunction 定义，b.mcfunction 引用。
如果标红，编辑中间态会疯狂误报。**用 Hint（黄/暗黄）**，
用户仍然能一眼看到"这里引用的东西不存在"，但不会被红色淹没。

### 5.2 选择器记分板范围的 1.12.2 语法（已查 wiki 确认）

1.12.2 **不是** 1.13 的 `scores={a=1..2}`，而是：

```
[score_<name>=<SCORE>]      上界：分数 <= SCORE
[score_<name>_min=<SCOREMIN>] 下界：分数 >= SCOREMIN
```

例：`@a[score_points_min=30,score_points=39]` → 30 <= 分数 <= 39。
故「范围无效」的判定 = 同一目标同时出现 `score_X` 与 `score_X_min` 且 `_min` 值 > 上界值。

### 5.3 int32 边界（已查 wiki 确认）

32 位有符号，MIN_INT = -2147483648，MAX = 2147483647。
记分板值在 NBT 中存为 int，超出即溢出。字面量直接超界的应提示。

## 6. isIncomplete —— 防误报的关键

用户正在敲 `scoreboard pla` 时，token 不完整，必须跳过所有规则。
判定条件（任一）：
- 行首为 `#`（注释）
- trim 后为空
- 行尾有未闭合的引号 / 方括号
- 末 token 以 `,` `=` 结尾，或以 `\` 结尾（转义中）
- 命令名长度 < 3 且不是已知命令（防止 `pl` 报 unknown）

## 7. 引擎侧改造：CompletionEngine.validate()

现有 `walk()` 遇到匹配不上的 token 会 `break`——**这个"剩余 token"就是语法错误信号，
只是目前被丢掉了**。新增：

```ts
export interface WalkResult {
    node: CommandNode;
    ancestors: CommandNode[];
    consumedRealToken: boolean;
    /** 未被消费的 token 及其原始下标；语法错误时非空 */
    leftovers: { token: string; index: number }[];
    /** 走到的最深节点是否已是叶子（无 children） */
    reachedLeaf: boolean;
}

validate(commands: string[]): WalkResult  // 复用 walk 的结果，不重复解析
```

`complete()` 内部改为调用 `walk()` 并忽略 leftovers，保持行为不变。

## 8. 调度与性能

- **防抖 300ms**：`onDidChangeTextDocument` 后延迟合并，避免每敲一个字符全量重算
- **只算可见文件**：打开时才建立 DiagnosticCollection 条目
- **索引变化时失效**：`DataLoader.loadData()` 完成 / 文件增删改后，对所有已开启诊断的文件重算一次
- 单文件校验 **O(行数 × 规则数)**，规则全是 O(1) 查表，200 行文件 < 1ms

## 9. 注册与开关

```jsonc
"mcfStudio.diagnostics": {
    "enabled": true,
    "rules": {
        "syntax/unknown-command": "error",     // off | hint | warning | error
        "resource/undefined-scoreboard": "hint"
        // ...
    }
}
```
未列出的规则用各自 default。设为 `off` 即关闭。

## 10. 测试策略

| 层 | 手段 | 数量目标 |
|---|---|---|
| 类型/纯函数 | Node + mock | selector 解析、int32、incomplete 判定 |
| 规则 | Node + fake ValidationContext | 每条规则正例 + 反例 |
| 引擎 validate | Node + mock（已有 mock 基础设施） | leftovers / reachedLeaf |
| 端到端 | 真实 VS Code e2e | 诊断出现、级别正确、无异常 |

**mock 环境完全测不出的问题**：DiagnosticCollection 是纯 vscode API，
必须在 e2e 里验证「红线真的显示出来」。