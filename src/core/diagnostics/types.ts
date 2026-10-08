/**
 * 诊断层核心类型 —— **纯数据，零 vscode 依赖**。
 *
 * 为什么要这样切：
 *   规则若直接返回 vscode.Diagnostic，就只能在真实 VS Code 里测，
 *   而本项目绝大多数逻辑单测都跑在 Node + mock 上（见 scripts/vscode-mock.cjs）。
 *   把「诊断结果」表达成与宿主无关的纯结构，规则就能被快速单测覆盖，
 *   适配层再负责翻译成 vscode.Diagnostic。
 *
 * ⚠️ 硬约束：本目录下（types.ts / rules/ / ValidationContext.ts）禁止 import vscode。
 *    只有 vscodeAdapter.ts 与 manager.ts 允许。
 */

/** 行内字符区间（左闭右开），对应 vscode.Range 的同一段文本 */
export interface Span {
    readonly start: number;
    readonly end: number;
}

/**
 * 诊断级别。
 *
 * 用字符串字面量联合而非 TS enum：字符串 enum 在 TS 里是**名义类型**，
 * `const enum Severity { Hint = 'hint' }` 之后写 `defaultLevel: 'hint'` 会直接报错
 * （必须写 Severity.Hint）。而规则定义里手写裸字符串可读性远好得多，
 * 且配置文件里用户写的也是裸字符串——两侧用同一套字面量最省心。
 */
export type Severity = 'error' | 'warning' | 'information' | 'hint';

/** 同 Severity，供需要引用（switch 默认分支等）时使用 */
export const Severity = {
    Error: 'error',
    Warning: 'warning',
    Information: 'information',
    Hint: 'hint',
} as const satisfies Record<string, Severity>;

export interface Diagnostic {
    /** 规则稳定 id，如 "resource/undefined-scoreboard" */
    readonly ruleId: string;
    readonly severity: Severity;
    readonly message: string;
    /** 行号，0-based（与 vscode 文档行号一致） */
    readonly line: number;
    /** 行内字符区间 */
    readonly span: Span;
    /** 稳定机器码，供配置抑制与统计使用 */
    readonly code?: string;
}

/** 用户可在设置里选的级别；off = 禁用该规则 */
export type RuleLevel = 'off' | Severity;

export const RULE_LEVELS: readonly RuleLevel[] = ['off', Severity.Hint, Severity.Information, Severity.Warning, Severity.Error];

/**
 * 单行检查的输入快照。
 *
 * 一次性把行的解析结果算好传给所有规则，避免每条规则各自重新分词。
 */
export interface RuleContext {
    /** 该行全文（未 trim） */
    readonly lineText: string;
    /** 行号（0-based） */
    readonly line: number;
    /** 命令 token（已剔除空白与引号处理，详见 tokenize） */
    readonly tokens: readonly string[];
    /** 命令全名，execute 嵌套时取最内层，如 "scoreboard.players.add" */
    readonly commandName: string;
    /**
     * 该行「可能还没写完」——用户正在敲。
     *
     * 这是**防误报的第一道闸**：补全的典型场景就是 `scoreboard pla|` 这种半截词，
     * 若此时按完整命令去校验，会刷出一片"未知命令"红线。
     * 命中此标记的规则应当直接返回空。
     */
    readonly isIncomplete: boolean;
    /** 数据访问门面 */
    readonly ctx: ValidationContext;
    /** 便捷构造，避免每条规则手写对象字面量 */
    report(rule: DiagnosticRule, span: Span, message: string, severity?: Severity): Diagnostic;
}

/** 诊断规则 —— 插件点，用户可通过 .McfStudio 之外的方式扩充（后续版本） */
export interface DiagnosticRule {
    /** 全局唯一，格式 "域/名称"，配置里用它做键 */
    readonly id: string;
    /** 展示用说明 */
    readonly description: string;
    /** 默认级别（以 Severity 表达；配置里的 'off' 由调度层过滤） */
    readonly defaultLevel: Severity;
    /** 仅对这些命令生效；undefined = 对所有命令检查 */
    readonly commands?: readonly string[];
    /** 行级检查，返回空表示通过 */
    check(rc: RuleContext): readonly Diagnostic[];
}

/**
 * 数据访问门面。
 *
 * 规则**不允许**直接 import DataLoader：
 *   1. 单测时可注入 fake，无需构造整个索引；
 *   2. 将来若抽 headless core（Neovim/LSP），门面签名保持不变即可复用。
 */
export class ValidationContext {
    /** 已注册的命令名列表（供拼写建议用）；未加载命令表时返回空数组 */
    private readonly _commandTable: () => readonly string[];
    private readonly _hasScoreboard: (name: string) => boolean;
    private readonly _hasTeam: (name: string) => boolean;
    private readonly _hasTag: (name: string) => boolean;
    private readonly _hasFunction: (res: string) => boolean;
    private readonly _hasAdvancement: (res: string) => boolean;
    private readonly _definitionsOf: (kind: 'scoreboard' | 'team', name: string) => readonly string[];
    private readonly _getScoreboardCriteria: (name: string) => string | undefined;

