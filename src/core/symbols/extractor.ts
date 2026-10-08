/**
 * 符号抽取 —— 把一行 mcfunction 解析成「这一行引用了哪些符号、在哪个角色上」。
 *
 * ## 为什么不用现有的 LineIndex
 *
 * `LineIndex` 每行只存 `{ type, value }`，**没有列位置**。
 * 定义跳转只需要「哪一行」，所以够用；但 rename 必须精确知道
 * token 在行内的起止字符——否则会把 `say mytag is cool` 里的 `mytag`
 * 一起改掉，或者漏改 `scoreboard objectives add mytag dummy` 里的定义名。
 *
 * 抽取器在**解析当下**就地算出字符区间，不给索引增加负担：
 * 一行的 token 最多几十个，线性扫一遍的代价可以忽略。
 *
 * ## 角色（role）而非仅类型
 *
 * 同一个字符串在不同位置含义不同。`mytag` 作为
 *   `scoreboard players tag @s add mytag` → 标签引用
 *   `say mytag`                          → 纯文本，什么都不是
 * 若只按「值相等」做替换，就会把 say 的消息也改了。
 * 因此每个符号都带 role，references/rename 全程按 role 过滤。
 */

/** 符号种类。与 LineIndex 的 type 字符串保持一致，便于交叉核对。 */
export type SymbolKind =
    | 'scoreboard'      // 记分板目标名
    | 'team'            // 队伍名
    | 'tag'             // 标签名
    | 'function'        // 函数资源名（含命名空间）
    | 'fake_player'     // 假玩家（#foo 的 foo 部分）
    | 'advancement';    // 进度资源名

/** 角色：定义 / 引用。定义可被删除，引用不可。 */
export type SymbolRole = 'definition' | 'reference';

/** 一行中的一个符号出现 */
export interface SymbolOccurrence {
    readonly kind: SymbolKind;
    readonly value: string;
    readonly role: SymbolRole;
    /** 行内字符区间（左闭右开），指向 value 在原文中的精确位置 */
    readonly start: number;
    readonly end: number;
}

/** 假玩家的**完整** token（含 #），rename 时要连 # 一起替换 */
export interface SymbolOccurrenceWithHash extends SymbolOccurrence {
    /** 仅 fake_player 有效：# 的位置；其余为 -1 */
    readonly hashStart: number;
}

/**
 * 解析一行，抽出全部符号出现。
 *
 * @param lineText 原始行文本（不做 trim，位置以原文为准）
 * @returns 按出现顺序排列；同一 token 被拆出多个符号时各自独立
 */
