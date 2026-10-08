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
import { symbolAt } from './ReferencesProvider';
import { invalidateDocCache, resolveSymbol } from './symbols/bridge';
import { extractSymbols } from './symbols/extractor';

/** 重命名最多影响的文件数，超出则拒绝（防止一次误操作改几百个文件） */
const MAX_FILES = 200;

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

        // 提前拒绝非法名：空、含空白、含分隔符
        if (!isValidName(newName)) { return null; }
        // 重命名到自己等于什么都不做，不必打扰用户
        if (hit.value === newName) { return null; }

        // function 资源名含命名空间，重命名函数名本身语义不对：
        // 改名意味着文件也要改名。明确拒绝而不是半吊子地改引用。
        if (hit.kind === 'function') { return null; }

        invalidateDocCache(document.uri);
        const locs = await resolveSymbol(hit.kind, hit.value);
        if (token.isCancellationRequested) { return null; }

        const files = new Set(locs.map(l => l.file));
        if (files.size > MAX_FILES) { return null; }

        const edit = new vscode.WorkspaceEdit();
        for (const l of locs) {
            let uri: vscode.Uri;
            try { uri = vscode.Uri.parse(l.file); } catch { continue; }

            let text = newName;
            if (hit.kind === 'fake_player' && l.hashStart >= 0) {
                // 原 token 带 # → 新名也带 #；否则视为假玩家名本身不含 #
                text = newName.startsWith('#') ? newName : `#${newName}`;
            }

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
        // function 重命名需要同时改文件名，此处不支持
        if (hit.kind === 'function') { return null; }

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
}

/**
 * 记分板目标名的合法性。
 *
 * 1.12.2 的限制是 ≤16 字符（wiki Commands/scoreboard），
 * 另需排除命令分隔符与选择器保留前缀，否则改名后命令直接失效。
 */
export function isValidName(name: string): boolean {
    if (name === '') { return false; }
    if (name.length > 16) { return false; }
    if (/\s/u.test(name)) { return false; }
    if (/[,.:=\[\]@#"{}\\[\]]/u.test(name)) { return false; }
    return true;
}

export function registerRenameProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(
            { language: 'mcfunction' },
            new McFunctionRenameProvider(),
        ),
    );
}