    constructor(deps: {
        commandTable(): readonly string[];
        hasScoreboard(name: string): boolean;
        hasTeam(name: string): boolean;
        hasTag(name: string): boolean;
        hasFunction(res: string): boolean;
        hasAdvancement(res: string): boolean;
        definitionsOf(kind: 'scoreboard' | 'team', name: string): readonly string[];
        getScoreboardCriteria?(name: string): string | undefined;
    }) {
        this._commandTable = deps.commandTable;
        this._hasScoreboard = deps.hasScoreboard;
        this._hasTeam = deps.hasTeam;
        this._hasTag = deps.hasTag;
        this._hasFunction = deps.hasFunction;
        this._hasAdvancement = deps.hasAdvancement;
        this._definitionsOf = deps.definitionsOf;
        this._getScoreboardCriteria = deps.getScoreboardCriteria ?? (() => undefined);
    }

    /**
     * 已注册的命令名。
     *
     * 空数组 = 命令表尚未加载（未打开数据包 / 引擎未装配）。
     * 此时**语法类规则必须整体跳过**，否则会把每一条命令都判成"未知命令"。
     */
    commandTable(): readonly string[] { return this._commandTable(); }
    hasScoreboard(name: string): boolean { return this._hasScoreboard(name); }
    hasTeam(name: string): boolean { return this._hasTeam(name); }
    hasTag(name: string): boolean { return this._hasTag(name); }
    hasFunction(res: string): boolean { return this._hasFunction(res); }
    hasAdvancement(res: string): boolean { return this._hasAdvancement(res); }
    definitionsOf(kind: 'scoreboard' | 'team', name: string): readonly string[] { return this._definitionsOf(kind, name); }
    getScoreboardCriteria(name: string): string | undefined { return this._getScoreboardCriteria(name); }
}

/**
 * 行分析器 —— 把一行原始文本变成所有规则共享的 RuleContext。
 *
 * 单独抽出来而不是塞进 manager，是为了能脱离 VS Code 单测分词与 incomplete 判定，
 * 这两处恰恰是误报的主要来源。
 */
export class LineAnalyzer {
    constructor(private readonly ctx: ValidationContext) {}

    analyze(lineText: string, line: number): RuleContext {
        const tokens = tokenize(lineText);
        const commandName = tokens.length > 0 ? tokens[0] : '';
        return {
            lineText,
            line,
            tokens,
            commandName,
            isIncomplete: isIncompleteLine(lineText, tokens),
            ctx: this.ctx,
            report: (rule, span, message, severity) => ({
                ruleId: rule.id,
                severity: severity ?? rule.defaultLevel,
                message,
                line,
                span,
                code: rule.id,
            }),
        };
    }
}

/**
 * 把一行切成命令 token。
 *
 * 与 CommandUtils.extractCommand 的区别（**刻意不同**）：
 *   - extractCommand 为**补全**服务，需要识别选择器方括号、JSON 对象内的空格，
 *     把它们并成单个 token；
 *   - 诊断需要的是"用户实际写了几个参数"，过度合并会掩盖
 *     `give @s stone 1 2 3` 这类真实错误。
 * 因此这里只处理引号与转义，不合并方括号/花括号内部空格。
 *
 * @returns 不含空白的 token 列表；注释/空行返回空数组
 */
export function tokenize(lineText: string): string[] {
    const trimmed = lineText.trim();
    if (trimmed === '' || trimmed.startsWith('#')) { return []; }

    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (escaped) { current += ch; escaped = false; continue; }
        if (ch === '\\') { escaped = true; current += ch; continue; }
        if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
        if (!inQuotes && /\s/u.test(ch)) {
            if (current !== '') { tokens.push(current); current = ''; }
            continue;
        }
        current += ch;
    }
    if (current !== '') { tokens.push(current); }

    // 去除行尾注释：# 前面必须是行首或空白，且不在引号内
    return stripTrailingComment(tokens);
}

/** 去掉被行尾注释吞掉的最后一个 token（# 无空格紧贴时） */
function stripTrailingComment(tokens: string[]): string[] {
    if (tokens.length === 0) { return tokens; }
    const last = tokens[tokens.length - 1];
    const hash = last.indexOf('#');
    if (hash <= 0) { return tokens; }   // 0 表示 # 在开头，已在 tokenize 入口处理
    if (last[hash - 1] === ' ' || last[hash - 1] === '\t') { return tokens; }
    return [...tokens.slice(0, -1), last.slice(0, hash)];
}

/**
 * 判定该行是否「还没写完」。
 *
 * 误报的根源几乎都来自这里：用户正打到一半，命令名只有几个字母，
 * 若照常校验就会得到"未知命令"。宁可漏报也不能误报——
 * 一个满屏红线的扩展用户会直接关掉诊断。
 */
export function isIncompleteLine(lineText: string, tokens: readonly string[]): boolean {
    const trimmed = lineText.trim();
    if (trimmed === '' || trimmed.startsWith('#')) { return true; }

    // 引号未闭合：tellraw @a {"text":"未写完
    let inQuotes = false;
    let escaped = false;
    for (const ch of trimmed) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inQuotes = !inQuotes; }
    }
    if (inQuotes) { return true; }

    // 末 token 以连接符结尾，说明还在写：give @s stone <caret>
    const last = tokens[tokens.length - 1];
    if (last !== undefined && /[=,]$/u.test(last)) { return true; }
    if (trimmed.endsWith('\\')) { return true; }

    return false;
}