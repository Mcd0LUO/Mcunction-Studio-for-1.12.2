/**
 * 磁盘索引缓存：data/.McfStudio/index-cache.json.gz
 *
 * 跨会话冷启动时，若工作区函数元数据指纹未变，
 * 则直接反序列化 IndexedStore，跳过全量解析。
 *
 * v2：相对 rootDir 的路径 + 文件表
 * v3：+ path|mtime 的 sha1 fingerprint（非内容 hash）
 * 磁盘：JSON.stringify + zlib.gzip（Node 内置，零依赖）
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as zlib from 'zlib';
import * as vscode from 'vscode';
import { rootDir } from '../../extension';
import { IndexedStoreExport } from './IndexedStore';
import { LineIndexExport } from '../LineIndex';
import { IndexEntry } from './types';

/** v3：相对路径 + 文件表 + fingerprint；旧版缓存失效并重建 */
export const INDEX_CACHE_VERSION = 3;
/** 主缓存：gzip 压缩的 JSON */
export const INDEX_CACHE_REL = ['index-cache.json.gz'] as const;
/** 兼容读取旧明文 JSON（写入时会清理） */
const INDEX_CACHE_LEGACY_REL = ['index-cache.json'] as const;

/** 内存 / 逻辑层（绝对 uri.toString()） */
export interface IndexCachePayload {
    version: number;
    /** path+mtime 指纹（相对路径排序后 sha1） */
    fingerprint: string;
    /** uri.toString() → mtime (ms) */
    mtimes: Record<string, number>;
    functionResNames: string[];
    advancementResNames: string[];
    store: IndexedStoreExport;
}

/** 磁盘层：相对路径 + 下标 */
interface DiskStoreV2 {
    scoreboards: Array<[string, { type: string; desc: string; f: number; l: number }]>;
    teams: Array<[string, { f: number; l: number; color?: string; rule?: string }]>;
    funcDefs: IndexedStoreExport['funcDefs'];
    docIndex: IndexedStoreExport['docIndex'];
    /** resName → files[] 下标 */
    fileKeyByRes: Array<[string, number]>;
    /** files[] 下标 → 行条目 */
    lineIndex: Array<[number, Array<[number, { type: string; value: string; meta?: unknown }[]]>]>;
}

interface IndexCacheDiskV3 {
    version: 3;
    /** 相对路径 + mtime 的元数据指纹 */
    fingerprint: string;
    /** 相对 rootDir 的 posix 路径（如 functions/ns/a.mcfunction） */
    files: string[];
    /** 与 files 平行的 mtime */
    mtimes: number[];
    functionResNames: string[];
    advancementResNames: string[];
    store: DiskStoreV2;
}

export function cacheUri(): vscode.Uri | null {
    if (!rootDir) { return null; }
    return vscode.Uri.joinPath(rootDir, '.McfStudio', ...INDEX_CACHE_REL);
}

function legacyCacheUri(): vscode.Uri | null {
    if (!rootDir) { return null; }
    return vscode.Uri.joinPath(rootDir, '.McfStudio', ...INDEX_CACHE_LEGACY_REL);
}

/** gzip 魔数 1F 8B；否则当明文 UTF-8 JSON */
function decodeCacheBytes(buf: Uint8Array): string {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        return zlib.gunzipSync(Buffer.from(buf)).toString('utf-8');
    }
    return new TextDecoder('utf-8').decode(buf);
}

function encodeCacheJson(jsonText: string): Buffer {
    // level 1：写路径更快；体积仍远小于明文（末法 ~800KB → ~100KB 级）
    return zlib.gzipSync(Buffer.from(jsonText, 'utf-8'), { level: 1 });
}

// ================================================================
// 路径：绝对 uri ↔ 相对 posix
// ================================================================

/**
 * 绝对 uri → 相对 root 的 posix 路径。
 * 必须与 fromPosixRel 使用同一套 fsPath 规范化，否则 mtime 键对不上。
 */
