/**
 * 符号重命名（F2）。
 *
 * ## 三条硬性安全规则
 *
 * 1. **只改 kind 匹配的符号**。`say mytag` 里的 mytag 不产标签符号，
 *    不会被 `scoreboard players tag` 的重命名波及。
 * 2. **假玩家连 `#` 一起改**。`#fp` 是单个 token，若只替换 `fp` 部分，
 *    重命名为 `#newname` 时会残留一个 `#`，变成 `##newname`。
 *    但目标是 `#newname` 还是 `newname`？——跟随原写法：
 *    原 token 有 `#` 则保留，否则不加。
 * 3. **逐位置生成 TextEdit，不整行重写**。整行重写会把用户正在编辑的
 *    光标位置、行内其他未保存的改动一并覆盖掉。
 *
 * 另外：只提供 WorkspaceEdit，不直接 apply。让 VS Code 处理 undo 栈。
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { symbolAt } from './ReferencesProvider';
import { invalidateDocCache, resolveSymbol } from './symbols/bridge';
import { extractSymbols, SymbolKind } from './symbols/extractor';
import { NAME_MAX, bareName, isValidSymbolName } from './symbols/naming';
import { rootDir } from './paths';

/** 重命名最多影响的文件数，超出则拒绝（防止一次误操作改几百个文件） */
const MAX_FILES = 200;

/**
 * 资源名就是文件路径的两类符号。
 *
 * `function ns:a/b` ↔ `data/functions/ns/a/b.mcfunction`
 * `advancement ns:x` ↔ `data/advancements/ns/x.json`
 *
 * 因此它们**没有"定义行"** —— 定义就是磁盘上的文件本身。
 * 重命名必须连文件一起改，否则改完引用就指向不存在的文件，数据包直接坏掉。
 */
const RESOURCE_KINDS: readonly SymbolKind[] = ['function', 'advancement'];

function isResourceKind(kind: SymbolKind): boolean {
    return RESOURCE_KINDS.includes(kind);
}

/** 资源名 → 磁盘文件；根目录缺失或名字格式不对时返回 null */
function resourceFileUri(kind: SymbolKind, resName: string): vscode.Uri | null {
    const root = rootDir;
    if (!root) { return null; }
    const sep = resName.indexOf(':');
    if (sep <= 0 || sep === resName.length - 1) { return null; }
    const ns = resName.slice(0, sep);
    const rel = resName.slice(sep + 1);
    const segments = rel.split('/').filter(Boolean);
    if (segments.length === 0) { return null; }
    // 命名空间/路径里出现 .. 会把文件写到数据包外面
    if (segments.some(s => s === '.' || s === '..')) { return null; }

    const sub = kind === 'function' ? 'functions' : 'advancements';
    const ext = kind === 'function' ? '.mcfunction' : '.json';
    return vscode.Uri.file(path.join(root.fsPath, sub, ns, ...segments) + ext);
}

/**
 * 资源名是否合法（`namespace:path/to/name`）。
 *
 * 刻意不照搬 1.13+ 的 `[a-z0-9_.-]` 小写限制 —— 1.12.2 并未强制小写，
 * 而 Windows 文件系统又大小写不敏感，收紧只会误拒合法输入。
 * 这里只拦真正会出事的东西：空白、反斜杠、路径穿越。
 */
function isValidResourceName(name: string): boolean {
    const sep = name.indexOf(':');
    if (sep <= 0 || sep === name.length - 1) { return false; }
    const ns = name.slice(0, sep);
    const rel = name.slice(sep + 1);
    if (/\s/.test(name) || name.includes('\\')) { return false; }
    if (ns === '.' || ns === '..' || ns.includes('/')) { return false; }
    const segs = rel.split('/');
    if (segs.some(s => s === '' || s === '.' || s === '..')) { return false; }
    return true;
}

