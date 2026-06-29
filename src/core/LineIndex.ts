/**
 * LineIndex — 统一数据缓存层
 *
 * 行级追踪 + 引用计数 + 类型索引。
 * 内置 extractor（scoreboard/team/tag）和 YAML extractor 共用同一套缓存。
 */

export interface Entry {
    type: string;
    value: string;
    meta?: unknown;
}

interface RefCount {
    count: number;
    locations: Set<string>;  // "file:line"
}

function loc(file: string, line: number): string { return `${file}:${line}`; }

export class LineIndex {
    /** file → line → entries */
    private lines = new Map<string, Map<number, Entry[]>>();
    /** type → value → { count, locations } */
    private types = new Map<string, Map<string, RefCount>>();

    // ================================================================
    // 写入
    // ================================================================

    addLine(file: string, line: number, entries: Entry[]): void {
        this.clearLine(file, line);
        if (entries.length === 0) { return; }

        let fileMap = this.lines.get(file);
        if (!fileMap) { fileMap = new Map(); this.lines.set(file, fileMap); }
        fileMap.set(line, entries);

        for (const e of entries) {
            let tm = this.types.get(e.type);
            if (!tm) { tm = new Map(); this.types.set(e.type, tm); }
            let rc = tm.get(e.value);
            if (!rc) { rc = { count: 0, locations: new Set() }; tm.set(e.value, rc); }
            rc.count++;
            rc.locations.add(loc(file, line));
        }
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
        if (fileMap.size === 0) { this.lines.delete(file); }

        for (const e of old) {
            const tm = this.types.get(e.type);
            if (!tm) { continue; }
            const rc = tm.get(e.value);
            if (!rc) { continue; }
            rc.count--;
            rc.locations.delete(loc(file, line));
            if (rc.count <= 0) { tm.delete(e.value); }
            if (tm.size === 0) { this.types.delete(e.type); }
        }
    }

    clearFile(file: string): void {
        const fileMap = this.lines.get(file);
        if (!fileMap) { return; }
        for (const line of fileMap.keys()) {
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
}
