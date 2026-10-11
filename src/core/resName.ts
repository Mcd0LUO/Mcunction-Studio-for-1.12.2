/**
 * 资源名（函数 / 进度）匹配。
 *
 * 为什么单独一层：Minecraft 的命名空间与路径**本身是大小写敏感的** ——
 * 在 Linux 上 `NS:foo` 与 `ns:foo` 是两个不同文件，游戏也按大小写查找。
 * 但 **Windows 文件系统大小写不敏感**：`function NS:foo` 确实能打开
 * `data/functions/ns/foo.mcfunction`，游戏也能执行。
 * 此时若按精确匹配判定，这类写法会被误报"函数不存在"。
 *
 * 因此只在大小写不敏感的文件系统上放宽比较 ——
 * 放宽是**单向**的：精确命中优先，不命中时才退回忽略大小写，
 * 所以 `ns:foo` 与 `NS:foo` 同时存在时仍能精确区分。
 *
 * 纯逻辑，不 import vscode —— 平台可注入，便于单测。
 */

/**
 * 该平台的文件系统是否大小写不敏感。
 *
 * 只列 win32：macOS 虽默认大小写不敏感，但 APFS 可以格式化成大小写敏感的，
 * 无法仅凭 `process.platform` 判断，故不纳入（宁可漏报也不误判）。
 */
export function isCaseInsensitiveFs(platform: string = process.platform): boolean {
    return platform === 'win32';
}

/**
 * 判断资源名是否存在于索引中。
 *
 * @param caseInsensitive 缺省按当前平台推断；单测可显式传入
 */
export function hasResName(
    list: readonly string[],
    name: string,
    caseInsensitive: boolean = isCaseInsensitiveFs(),
): boolean {
    // 精确命中永远优先
    if (list.indexOf(name) >= 0) { return true; }
    if (!caseInsensitive) { return false; }
    const lower = name.toLowerCase();
    return list.some(x => x.toLowerCase() === lower);
}