function toPosixRel(absUriStr: string, root: vscode.Uri): string | null {
    try {
        const u = vscode.Uri.parse(absUriStr);
        let rel = path.relative(root.fsPath, u.fsPath);
        rel = rel.split(path.sep).join('/');
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) {
            return null;
        }
        return rel;
    } catch {
        return null;
    }
}

/**
 * 相对路径 → 绝对 uri.toString()。
 * 用 Uri.file(path.join) 与 findFiles / stat 产生的键一致。
 */
function fromPosixRel(rel: string, root: vscode.Uri): string {
    const abs = path.join(root.fsPath, ...rel.split('/').filter(s => s.length > 0));
    return vscode.Uri.file(abs).toString();
}

// ================================================================
// 压缩 / 展开
// ================================================================

class FileTable {
    readonly paths: string[] = [];
    private index = new Map<string, number>();

    /** abs uri → file index；无法相对化时返回 -1 */
    addAbs(absUri: string, root: vscode.Uri): number {
        const existing = this.index.get(absUri);
        if (existing !== undefined) { return existing; }
        const rel = toPosixRel(absUri, root);
        if (rel === null) { return -1; }
        // 同一 rel 可能只来自一种 abs
        const byRel = this.paths.indexOf(rel);
        if (byRel >= 0) {
            this.index.set(absUri, byRel);
            return byRel;
        }
        const i = this.paths.length;
        this.paths.push(rel);
        this.index.set(absUri, i);
        return i;
    }

    getAbsList(root: vscode.Uri): string[] {
        return this.paths.map(rel => fromPosixRel(rel, root));
    }
}

function compressStore(store: IndexedStoreExport, root: vscode.Uri, files: FileTable): DiskStoreV2 | null {
    const scoreboards: DiskStoreV2['scoreboards'] = [];
    for (const [name, meta] of store.scoreboards) {
        const f = files.addAbs(meta.defUri, root);
        if (f < 0) { return null; }
        scoreboards.push([name, { type: meta.type, desc: meta.desc, f, l: meta.defLine }]);
    }

    const teams: DiskStoreV2['teams'] = [];
    for (const [name, meta] of store.teams) {
        const f = files.addAbs(meta.defUri, root);
        if (f < 0) { return null; }
        const row: DiskStoreV2['teams'][0][1] = { f, l: meta.defLine };
        if (meta.color !== undefined) { row.color = meta.color; }
        if (meta.rule !== undefined) { row.rule = meta.rule; }
        teams.push([name, row]);
    }

    const fileKeyByRes: DiskStoreV2['fileKeyByRes'] = [];
    for (const [resName, fileKey] of store.fileKeyByRes) {
        const f = files.addAbs(fileKey, root);
        if (f < 0) { return null; }
        fileKeyByRes.push([resName, f]);
    }

    const lineIndex: DiskStoreV2['lineIndex'] = [];
    for (const [fileKey, rows] of store.lineIndex) {
        const f = files.addAbs(fileKey, root);
        if (f < 0) { return null; }
        lineIndex.push([f, rows]);
    }

    return {
        scoreboards,
        teams,
        funcDefs: store.funcDefs,
        docIndex: store.docIndex,
        fileKeyByRes,
        lineIndex,
    };
}

