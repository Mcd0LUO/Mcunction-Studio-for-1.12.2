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
    return extract(lineText, true);
}

/**
 * 只抽**本层**符号，不递归进 `execute` 的内层命令。
 *
 * 用于"内层命令已由它自己的处理器单独索引过"的场景：
 * `DataLoader.handleSingleLine` 按**活跃命令**分派，
 * `execute @a[tag=x] ~ ~ ~ say hi` 的活跃命令是 `say`，
 * 于是 execute 的处理器根本不会被调用，**外层选择器永远进不了索引**。
 * 那里补一次本层抽取即可 —— 若这里也递归，内层符号会被索引两遍，
 * 而 LineIndex.appendEntries 不去重，引用计数会虚高。
 */
export function extractOuterSymbols(lineText: string): SymbolOccurrenceWithHash[] {
    return extract(lineText, false);
}

function extract(lineText: string, recurseExecute: boolean): SymbolOccurrenceWithHash[] {
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
    // execute 的内层命令 —— 递归抽取，列偏移回补
    //
    // ⚠️ 此前完全没处理：下面的判断全是 `t[0] === '<命令>'`，
    //    而 `execute @s ~ ~ ~ function ns:x` 的 t[0] 是 execute，
    //    于是内层命令的符号**一个都抽不出来**。后果：
    //      · `execute … scoreboard players set @s obj 1` 的记分板引用抽不到
    //      · `execute … function ns:x` 的函数引用抽不到
    //    索引侧不受影响（DataLoader 按"活跃命令"分派，会拿到内层命令），
    //    但 References / Rename 会**用本函数重新抽取原行来算列区间**，
    //    抽不到就整条丢弃 —— 表现是"改了两处、漏了 execute 里那处"。
    // ---------------------------------------------------------
    if (recurseExecute && t[0] === 'execute') {
        const innerIdx = executeInnerStart(t);
        if (innerIdx > 0 && innerIdx < tokens.length) {
            const base = tokens[innerIdx].start;
            for (const o of extract(lineText.slice(base), true)) {
                out.push({
                    ...o,
                    start: o.start + base,
                    end: o.end + base,
                    hashStart: o.hashStart >= 0 ? o.hashStart + base : o.hashStart,
                });
            }
        }
    }

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
    // stats … set <stat> <selector> <objective>
    //
    // wiki（Commands/stats，2018-05 修订）Java Edition：
    //   stats entity <selector2> set <stat> <selector> <objective>
    //   stats block <x> <y> <z> set <stat> <selector> <objective>
    //   stats … clear <stat>
    //
    // ⚠️ 此前**完全没抽** —— 那个 <objective> 是记分板引用，
    //    重命名记分板目标时这一处会被漏改。
    //    注意 t[1] 是字面量 entity/block，所以下标要多数一个。
    // ---------------------------------------------------------
    if (t[0] === 'stats') {
        if (t[1] === 'entity' && t[3] === 'set' && t[6]) {
            push('scoreboard', t[6], 'reference', 6);
        } else if (t[1] === 'block' && t[5] === 'set' && t[8]) {
            push('scoreboard', t[8], 'reference', 8);
        }
    }

    // ---------------------------------------------------------
    // advancement grant|revoke|test
    //
    // wiki（Commands/advancement，2018-05 修订）Java Edition：
    //   advancement <grant|revoke> <player> only <advancement> [criterion]
    //   advancement <grant|revoke> <player> <until|from|through> <advancement>
    //   advancement <grant|revoke> <player> everything
    //   advancement test <player> <advancement> [criterion]
    //
    // ⚠️ `test` 形式此前整个漏了 —— 进度名在下标 3 而不是 4，
    //    于是 `advancement test @s ns:foo` 的引用既不进索引也搜不到。
    // ---------------------------------------------------------
    if (t[0] === 'advancement') {
        if ((t[1] === 'grant' || t[1] === 'revoke') && t[4]) {
            push('advancement', t[4], 'reference', 4);
        } else if (t[1] === 'test' && t[3]) {
            push('advancement', t[3], 'reference', 3);
        }
    }

    // ---------------------------------------------------------
    // NBT 里的 Tags:[...] —— 标签定义
    //
    // 适用于带 NBT 参数的实体命令：
    //   summon <entity> [x] [y] [z] [dataTag]     ← dataTag 位置随坐标可选而漂移
    //   entitydata <entity> <dataTag>
    //
    // ⚠️ 此前只处理 summon 且**写死下标 5**，于是
    //    · `summon creeper`（无坐标）的 NBT 抽不到
    //    · `entitydata @s {Tags:["boss"]}` 完全不抽 —— 而它同样是标签定义
    // 现在从 `from` 起找第一个含 Tags:[ 的 token。
    // ---------------------------------------------------------
    const pushNbtTags = (from: number): void => {
        for (let i = Math.max(1, from); i < t.length; i++) {
            const nbt = t[i];
            const tk = tokens[i];
            if (!nbt || !tk || !nbt.includes('Tags:[')) { continue; }
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
            return;   // 一行里只有一处 Tags 列表
        }
    };
    if (t[0] === 'summon') { pushNbtTags(2); }
    if (t[0] === 'entitydata') { pushNbtTags(2); }

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
 * `execute` 内层命令的 token 下标。
 *
 * wiki（Commands/execute，2018-05 修订）Java Edition 两种形式：
 *   execute <entity> <x> <y> <z> <command …>
 *   execute <entity> <x> <y> <z> detect <x2> <y2> <z2> <block> <dataValue> <command …>
 *
 * 前一种内层从 5 开始；后一种多 6 个 token（detect + 三个坐标 + 方块 + 数据值），
 * 内层从 11 开始。取不到时返回 -1，调用方跳过。
 */
function executeInnerStart(t: readonly string[]): number {
    if (t.length < 5) { return -1; }
    if (t[5] === 'detect') {
        return t.length > 11 ? 11 : -1;
    }
    return t.length > 5 ? 5 : -1;
}

/**
 * 哪些 token 下标在 1.12.2 中是「选择器参数位」。
 *
 * ⚠️ 必须穷举而非全行扫描：否则 `say @a[tag=x]`（那只是消息文本）
 *    会被当成标签引用，重命名标签时会把用户的聊天文本一起改掉。
 *    未列出的命令一律不认选择器 —— 宁可漏引用，不可改错内容。
 *
 * ⚠️ 位置必须逐条对照 wiki 原文（各 `Commands/<name>` 页 2018-05 修订）。
 *    此前这张表**基本全错**：写成「目标在第 3 位（下标 2）的一批实体命令」，
 *    而实际上只有 `gamemode <mode> [player]` 的目标真在下标 2；
 *    `effect <player> …`、`give <player> …`、`execute <entity> …` 等
 *    目标都在下标 1。实测 17 条命令里 **15 条抽不到选择器谓词** ——
 *    `@a[tag=x]` 不进索引，重命名标签/队伍/记分板时这些引用全被漏掉。
 *
 * 位置允许多报：非选择器 token 会被 `isSelector` 过滤掉，
 * 所以 `tp`/`particle` 这类随可选参数漂移的位置可以一次列好几个。
 */
function selectorPositions(t: readonly string[]): number[] {
    const out: number[] = [];
    const cmd = t[0];
    const at = (i: number) => { if (i < t.length) { out.push(i); } };

    switch (cmd) {
        // ---- 目标在下标 1 的命令 ----
        case 'clear':                             // [player] [item] …
        case 'effect':                            // <player> <effect> …
        case 'enchant':                           // <player> <enchantment> [level]
        case 'entitydata':                        // <entity> <dataTag>
        case 'execute':                           // <entity> <x> <y> <z> …
        case 'give':                              // <player> <item> …
        case 'kill':                              // [player|entity]
        case 'spawnpoint':                        // [player] [x y z]
        case 'stopsound':                         // <player> [source] [sound]
        case 'tellraw':                           // <player> <json>
        case 'testfor':                           // <player> [dataTag]
        case 'title':                             // <player> clear|reset|title|…
            at(1);
            break;

        // ---- 目标在下标 2 ----
        // advancement <grant|revoke|test> <player> … —— t[1] 是子命令，玩家在 2
        case 'advancement': at(2); break;
        case 'gamemode': at(2); break;            // <mode> [player]
        case 'xp': at(2); break;                  // <amount> [player]

        // ---- 目标位置随可选参数漂移 ----
        case 'tp':                                // [target] <destination|x y z> …
        case 'teleport':                          // <targets> <destination|x y z> …
            at(1); at(2);
            break;
        case 'playsound':                         // <sound> <source> <player> [x] …
            at(3);
            break;
        case 'particle':                          // … <speed> [count] [mode] [player] [params…]
            at(9); at(10); at(11);
            break;
        case 'spreadplayers':                     // <x> <z> <dist> <range> <respect> <player …>
            at(6);
            break;
        case 'replaceitem':                       // entity <selector> … | block <x> <y> <z> …
            if (t[1] === 'entity') { at(2); }
            break;

        // ---- 子命令形态 ----
        case 'scoreboard':
            if (t[1] === 'players') {
                if (t[2] === 'tag') {
                    at(3);                        // tag <entity> add|remove <tagName>
                } else if (t[2] === 'operation') {
                    at(3); at(6);                 // <targetName> <obj> <op> <selector> <obj>
                } else if (t[2] && t[2] !== 'objectives') {
                    at(3);                        // set|add|remove|reset|enable|test|list <entity>
                }
            } else if (t[1] === 'teams') {
                if (t[2] === 'join') { at(4); }   // join <team> [entities...]
                else if (t[2] === 'leave') { at(3); }
            }
            break;
        case 'stats':
            // wiki：stats entity <selector2> set <stat> <selector> <objective>
            //       stats block <x> <y> <z> set <stat> <selector> <objective>
            // t[1] 是字面量 entity/block，所以选择器位比"数参数"再多一个
            if (t[1] === 'entity') {
                at(2); at(5);
            } else if (t[1] === 'block') {
                at(7);
            }
            break;

        default:
            // blockdata / clone / defaultgamemode / difficulty / fill / function /
            // gamerule / say / setblock / setworldspawn / summon / testforblock /
            // testforblocks / time / toggledownfall / trigger / weather / worldborder
            // —— 这些命令 1.12.2 语法里没有选择器参数位
            break;
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
// 补全替换区间
// ============================================================

export interface CharSpan {
    readonly start: number;
    readonly end: number;
}

/**
 * 光标处「正在输入的参数值」在行内的字符区间。
 *
 * ## 为什么需要它
 *
 * VS Code 在补全项没有显式 `range` 时，会用**语言词法**自行推算替换范围。
 * `.mcfunction` 原本没有声明 `wordPattern`，走的是默认词法 ——
 * 它把 `:` `/` `.` `@` `#` 都当分隔符，于是：
 *
 *   `function ns:`   光标在末尾 → 词范围为空 → 接受 `ns:test` 得到 `function ns:ns:test`
 *   `function ns:a`  光标在末尾 → 词范围只覆盖 `a` → 同样得到 `ns:ns:test`
 *
 * 即**命名空间被重复插入**。这正是「补全精度极不准确」的根因之一
 * （已在真实 VS Code 上实测确认）。
 *
 * ## 本函数的作用
 *
 * 补全项分两类，替换语义不同：
 *   · **参数值候选**（函数名 / 目标名…）→ 替换掉用户已输入的前缀
 *   · **下一级字面量**（if/unless、maskMode…）→ **插入**在光标处，不替换任何东西
 * 两者的区间由此处与调用方共同决定，不再依赖 VS Code 的猜测。
 *
 * @param lineText 整行文本（含光标之后的字符，用于确定值的结束位置）
 * @param character 光标列（0-based）
 */
export function valueSpanAt(lineText: string, character: number): CharSpan {
    const ch = Math.max(0, Math.min(character, lineText.length));

    // 当前空白分隔 token 的范围
    let tokStart = ch;
    while (tokStart > 0 && !isSpace(lineText[tokStart - 1])) { tokStart--; }
    let tokEnd = ch;
    while (tokEnd < lineText.length && !isSpace(lineText[tokEnd])) { tokEnd++; }
    const token = lineText.slice(tokStart, tokEnd);

    // 选择器内部：值在最后一个 = 或 , 之后，到 , 或 ] 之前
    if (isSelector(token)) {
        const open = token.indexOf('[');
        if (open >= 0) {
            const absOpen = tokStart + open;
            if (ch > absOpen) {
                let start = absOpen + 1;
                for (let i = ch - 1; i > absOpen; i--) {
                    if (lineText[i] === '=' || lineText[i] === ',') { start = i + 1; break; }
                }
                let end = tokEnd;
                for (let i = ch; i < tokEnd; i++) {
                    if (lineText[i] === ',' || lineText[i] === ']') { end = i; break; }
                }
                return { start, end };
            }
        }
    }

    return { start: tokStart, end: tokEnd };
}

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