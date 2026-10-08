/**
 * 符号解析 —— 在整个工作区里找出某个符号的全部出现位置。
 *
 * ## 职责边界
 *
 * `LineIndex` 负责「哪些行出现过这个值」，但它没有列位置、也分不清角色。
 * 本模块负责：
 *   1. 用 LineIndex 快速缩小候选行（O(1) 查表，而非全量扫描）
 *   2. 对候选行跑 `extractSymbols` 拿到精确列区间
 *   3. 按 kind + role 过滤掉同名不同义的匹配
 *
 * 关键取舍：**宁可少报也不能错报**。rename 改错一个 token 是数据损坏，
 * 而漏改只是用户多点一次 Ctrl+Z。
 */
import { SymbolKind, SymbolOccurrenceWithHash, extractSymbols } from './extractor';

/** 一处符号出现：文件 + 行 + 列区间 */
export interface SymbolLocation {
    /** uri.toString() */
    readonly file: string;
    readonly line: number;
    readonly start: number;
    readonly end: number;
    readonly role: 'definition' | 'reference';
    /** fake_player：# 的位置；其余 -1（rename 时需连 # 一起替换） */
    readonly hashStart: number;
}

/** 索引的最小只读子集：LineIndex 提供 getLocations 与 indexedFiles */
export interface SymbolIndexLike {
    /** 某类型某值的全部出现位置（file:line） */
    getLocations(type: string, value: string): { file: string; line: number }[];
    /** 已被索引的全部文件键 */
    indexedFiles(): string[];
}

/** 读取某行文本的回调（由调用方桥接 workspace.fs） */
export type LineReader = (file: string, line: number) => string | undefined;

/** 符号解析选项 */
export interface ResolveOptions {
    readonly index: SymbolIndexLike;
    readonly readLine: LineReader;
    /** 行文本缓存，避免同一行被反复读取 */
    readonly cache?: Map<string, string>;
}

export class SymbolResolver {

    constructor(private readonly opts: ResolveOptions) {}

    /**
     * 找出 kind + value 的全部出现位置。
     *
     * @param roles 要包含的角色；默认两者都要
     *              （references 需要定义+引用，rename 也一样；
     *               只查引用时传 ['reference']）
     */
    resolve(
        kind: SymbolKind,
        value: string,
        roles: readonly ('definition' | 'reference')[] = ['definition', 'reference'],
    ): SymbolLocation[] {
        const cache = this.opts.cache;
        // 先用 LineIndex 缩小到候选行；该类型未被索引时直接返回
        const candidates = this.opts.index.getLocations(kind, value);
        if (candidates.length === 0) { return []; }

        const roleSet = new Set(roles);
        const out: SymbolLocation[] = [];
        const seen = new Set<string>();

        for (const c of candidates) {
            const text = this.readLineCached(c.file, c.line, cache);
            if (text === undefined) { continue; }
            const occs = extractSymbols(text);
            for (const o of occs) {
                if (o.kind !== kind) { continue; }
                if (o.value !== value) { continue; }
                if (!roleSet.has(o.role)) { continue; }
                const key = `${c.file}:${c.line}:${o.start}`;
                if (seen.has(key)) { continue; }
                seen.add(key);
                out.push({
                    file: c.file,
                    line: c.line,
                    start: o.start,
                    end: o.end,
                    role: o.role,
                    hashStart: o.hashStart,
                });
            }
        }

        out.sort((a, b) => (a.line - b.line) || (a.start - b.start));
        return out;
    }

    /**
     * 判断某个位置上的符号是什么。
     *
     * references / rename 的入口：用户把光标放在 `mytag` 上，
     * 需要先知道这是标签还是队伍，才能决定查哪个索引。
     */
    symbolAt(
        kind: SymbolKind,
        file: string,
        line: number,
        character: number,
        cache?: Map<string, string>,
    ): SymbolOccurrenceWithHash | null {
        const text = this.readLineCached(file, line, cache);
        if (text === undefined) { return null; }
        for (const o of extractSymbols(text)) {
            if (o.kind !== kind) { continue; }
            // 光标落在 token 内部或紧贴其后一位都算命中——
            // VS Code 里点击 token 末字符的右侧（character == end）同样视为选中。
            if (character < o.start || character > o.end) { continue; }
            return o;
        }
        return null;
    }

    /** 该位置是否为符号起点（供 rename 判定是否可重命名） */
    isOnSymbol(kind: SymbolKind, file: string, line: number, character: number, cache?: Map<string, string>): boolean {
        return this.symbolAt(kind, file, line, character, cache) !== null;
    }

    private readLineCached(file: string, line: number, cache?: Map<string, string>): string | undefined {
        const key = `${file}:${line}`;
        if (cache) {
            const hit = cache.get(key);
            if (hit !== undefined) { return hit; }
        }
        const text = this.opts.readLine(file, line);
        if (cache && text !== undefined) { cache.set(key, text); }
        return text;
    }
}

/**
 * 构造 readLine：优先走已打开文档（编辑中），否则读磁盘。
 *
 * 磁盘读取是 async，而 extractSymbols 是同步的；因此这里要求调用方
 * 预先把候选行的文本准备好（见 Provider 的 collectLineTexts）。
 * 本工厂仅用于同步场景（如测试），生产路径走 ProvidersOfFile。
 */
export function makeSyncResolver(
    index: SymbolIndexLike,
    readLine: LineReader,
): SymbolResolver {
    return new SymbolResolver({ index, readLine });
}