export function extractSymbols(lineText: string): SymbolOccurrenceWithHash[] {
    const out: SymbolOccurrenceWithHash[] = [];
    // token 起点：由扫描时的偏移记录，供反查 value 的精确位置
    const tokens = scanTokens(lineText);
    if (tokens.length === 0) { return out; }

    const t = tokens.map(x => x.text);
    const at = (i: number): number => (i >= 0 && i < tokens.length ? tokens[i].start : -1);

    const push = (
        kind: SymbolKind,
        value: string,
        role: SymbolRole,
        index: number,
        hashStart = -1,
    ): void => {
        const tk = tokens[index];
        if (!tk || value === '') { return; }
        // 在 token 内定位 value 的偏移（token 本身可能不是 value，如 #foo）
        const inner = tk.text.indexOf(value);
        const start = tk.start + (inner < 0 ? 0 : inner);
        out.push({ kind, value, role, start, end: start + value.length, hashStart });
    };

    // ---------------------------------------------------------
    // scoreboard
    // ---------------------------------------------------------
    if (t[0] === 'scoreboard') {
        const sub = t[1];

        if (sub === 'objectives') {
            if (t[2] === 'add' && t[3]) {
                push('scoreboard', t[3], 'definition', 3);
            } else if (t[2] === 'remove' && t[3]) {
                // remove 是删除定义点，仍算定义（跳转/重命名都要覆盖）
                push('scoreboard', t[3], 'definition', 3);
            } else if (t[2] === 'setdisplay' && t[4]) {
                push('scoreboard', t[4], 'reference', 4);
            }
        } else if (sub === 'players') {
            const op = t[2];
            if (op === 'tag') {
                // scoreboard players tag <target> add|remove <tag>
                if ((t[4] === 'add' || t[4] === 'remove') && t[5]) {
                    push('tag', t[5], t[4] === 'add' ? 'definition' : 'reference', 5);
                }
            } else if (op === 'operation') {
                // players operation <targetName> <targetObjective> <operation> <selector> <objective>
                // wiki Commands/scoreboard 原文（已核对）：
                //   下标 3 = targetName（玩家/假玩家）
                //   下标 4 = targetObjective（记分板目标）
                //   下标 5 = operation（+= -= *= /= %=）
                //   下标 6 = selector（另一个 targetName，同上）
                //   下标 7 = objective（记分板目标）
                if (t[4]) { push('scoreboard', t[4], 'reference', 4); }
                if (t[7]) { push('scoreboard', t[7], 'reference', 7); }
                // 两个 targetName 位置的假玩家也记上
                for (const i of [3, 6]) {
                    if (t[i] && !isSelector(t[i])) {
                        push('fake_player', t[i].replace(/^#/, ''), 'reference', i, at(i));
                    }
                }
            } else if (op && op !== 'list') {
                // players add|remove|set|reset|enable|test <target> <objective>
                if (t[3] && !isSelector(t[3])) {
                    push('fake_player', t[3].replace(/^#/, ''), 'reference', 3, at(3));
                } else if (t[3]) {
                    // 选择器目标不是符号，跳过
                }
                if (t[4]) { push('scoreboard', t[4], 'reference', 4); }
            }
        } else if (sub === 'teams') {
            const op = t[2];
            if (op === 'add' && t[3]) {
                push('team', t[3], 'definition', 3);
            } else if ((op === 'remove' || op === 'join' || op === 'empty' || op === 'option') && t[3]) {
                push('team', t[3], 'reference', 3);
            }
            // leave：teams leave <target> —— 无队伍名
        }
    }

    // ---------------------------------------------------------
    // function / gamerule gameLoopFunction
    // ---------------------------------------------------------
    if (t[0] === 'function' && t[1]) {
        push('function', t[1], 'reference', 1);
    }
    if (t[0] === 'gamerule' && t[1] === 'gameLoopFunction' && t[2]) {
        push('function', t[2], 'reference', 2);
    }

    // ---------------------------------------------------------
    // trigger <objective>
    // ---------------------------------------------------------
    if (t[0] === 'trigger' && t[1]) {
        push('scoreboard', t[1], 'reference', 1);
    }

    // ---------------------------------------------------------
    // advancement grant|revoke <t> only|from|until|through <res>
    // ---------------------------------------------------------
    if (t[0] === 'advancement' && (t[1] === 'grant' || t[1] === 'revoke') && t[4]) {
        push('advancement', t[4], 'reference', 4);
    }

    // ---------------------------------------------------------
    // summon ... {Tags:[...]} —— 标签定义
    // ---------------------------------------------------------
    if (t[0] === 'summon') {
        const nbt = t[5];
        const tk = tokens[5];
        if (nbt && tk && nbt.includes('Tags:[')) {
            const listStart = nbt.indexOf('Tags:[') + 'Tags:['.length;
            const rest = nbt.slice(listStart);
            // ⚠️ 不能用 indexOf('"]') 截断：那只会取到第一个标签，
            //    {Tags:["boss","elite"]} 会丢掉 elite。
            const close = rest.indexOf(']');
            const seg = close >= 0 ? rest.slice(0, close) : rest;
            const re = /"([^"]*)"/gu;
            let m: RegExpExecArray | null;
            while ((m = re.exec(seg)) !== null) {
                const raw = m[1];
                const name = raw.trim();
                if (name === '') { continue; }
                // 跳过引号与前后空白，定位到标签名本体
                const inner = raw.indexOf(name);
                if (inner < 0) { continue; }
                const absInToken = listStart + m.index + 1 + inner;
                out.push({
                    kind: 'tag',
                    value: name,
                    role: 'definition',
                    start: tk.start + absInToken,
                    end: tk.start + absInToken + name.length,
                    hashStart: -1,
                });
            }
        }
    }

    // ---------------------------------------------------------
    // 选择器内的 score_<obj> / score_<obj>_min / tag= / team=
    // ---------------------------------------------------------
    for (const idx of selectorPositions(t)) {
        const tk = tokens[idx];
        if (!tk.text.startsWith('@')) { continue; }
        for (const p of selectorPredicates(tk.text)) {
            if (p.key === 'tag') {
                out.push({ kind: 'tag', value: p.value, role: 'reference', start: tk.start + p.start, end: tk.start + p.end, hashStart: -1 });
            } else if (p.key === 'team') {
                out.push({ kind: 'team', value: p.value, role: 'reference', start: tk.start + p.start, end: tk.start + p.end, hashStart: -1 });
            } else if (p.key.startsWith('score_')) {
                const rest = p.key.slice('score_'.length);
                const isMin = rest.endsWith('_min');
                const name = isMin ? rest.slice(0, -4) : rest;
                if (name !== '') {
                    out.push({
                        kind: 'scoreboard',
                        value: name,
                        role: 'reference',
                        // ⚠️ 必须指向 key 里的目标名，不能指向 value：
                        //    @a[score_shared=5] 的目标名是 key 中的 "shared"。
                        //    若指向 value，重命名会把 5 换掉，把选择器改坏。
                        start: tk.start + p.keyStart,
                        end: tk.start + p.keyStart + name.length,
                        hashStart: -1,
                    });
                }
            }
        }
    }

    void at;
    return out;
}

/**
 * 哪些 token 下标在 1.12.2 中是「选择器参数位」。
 *
 * ⚠️ 必须穷举而非全行扫描：否则 `say @a[tag=x]`（那只是消息文本）
 *    会被当成标签引用，重命名标签时会把用户的聊天文本一起改掉。
 *    未列出的命令一律不认选择器 —— 宁可漏引用，不可改错内容。
 *
 * 各位置与 dsl/commands/*.ts 中 suggestSelectors 的挂载点保持一致。
 */
function selectorPositions(t: readonly string[]): number[] {
    const out: number[] = [];
    const cmd = t[0];

    // <target> 在第 3 位的实体命令（t[0] 为命令名，t[1] 为子命令的情况另算）
    const targetAt2 = new Set([
        'clear', 'effect', 'enchant', 'gamemode', 'give', 'tp', 'teleport',
        'spawnpoint', 'title', 'playsound', 'stopsound', 'testfor', 'tellraw', 'execute',
    ]);
    if (targetAt2.has(cmd) && t.length > 2) { out.push(2); }
    // kill 的 1.12.2 语法是 kill [target] —— 目标可省略，
    // 因此「有第 3 个 token」本身就说明那是 target（没有子命令）。
    if (cmd === 'kill' && t.length > 1) { out.push(1); }

    switch (cmd) {
        case 'scoreboard':
            if (t[1] === 'players') {
                if (t[2] === 'tag') { out.push(4); }
                // operation: <targetName> <targetObjective> <operation> <selector> <objective>
                // 选择器位是 <targetName>(3) 与 <selector>(6)
                else if (t[2] === 'operation') { out.push(3); out.push(6); }
                else if (t[2] && t[2] !== 'list') { out.push(3); }
            } else if (t[1] === 'teams') {
                // join: <name> <target> → 选择器在下标 4
                // leave/empty: <target>|<name> → 下标 3
                if (t[2] === 'join') { out.push(4); }
                else if (t[2] === 'leave') { out.push(3); }
            }
            break;
        case 'testforblock':
        case 'testforblocks': out.push(1); break;
        case 'stats': out.push(3); break;
        case 'summon': out.push(3); break;
        case 'replaceitem': out.push(3); break;
        default: break;
    }

    return [...new Set(out.filter(i => i < t.length))];
}

// ============================================================
// 分词（与 diagnostics.tokenize 同口径，但保留位置）
// ============================================================

interface Token {
    readonly text: string;
    /** token 在原行中的起始字符下标 */
    readonly start: number;
}

/**
 * 分词并记录位置。
 *
 * 与 `diagnostics/types.ts` 的 tokenize 口径一致（引号/转义保护、空格切分），
 * 但额外保留每个 token 的起始偏移——诊断层不需要位置，故两者不共用实现。
 */
function scanTokens(lineText: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = lineText.length;

    // 跳过行首空白
    while (i < n && isSpace(lineText[i])) { i++; }
    if (i >= n) { return tokens; }
    if (lineText[i] === '#') { return tokens; }   // 整行注释

    let curStart = i;
    let inQuotes = false;
    let escaped = false;
    let sawContent = false;

    for (; i < n; i++) {
        const ch = lineText[i];
        if (escaped) { escaped = false; sawContent = true; continue; }
        if (ch === '\\') { escaped = true; sawContent = true; continue; }
        if (ch === '"') { inQuotes = !inQuotes; sawContent = true; continue; }
        if (!inQuotes && isSpace(ch)) {
            if (sawContent) {
                tokens.push({ text: lineText.slice(curStart, i), start: curStart });
                sawContent = false;
            }
            // 跳过连续空白
            while (i + 1 < n && isSpace(lineText[i + 1])) { i++; }
            curStart = i + 1;
            continue;
        }
        sawContent = true;
    }
    if (sawContent) {
        tokens.push({ text: lineText.slice(curStart, n), start: curStart });
    }

    // 去掉行尾注释吞掉的部分
    if (tokens.length > 0) {
        const last = tokens[tokens.length - 1];
        const hash = last.text.indexOf('#');
        if (hash > 0) {
            tokens[tokens.length - 1] = { text: last.text.slice(0, hash), start: last.start };
        }
    }
    // 若最后 token 变空则丢弃
    if (tokens.length > 0 && tokens[tokens.length - 1].text === '') { tokens.pop(); }

    return tokens;
}

function isSpace(ch: string): boolean { return ch === ' ' || ch === '\t'; }

function isSelector(s: string): boolean { return s.startsWith('@'); }

// ============================================================
// 选择器谓词（1.12.2 语法）
// ============================================================

interface PredicateSpan {
    readonly key: string;
    readonly value: string;
    /** value 在选择器字符串内的区间 */
    readonly start: number;
    readonly end: number;
    /**
     * key 的**值部分**在选择器字符串内的区间。
     *
     * 对 score_points=10 而言，key 是 "score_points"、值为 "points"，
     * 其区间是 "score_" 之后、"points" 那一段（去掉可选的 "_min"）。
     * 记分板目标名就住在这里，重命名必须改它而不是改 value。
     */
    readonly keyStart: number;
    readonly keyValueLen: number;
}

function selectorPredicates(sel: string): PredicateSpan[] {
    const at = sel.indexOf('@');
    if (at < 0) { return []; }
    const open = sel.indexOf('[', at);
    if (open < 0) { return []; }
    const close = sel.lastIndexOf(']');
    if (close <= open) { return []; }

    const out: PredicateSpan[] = [];
    const inner = sel.slice(open + 1, close);
    let i = 0;
    while (i < inner.length) {
        const eq = inner.indexOf('=', i);
        if (eq < 0) { break; }
        const key = inner.slice(i, eq).trim();
        let j = eq + 1;
        while (j < inner.length && inner[j] !== ',') { j++; }
        const raw = inner.slice(eq + 1, j);
        const lead = raw.length - raw.trimStart().length;
        const val = raw.trim();
        if (key !== '' && val !== '') {
            // key 值部分的位置：去掉 "score_" 前缀与可能的 "_min" 后缀
            let keyStart = open + 1 + i;
            let keyValueLen = key.length;
            if (key.startsWith('score_')) {
                keyStart += 'score_'.length;
                if (key.endsWith('_min')) {
                    keyValueLen -= '_min'.length;
                }
            }
            out.push({
                key,
                value: val,
                start: open + 1 + eq + 1 + lead,
                end: open + 1 + eq + 1 + lead + val.length,
                keyStart,
                keyValueLen,
            });
        }
        i = j + 1;
    }
    return out;
}