/**
 * 语法类规则 —— 由 DSL 引擎的 walk 结果驱动。
 *
 * 数据来源：CompletionEngine.validate()。
 * 这类规则能覆盖「参数个数/顺序不对」，是 1.12.2 与 1.13+ 语法差异导致的
 * 高频错误（1.12.2 的 clone/particle/summon 等与新版差异显著）。
 */
import type { Diagnostic, DiagnosticRule, RuleContext } from '../types';

/** 引擎校验接口 —— 避免直接依赖具体 CompletionEngine 类（便于单测注入） */
export interface EngineValidator {
    validate(commands: readonly string[]): {
        known: boolean;
        node: { kind: string; argName?: string; children: unknown[] } | null;
        leftovers: readonly { token: string; index: number }[];
        reachedLeaf: boolean;
        trailing: boolean;
        extraOnLeaf: boolean;
        missingRequired: boolean;
    };
}

/**
 * 未知命令。
 *
 * 排除条件较多，宁可漏报：
 *   - 用户 YAML 自定义命令（engine 里已注册，但 registerAll 只装内置）
 *   - 数据包可能用到的 /forge /co 等 MOD 命令（本扩展不可能认识）
 *   - 半截词由 isIncomplete 拦截
 */
export const unknownCommandRule: DiagnosticRule & { needsEngine: true } = {
    id: 'syntax/unknown-command',
    description: '命令不在内置命令表中（可能是 1.13+ 语法或模组命令）',
    defaultLevel: 'error',
    needsEngine: true,
    check(rc: RuleContext): readonly Diagnostic[] {
        const e = getEngine(rc);
        if (!e) { return []; }
        if (rc.ctx.commandTable().length === 0) { return []; }
        const res = e.validate(rc.tokens);
        if (res.known) { return []; }
        return [rc.report(
            unknownCommandRule,
            spanOf(rc, 0, rc.commandName.length),
            `未知命令 "${rc.commandName}"：1.12.2 没有该命令（若是 1.13+ 或模组命令，本扩展无法校验）`,
        )];
    },
};

/**
 * 多余参数：已走到叶子，却还有 token 没消费。
 *
 * 例：/say hello extra —— 1.12.2 的 say 只收一个 rawtext。
 */
export const extraTokenRule: DiagnosticRule & { needsEngine: true } = {
    id: 'syntax/extra-token',
    description: '参数个数多于该命令 1.12.2 语法所允许',
    defaultLevel: 'error',
    needsEngine: true,
    check(rc: RuleContext): readonly Diagnostic[] {
        const e = getEngine(rc);
        if (!e) { return []; }
        if (rc.ctx.commandTable().length === 0) { return []; }
        const res = e.validate(rc.tokens);
        if (res.known && res.extraOnLeaf) {
            const extra = res.leftovers.map(l => l.token).join(' ');
            const first = res.leftovers[0];
            return [rc.report(
                extraTokenRule,
                tokenSpan(rc, first.index),
                `多余的参数 "${extra}"`,
            )];
        }
        return [];
    },
};

/**
 * execute 末段之后还有内容。
 *
 * 1.12.2 的 execute 语法是 `execute <entity> <x> <y> <z> <command>`，
 * 没有 1.13 的 `run` 关键字，也不允许多余 token。
 */
export const executeTrailingRule: DiagnosticRule & { needsEngine: true } = {
    id: 'syntax/execute-trailing',
    description: 'execute 子命令之后有多余内容（1.12.2 无 run 关键字）',
    defaultLevel: 'error',
    needsEngine: true,
    check(rc: RuleContext): readonly Diagnostic[] {
        const e = getEngine(rc);
        if (!e) { return []; }
        if (rc.ctx.commandTable().length === 0) { return []; }
        const res = e.validate(rc.tokens);
        if (res.known && res.trailing) {
            return [rc.report(
                executeTrailingRule,
                tokenSpan(rc, res.leftovers[0].index),
                'execute 之后的内容无法解析：1.12.2 的 execute 直接接命令，没有 run 关键字',
            )];
        }
        return [];
    },
};

/** 从 token 下标算出它在原行中的字符区间 */
export function tokenSpan(rc: RuleContext, tokenIndex: number): { start: number; end: number } {
    const token = rc.tokens[tokenIndex];
    if (token === undefined) { return { start: 0, end: 0 }; }
    const start = rc.lineText.indexOf(token);
    if (start < 0) { return { start: 0, end: 0 }; }
    return { start, end: start + token.length };
}

export function spanOf(rc: RuleContext, start: number, length: number): { start: number; end: number } {
    return { start, end: start + length };
}

/**
 * 引擎挂在 RuleContext 上的旁路通道。
 *
 * 规则是纯函数、不该直接 import engine（那会把它拖进 vscode 依赖）。
 * 由 diagnostics 调度层在构造 RuleContext 时挂上。
 */
const ENGINE = Symbol.for('mcfStudio.diagnostics.engine');

export function attachEngine(rc: RuleContext, engine: EngineValidator): void {
    (rc as unknown as Record<symbol, unknown>)[ENGINE] = engine;
}

export function getEngine(rc: RuleContext): EngineValidator | undefined {
    return (rc as unknown as Record<symbol, unknown>)[ENGINE] as EngineValidator | undefined;
}

export const syntaxRules: readonly DiagnosticRule[] = [unknownCommandRule, extraTokenRule, executeTrailingRule];