function expandStore(disk: DiskStoreV2, absFiles: string[]): IndexedStoreExport | null {
    const scoreboards: IndexedStoreExport['scoreboards'] = [];
    for (const [name, meta] of disk.scoreboards) {
        const uri = absFiles[meta.f];
        if (!uri) { return null; }
        scoreboards.push([name, {
            type: meta.type,
            desc: meta.desc,
            defUri: uri,
            defLine: meta.l,
        }]);
    }

    const teams: IndexedStoreExport['teams'] = [];
    for (const [name, meta] of disk.teams) {
        const uri = absFiles[meta.f];
        if (!uri) { return null; }
        const row: IndexedStoreExport['teams'][0][1] = {
            defUri: uri,
            defLine: meta.l,
        };
        if (meta.color !== undefined) { row.color = meta.color; }
        if (meta.rule !== undefined) { row.rule = meta.rule; }
        teams.push([name, row]);
    }

    const fileKeyByRes: IndexedStoreExport['fileKeyByRes'] = [];
    for (const [resName, f] of disk.fileKeyByRes) {
        const uri = absFiles[f];
        if (!uri) { return null; }
        fileKeyByRes.push([resName, uri]);
    }

    const lineIndex: LineIndexExport = [];
    for (const [f, rows] of disk.lineIndex) {
        const uri = absFiles[f];
        if (!uri) { return null; }
        lineIndex.push([uri, rows as Array<[number, { type: string; value: string; meta?: unknown }[]]>]);
    }

    return {
        scoreboards,
        teams,
        funcDefs: disk.funcDefs,
        docIndex: disk.docIndex as Array<[string, Array<[number, IndexEntry[]]>]>,
        fileKeyByRes,
        lineIndex,
    };
}

/**
 * 由「相对路径 + mtime」生成指纹（不读文件内容）。
 * 排序后 sha1，增删/改 mtime 都会变。
 */
export function computeFingerprint(relAndMtime: Array<[string, number]>): string {
    const sorted = [...relAndMtime].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const h = crypto.createHash('sha1');
    for (const [rel, mt] of sorted) {
        h.update(rel);
        h.update('\0');
        h.update(String(mt));
        h.update('\n');
    }
    return h.digest('hex');
}

/** 绝对 uri mtime 表 → fingerprint；无法相对化时返回 null */
export function fingerprintFromAbsMtimes(
    mtimes: Map<string, number> | Record<string, number>,
    root: vscode.Uri,
): string | null {
    const pairs: Array<[string, number]> = [];
    const entries = mtimes instanceof Map ? mtimes.entries() : Object.entries(mtimes);
    for (const [abs, mt] of entries) {
        const rel = toPosixRel(abs, root);
        if (rel === null) { return null; }
        pairs.push([rel, mt]);
    }
    return computeFingerprint(pairs);
}

function toDisk(payload: IndexCachePayload, root: vscode.Uri): IndexCacheDiskV3 | null {
    const files = new FileTable();
    // 先登记 mtimes 中的文件，保证与磁盘扫到的集合对齐
    const mtimeEntries = Object.entries(payload.mtimes);
    for (const [abs] of mtimeEntries) {
        if (files.addAbs(abs, root) < 0) { return null; }
    }

    const diskStore = compressStore(payload.store, root, files);
    if (!diskStore) { return null; }

    const mtimes: number[] = new Array(files.paths.length).fill(0);
    for (const [abs, mt] of mtimeEntries) {
        const i = files.addAbs(abs, root);
        if (i < 0) { return null; }
        mtimes[i] = mt;
    }

    const fp = payload.fingerprint
        || fingerprintFromAbsMtimes(payload.mtimes, root)
        || '';
    if (!fp) { return null; }

    return {
        version: 3,
        fingerprint: fp,
        files: files.paths,
        mtimes,
        functionResNames: payload.functionResNames,
        advancementResNames: payload.advancementResNames,
        store: diskStore,
    };
}

function fromDisk(disk: IndexCacheDiskV3, root: vscode.Uri): IndexCachePayload | null {
    if (!Array.isArray(disk.files) || !Array.isArray(disk.mtimes)) { return null; }
    if (disk.files.length !== disk.mtimes.length) { return null; }
    if (typeof disk.fingerprint !== 'string' || !disk.fingerprint) { return null; }

    const absFiles = disk.files.map(rel => fromPosixRel(rel, root));
    const store = expandStore(disk.store, absFiles);
    if (!store) { return null; }

    const mtimes: Record<string, number> = {};
    for (let i = 0; i < absFiles.length; i++) {
        mtimes[absFiles[i]] = disk.mtimes[i];
    }

    return {
        version: INDEX_CACHE_VERSION,
        fingerprint: disk.fingerprint,
        mtimes,
        functionResNames: disk.functionResNames ?? [],
        advancementResNames: disk.advancementResNames ?? [],
        store,
    };
}

