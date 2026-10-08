/**
 * 诊断调度（纯净层）—— 按规则集检查每一行，汇总成 Diagnostic[]。
 *
 * 不含任何 vscode 依赖，可完整单测。
 */
import {
    Diagnostic,
    DiagnosticRule,
    LineAnalyzer,
    RuleContext,
    RuleLevel,
    Severity,
    ValidationContext,
} from './types';
import { EngineValidator, attachEngine } from './rules/syntax';
import { syntaxRules } from './rules/syntax';
import { resourceRules } from './rules/resource';
import { valueRules } from './rules/value';

export interface RunnerOptions {
    readonly rules: readonly DiagnosticRule[];
    readonly ctx: ValidationContext;
    readonly engine?: EngineValidator;
    /** 用户覆盖的级别；未列出的用 rule.defaultLevel */
    readonly levels?: Readonly<Record<string, RuleLevel>>;
}

export const ALL_RULES: readonly DiagnosticRule[] = [...syntaxRules, ...resourceRules, ...valueRules];

/** 把规则集与上下文打包成可复用的检查器 */
export class DiagnosticRunner {
    private readonly analyzer: LineAnalyzer;
    private readonly active: { rule: DiagnosticRule; level: Severity }[];

    constructor(private readonly opts: RunnerOptions) {
        this.analyzer = new LineAnalyzer(opts.ctx);
        const levels = opts.levels ?? {};
        this.active = [];
        for (const rule of opts.rules) {
            const lv = levels[rule.id] ?? rule.defaultLevel;
            if (lv === 'off') { continue; }
            this.active.push({ rule, level: lv });
        }
    }

    /** 生效规则数（用于设置项展示与测试断言） */
    get ruleCount(): number { return this.active.length; }

    /**
     * 检查一个文件。
     *
     * @param lines 文档各行文本（与 vscode.TextDocument.lineAt 顺序一致）
     * @returns 诊断列表，按行号升序
     */
    checkDocument(lines: readonly string[]): Diagnostic[] {
        const out: Diagnostic[] = [];
        for (let i = 0; i < lines.length; i++) {
            out.push(...this.checkLine(lines[i], i));
        }
        // 同一位置同一规则只报一次（重复定义在多 predicate 场景可能重复命中）
        const seen = new Set<string>();
        const deduped = out.filter(d => {
            const k = `${d.line}:${d.span.start}:${d.ruleId}`;
            if (seen.has(k)) { return false; }
            seen.add(k);
            return true;
        });
        deduped.sort((a, b) => (a.line - b.line) || (a.span.start - b.span.start));
        return deduped;
    }

    /** 检查单行 */
    checkLine(lineText: string, line: number): Diagnostic[] {
        const rc = this.analyzer.analyze(lineText, line);
        if (this.opts.engine) { attachEngine(rc, this.opts.engine); }

        const out: Diagnostic[] = [];
        // 索引未加载时，依赖索引的规则整体跳过（否则空索引 = 满屏"未定义"）
        const indexReady = this.opts.ctx.isIndexReady();
        for (const { rule, level } of this.active) {
            if (rule.commands && !rule.commands.includes(rc.commandName)) { continue; }
            if (rule.needsIndex && !indexReady) { continue; }
            // 用户正在敲的半截命令一律跳过 —— 误报比漏报致命得多
            if (rc.isIncomplete) { continue; }
            try {
                for (const d of rule.check(rc)) {
                    // 规则自报级别优先（未指定时用配置级别覆盖默认值）
                    out.push(d.severity ? d : { ...d, severity: level });
                }
            } catch (err) {
                // 单条规则出错不能拖垮整个文件诊断
                console.warn(`[Diagnostics] 规则 ${rule.id} 抛出异常`, err);
            }
        }
        return out;
    }
}