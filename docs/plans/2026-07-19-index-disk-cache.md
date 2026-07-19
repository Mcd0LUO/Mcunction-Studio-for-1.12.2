# Plan: JSON 磁盘索引缓存（跨会话冷启动）

**日期**: 2026-07-19  
**复杂度**: 中

## 目标

跨会话冷启动时，若工作区 `.mcfunction` 的 mtime 未变，则从  
`data/.McfStudio/index-cache.json.gz` 恢复 `IndexedStore`，跳过全量解析。

## 改动

| 项 | 做法 |
|----|------|
| LineIndex | `exportState` / `importState`（行级重建 refcount） |
| IndexedStore | 导出 scoreboards/teams/funcDefs/docIndex/fileKey/lineIndex |
| IndexCache | **v3** 相对路径 + 文件表 + **path\|mtime sha1 fingerprint**；磁盘 **JSON + zlib.gzip** |
| DataLoader | forceFull 先 try-restore（fingerprint 匹配）；全量/有解析后 persist |
| bench:real | 对比 cold no-cache vs cold + cache vs warm |

## 失效条件

- 缓存 version 不匹配（&lt;3 自动丢弃）
- fingerprint 变化（增删文件或任一 mtime 变化；**非内容 hash**）

## 验收

- `npm run test:index` 含 export/import round-trip + v2 路径稳定
- 末法包：`cold + cache` p50 明显低于 `cold no cache`

## 末法实测（1964 文件）

| 版本 | cache 体积 | cold+cache p50 | 相对 cold 解析 |
|------|----------:|---------------:|----------------|
| v1 绝对 URI JSON | ~1237 KB | ~85 ms | ~26× |
| v2 相对路径 JSON | ~815 KB | ~100–110 ms | ~20× |
| v2 + zlib.gzip L1 | ~113 KB | ~98 ms | ~23× |
| **v3 + fingerprint** | ~113 KB 级 | ~同量级 | 校验用 sha1(path\|mtime)，仍须 stat |
| warm mtime | — | ~75–80 ms | — |

结论：gzip 主要省磁盘；fingerprint 理顺失效逻辑；命中延迟仍被 **findFiles + 全量 stat** 主导。
