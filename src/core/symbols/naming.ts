/**
 * 符号命名规则 —— 纯函数，零 vscode 依赖。
 *
 * 把「名字多长算合法、哪些字符不能出现」收敛到一处，
 * 避免诊断（提示名字太长）与重命名（拒绝非法新名）各写一份而走偏 ——
 * 事实上早先就存在两处不一致：一处按 UTF-16 长度、一处按码点长度。
 *
 * ## 长度上限的来源（均已核对 wiki，不凭记忆）
 *
 *   Commands/scoreboard（2018-05-26 修订，1.12.2 发布前）原文：
 *     scoreboard objectives add <name> <criteria> [display name...]
 *       name 必须未被占用，且 "must be at most 16 characters"
 *       display name "must be at most 32 characters"
 *     scoreboard teams add <name> [display name...]
 *       name "must be at most 16 characters"
 *       display name "must be at most 32 characters"
 *
 *   ⚠️ 标签（scoreboard players tag）与假玩家名**没有**在 wiki 上写明的长度上限，
 *      因此不套用 16 —— 宁可漏报，也不要用一个凭印象编出来的数字去拒绝用户的合法输入。
 */

/** 记分板目标名 / 队伍名的长度上限（wiki 原文：at most 16 characters） */
export const NAME_MAX = 16;

/** 记分板显示名 / 队伍显示名的长度上限（wiki 原文：at most 32 characters） */
export const DISPLAY_NAME_MAX = 32;

/**
 * 按 **Unicode 码点** 计算字符数。
 *
 * 不用 `String.length`：那是 UTF-16 码元数，星平面字符（如 emoji、𝕏）
 * 会被算成 2 个，导致同一个名字在两处得到不同判定。
 * wiki 说的是 "characters"，按码点计更贴近语义。
 */
export function codePointLength(s: string): number {
    let n = 0;
    for (const _ of s) { n++; }
    return n;
}

/** 名字中不允许出现的字符：空白、命令分隔符、选择器与 JSON 保留符号 */
const FORBIDDEN = /[\s,.:=@#"{}\[\]\\/]/u;

export interface NameRuleOptions {
    /**
     * 是否允许前导 `#`（假玩家名写作 `#fp`）。
     * 允许时先剥掉 `#` 再校验其余部分。
     */
    readonly allowHashPrefix?: boolean;
    /**
     * 长度上限；**不传表示不限制**。
     *
     * 刻意做成可选：只有 wiki 明确写了上限的符号类型
     * （记分板目标、队伍 → NAME_MAX）才传，
     * 标签/假玩家不传，避免用臆测的限制拒绝合法输入。
     */
    readonly maxLength?: number;
}

/**
 * 判断一个名字能否作为符号名（用于重命名校验）。
 *
 * 校验内容：
 *   1. 非空
 *   2. 不含空白与命令/选择器分隔符（否则改名后命令直接失效）
 *   3. 若指定 maxLength，则码点数不得超过
 */
export function isValidSymbolName(name: string, opts: NameRuleOptions = {}): boolean {
    let body = name;
    if (opts.allowHashPrefix && body.startsWith('#')) {
        body = body.slice(1);
    }
    if (body === '') { return false; }
    if (FORBIDDEN.test(body)) { return false; }
    if (opts.maxLength !== undefined && codePointLength(body) > opts.maxLength) { return false; }
    return true;
}

/**
 * 剥掉假玩家名的前导 `#`。
 *
 * 重命名的替换区间**只覆盖名字本身**（不含 `#`，见 extractor 的 hashStart），
 * 因此替换文本必须是裸名，否则会出现 `##newname`。
 */
export function bareName(name: string): string {
    return name.startsWith('#') ? name.slice(1) : name;
}