export class McFunctionRenameProvider implements vscode.RenameProvider {

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken,
    ): Promise<vscode.WorkspaceEdit | null> {
        if (document.languageId !== 'mcfunction') { return null; }

        const hit = symbolAt(document, position);
        if (!hit) { return null; }

        // function / advancement：名字就是文件路径，必须连文件一起改。
        // 此前 function 被直接拒绝（半吊子改引用会改坏数据包），
        // advancement 则既没拒绝也没工作 —— 见下方注释。
        if (isResourceKind(hit.kind)) {
            return this.renameResource(document, hit.kind, hit.value, newName, token);
        }

        // 拒绝非法新名。假玩家允许写成 #newname（会剥掉 # 再校验）。
        // 长度上限只对 wiki 明确写了 16 的记分板目标/队伍施加，
        // 标签与假玩家不设限 —— 不用臆测的数字拒绝用户的合法输入。
        if (!isValidSymbolName(newName, {
            allowHashPrefix: hit.kind === 'fake_player',
            maxLength: hasNameLimit(hit.kind) ? NAME_MAX : undefined,
        })) { return null; }

        // 重命名到自己等于什么都不做，不必打扰用户
        if (hit.value === bareName(newName)) { return null; }

        invalidateDocCache(document.uri);
        const locs = await resolveSymbol(hit.kind, hit.value);
        if (token.isCancellationRequested) { return null; }

        const files = new Set(locs.map(l => l.file));
        if (files.size > MAX_FILES) { return null; }

        // 替换区间只覆盖名字本身，**不含**假玩家的前导 #（见 extractor 的 hashStart）。
        // 因此这里必须插入裸名：若插入 "#newname"，原来的 # 会残留成 "##newname"。
        const text = bareName(newName);

        const edit = new vscode.WorkspaceEdit();
        for (const l of locs) {
            let uri: vscode.Uri;
            try { uri = vscode.Uri.parse(l.file); } catch { continue; }
            edit.replace(uri, new vscode.Range(l.line, l.start, l.line, l.end), text);
        }
        return edit;
    }

    /** 准备重命名：决定光标处是否允许重命名 */
    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<{ range: vscode.Range; placeholder: string }> {
        if (document.languageId !== 'mcfunction') { return null; }
        const hit = symbolAt(document, position);
        if (!hit) { return null; }

        const text = document.lineAt(position.line).text;
        for (const o of extractSymbols(text)) {
            if (o.kind === hit.kind && o.value === hit.value) {
                return {
                    range: new vscode.Range(position.line, o.start, position.line, o.end),
                    placeholder: hit.value,
                };
            }
        }
        return null;
    }

    /**
     * 重命名 function / advancement —— **连磁盘文件一起改**。
     *
     * 这两类符号的定义就是文件本身，没有"定义行"可改。
     * 只改引用不改文件 = 把数据包改坏，所以必须两件事一起做：
     *   1. 全部引用行里的旧资源名替换成新资源名
     *   2. `WorkspaceEdit.renameFile` 把文件挪到新路径
     *
     * 新名允许两种写法：
     *   · `ns:new`   —— 完整资源名（可换命名空间/子目录）
     *   · `new`      —— 只给末段，沿用原命名空间
     */
    private async renameResource(
        document: vscode.TextDocument,
        kind: SymbolKind,
        oldName: string,
        newName: string,
        token: vscode.CancellationToken,
    ): Promise<vscode.WorkspaceEdit | null> {
        const sep = oldName.indexOf(':');
        if (sep <= 0) { return null; }
        const target = newName.includes(':')
            ? newName
            : `${oldName.slice(0, sep)}:${newName}`;

        if (!isValidResourceName(target)) { return null; }
        if (target === oldName) { return null; }

        const oldUri = resourceFileUri(kind, oldName);
        const newUri = resourceFileUri(kind, target);
        if (!oldUri || !newUri) { return null; }
        if (oldUri.toString() === newUri.toString()) { return null; }

        // 源文件必须存在；目标不能已存在（宁可拒绝也不覆盖别人的文件）
        try {
            await vscode.workspace.fs.stat(oldUri);
        } catch {
            return null;
        }
        try {
            await vscode.workspace.fs.stat(newUri);
            return null;
        } catch {
            /* 目标不存在 —— 正常 */
        }

        invalidateDocCache(document.uri);
        const locs = await resolveSymbol(kind, oldName);
        if (token.isCancellationRequested) { return null; }

        const files = new Set(locs.map(l => l.file));
        if (files.size > MAX_FILES) { return null; }

        const edit = new vscode.WorkspaceEdit();
        // 引用行里替换的是**完整资源名**（与 scoreboard 等不同，不用裸名）
        for (const l of locs) {
            let uri: vscode.Uri;
            try { uri = vscode.Uri.parse(l.file); } catch { continue; }
            edit.replace(uri, new vscode.Range(l.line, l.start, l.line, l.end), target);
        }
        edit.renameFile(oldUri, newUri, { overwrite: false, ignoreIfExists: false });
        return edit;
    }
}

/**
 * 哪些符号类型有 wiki 明确写出的名字长度上限。
 *
 * 只有记分板目标与队伍（均为 16，见 symbols/naming 的注释与来源）。
 * 标签、假玩家名没有在 wiki 上写明的上限，故不设限。
 */
function hasNameLimit(kind: SymbolKind): boolean {
    return kind === 'scoreboard' || kind === 'team';
}

export function registerRenameProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(
            { language: 'mcfunction' },
            new McFunctionRenameProvider(),
        ),
    );
}