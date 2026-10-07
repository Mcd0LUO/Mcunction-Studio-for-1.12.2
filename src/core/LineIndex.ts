/**
 * LineIndex — 统一数据缓存层
 *
 * 行级追踪 + 引用计数 + 类型索引。
 * 内置 extractor（scoreboard/team/tag）和 YAML extractor 共用同一套缓存。
 *
 * 文件键约定：始终使用 `uri.toString()`（如 file:///...），禁止用 resName。
 */

export interface Entry {
    type: string;
    value: string;
    meta?: unknown;
}

/** 磁盘缓存序列化格式：file → (line → entries) */
export type LineIndexExport = Array<[string, Array<[number, Entry[]]>]>;

interface RefCount {
    count: number;
    locations: Set<string>;  // "file:line"
}

function loc(file: string, line: number): string { return `${file}:${line}`; }

export class LineIndex {
    /** file(uri.toString) → line → entries */
    private lines = new Map<string, Map<number, Entry[]>>();
    /** type → value → { count, locations } */
    private types = new Map<string, Map<string, RefCount>>();

    // ================================================================
    // 写入
    // ================================================================

    /**
     * 覆盖整行（先 clear 再写入）。
     * 若需与已有条目合并，请用 appendEntries。
     */
    addLine(file: string, line: number, entries: Entry[]): void {
        this.clearLine(file, line);
        this.appendEntries(file, line, entries);
    }

    /** 追加条目到指定行（不清空已有条目） */
    appendEntries(file: string, line: number, entries: Entry[]): void {
        if (entries.length === 0) { return; }

        let fileMap = this.lines.get(file);
        if (!fileMap) {
            fileMap = new Map();
            this.lines.set(file, fileMap);
        }
        const existing = fileMap.get(line) ?? [];
        for (const e of entries) {
            existing.push(e);
            this.incRef(file, line, e);
        }
        fileMap.set(line, existing);
    }

    private incRef(file: string, line: number, e: Entry): void {
        let tm = this.types.get(e.type);
        if (!tm) {
            tm = new Map();
            this.types.set(e.type, tm);
        }
        let rc = tm.get(e.value);
        if (!rc) {
            rc = { count: 0, locations: new Set() };
            tm.set(e.value, rc);
        }
        rc.count++;
        rc.locations.add(loc(file, line));
    }

    // ================================================================
    // 清除
    // ================================================================

    clearLine(file: string, line: number): void {
        const fileMap = this.lines.get(file);
        if (!fileMap) { return; }
        const old = fileMap.get(line);
        if (!old) { return; }
        fileMap.delete(line);
        if (fileMap.size === 0) {
            this.lines.delete(file);
        }

        for (const e of old) {
            const tm = this.types.get(e.type);
            if (!tm) { continue; }
            const rc = tm.get(e.value);
            if (!rc) { continue; }
            rc.count--;
            rc.locations.delete(loc(file, line));
            if (rc.count <= 0) {
                tm.delete(e.value);
            }
            if (tm.size === 0) {
                this.types.delete(e.type);
            }
        }
    }

    clearFile(file: string): void {
        const fileMap = this.lines.get(file);
        if (!fileMap) { return; }
        // 复制 key 列表，避免迭代中修改
        for (const line of [...fileMap.keys()]) {
            this.clearLine(file, line);
        }
    }

    clear(): void {
        this.lines.clear();
        this.types.clear();
    }

    // ================================================================
    // 查询
    // ================================================================

    /**
     * 所有被索引过的文件键（uri.toString）。
     *
     * 这是索引的「真实全集」——不同于扫描入口 getAllFunctionsPaths()，
     * 它不受 IgnorePattern 过滤，因此能反映历史上曾被索引过的文件。
     * 增量剔除与磁盘缓存校验都需要它，否则被排除的文件会留下永久幽灵。
     */
    indexedFiles(): string[] {
        return [...this.lines.keys()];
    }

    /** 获取某类型的所有值 */
    getByType(type: string): { value: string; count: number; meta?: unknown }[] {
        const tm = this.types.get(type);
        if (!tm) { return []; }
        const result: { value: string; count: number; meta?: unknown }[] = [];
        for (const [value, rc] of tm) {
            result.push({ value, count: rc.count });
        }
        return result;
    }

    /** 获取某类型的所有值（仅值名，兼容旧 API） */
    getValues(type: string): string[] {
        const tm = this.types.get(type);
        return tm ? [...tm.keys()] : [];
    }

    /** 某类型某值的全部引用位置（file uri.toString → 行号列表），用于定义跳转 */
    getLocations(type: string, value: string): { file: string; line: number }[] {
        const rc = this.types.get(type)?.get(value);
        if (!rc) { return []; }
        const result: { file: string; line: number }[] = [];
        for (const l of rc.locations) {
            const idx = l.lastIndexOf(':');
            if (idx < 0) { continue; }
            const line = Number(l.slice(idx + 1));
            if (Number.isNaN(line)) { continue; }
            result.push({ file: l.slice(0, idx), line });
        }
        return result;
    }

    /** 测试/调试：某文件某行的条目 */
    getLineEntries(file: string, line: number): Entry[] {
        return this.lines.get(file)?.get(line)?.slice() ?? [];
    }

    /** 该文件在 LineIndex 中的最大行号；无数据返回 -1 */
    getMaxLine(file: string): number {
        const fileMap = this.lines.get(file);
        if (!fileMap || fileMap.size === 0) { return -1; }
        // 不用 Math.max(...keys)：单文件行数超过约 12.5 万时展开参数会撑爆调用栈（RangeError）
        let max = -1;
        for (const line of fileMap.keys()) {
            if (line > max) { max = line; }
        }
        return max;
    }

    // ================================================================
    // 序列化（磁盘 index-cache）
    // ================================================================

    /** 导出行级数据；types 引用计数由 importState 重建 */
    exportState(): LineIndexExport {
        const out: LineIndexExport = [];
        for (const [file, fileMap] of this.lines) {
            const rows: Array<[number, Entry[]]> = [];
            for (const [line, entries] of fileMap) {
                rows.push([line, entries.map(e => {
                    const copy: Entry = { type: e.type, value: e.value };
                    if (e.meta !== undefined) { copy.meta = e.meta; }
                    return copy;
                })]);
            }
            out.push([file, rows]);
        }
        return out;
    }

    /** 清空后从快照重建 lines + types */
    importState(data: LineIndexExport): void {
        this.clear();
        if (!Array.isArray(data)) { return; }
        for (const row of data) {
            if (!Array.isArray(row) || row.length < 2) { continue; }
            const file = row[0];
            const lines = row[1];
            if (typeof file !== 'string' || !Array.isArray(lines)) { continue; }
            for (const lineRow of lines) {
                if (!Array.isArray(lineRow) || lineRow.length < 2) { continue; }
                const line = lineRow[0];
                const entries = lineRow[1];
                if (typeof line !== 'number' || !Array.isArray(entries) || entries.length === 0) { continue; }
                this.appendEntries(file, line, entries);
            }
        }
    }
}