// ================================================================
// 校验 / 读写
// ================================================================

/** 当前工作区函数文件 mtime 表是否与缓存完全一致（绝对 uri 键） */
export function mtimesMatch(
    cached: Record<string, number> | undefined,
    current: Map<string, number>,
): boolean {
    if (!cached || typeof cached !== 'object') { return false; }
    const keys = Object.keys(cached);
    if (keys.length !== current.size) { return false; }
    for (const k of keys) {
        if (current.get(k) !== cached[k]) { return false; }
    }
    return true;
}

/**
 * 优先用 fingerprint 判断缓存是否可恢复；无指纹时回退逐文件 mtime。
 * fingerprint 与 mtimes 均基于元数据，不读文件正文。
 */
export function cacheMetaMatch(
    cached: IndexCachePayload,
    currentMtimes: Map<string, number>,
    root: vscode.Uri,
): boolean {
    if (cached.fingerprint) {
        const fp = fingerprintFromAbsMtimes(currentMtimes, root);
        return fp !== null && fp === cached.fingerprint;
    }
    return mtimesMatch(cached.mtimes, currentMtimes);
}

async function readCacheFile(uri: vscode.Uri): Promise<IndexCachePayload | null> {
    if (!rootDir) { return null; }
    const buf = await vscode.workspace.fs.readFile(uri);
    const text = decodeCacheBytes(buf);
    const raw = JSON.parse(text) as { version?: number };
    if (!raw || raw.version !== INDEX_CACHE_VERSION) {
        return null;
    }
    return fromDisk(raw as IndexCacheDiskV3, rootDir);
}

export async function readIndexCache(): Promise<IndexCachePayload | null> {
    if (!rootDir) { return null; }
    const primary = cacheUri();
    if (primary) {
        try {
            return await readCacheFile(primary);
        } catch { /* 再试 legacy */ }
    }
    const legacy = legacyCacheUri();
    if (legacy) {
        try {
            return await readCacheFile(legacy);
        } catch { /* miss */ }
    }
    return null;
}

export async function writeIndexCache(payload: IndexCachePayload): Promise<boolean> {
    const uri = cacheUri();
    if (!uri || !rootDir) { return false; }
    try {
        const disk = toDisk(payload, rootDir);
        if (!disk) {
            console.warn('[McfunctionStudio] index-cache 无法相对化路径，跳过写入');
            return false;
        }
        const json = JSON.stringify(disk);
        const body = encodeCacheJson(json);
        await vscode.workspace.fs.writeFile(uri, body);
        // 清理旧明文，避免误读过期 v2 明文
        const legacy = legacyCacheUri();
        if (legacy) {
            try {
                await vscode.workspace.fs.delete(legacy);
            } catch { /* 不存在即可 */ }
        }
        return true;
    } catch (err) {
        console.warn('[McfunctionStudio] 写入 index-cache 失败', err);
        return false;
    }
}

export function buildPayload(
    mtimes: Map<string, number>,
    functionResNames: string[],
    advancementResNames: string[],
    store: IndexedStoreExport,
    fingerprint?: string,
): IndexCachePayload {
    const m: Record<string, number> = {};
    for (const [k, v] of mtimes) {
        m[k] = v;
    }
    let fp = fingerprint ?? '';
    if (!fp && rootDir) {
        fp = fingerprintFromAbsMtimes(mtimes, rootDir) ?? '';
    }
    return {
        version: INDEX_CACHE_VERSION,
        fingerprint: fp,
        mtimes: m,
        functionResNames: [...functionResNames],
        advancementResNames: [...advancementResNames],
        store,
    };
}

/** 测试/调试：gzip 后磁盘字节数（与 writeIndexCache 同算法） */
export function estimateDiskBytes(payload: IndexCachePayload, root: vscode.Uri): number | null {
    const disk = toDisk(payload, root);
    if (!disk) { return null; }
    return encodeCacheJson(JSON.stringify(disk)).length;
}
