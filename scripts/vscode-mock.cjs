/**
 * 最小 vscode mock — 供 Node 侧跑 DSL / DataLoader / complete 基准（不启动 Electron）。
 * 支持真实磁盘：Uri / workspace.fs / findFiles / RelativePattern。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const CompletionItemKind = {
    Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4, Variable: 5,
    Class: 6, Interface: 7, Module: 8, Property: 9, Unit: 10, Value: 11,
    Enum: 12, Keyword: 13, Snippet: 14, Color: 15, File: 16, Reference: 17,
    Folder: 18, EnumMember: 19, Constant: 20, Struct: 21, Event: 22,
    Operator: 23, TypeParameter: 24,
};

class CompletionItem {
    constructor(label, kind) {
        this.label = label;
        this.kind = kind;
    }
}

class SnippetString {
    constructor(value) {
        this.value = value ?? '';
    }
    appendText(t) { this.value += t; return this; }
    appendPlaceholder(t) { this.value += t; return this; }
}

function normalizeFs(p) {
    return path.resolve(p);
}

class Uri {
    constructor(fsPath) {
        this.scheme = 'file';
        this.fsPath = normalizeFs(fsPath);
        this.path = this.fsPath.replace(/\\/g, '/');
        if (!this.path.startsWith('/')) {
            this.path = '/' + this.path;
        }
    }
    static file(p) {
        return new Uri(p);
    }
    static parse(value) {
        const s = String(value);
        if (s.startsWith('file:')) {
            try {
                const u = new URL(s);
                let pathname = decodeURIComponent(u.pathname);
                // Windows: /D:/foo → D:/foo
                if (/^\/[A-Za-z]:\//.test(pathname)) {
                    pathname = pathname.slice(1);
                }
                return Uri.file(pathname);
            } catch {
                return Uri.file(s.replace(/^file:\/\//, ''));
            }
        }
        return Uri.file(s);
    }
    static joinPath(base, ...parts) {
        const basePath = base.fsPath || String(base);
        return new Uri(path.join(basePath, ...parts));
    }
    toString() {
        return pathToFileURL(this.fsPath).href;
    }
    with(change) {
        if (change.path) {
            return Uri.file(change.path);
        }
        return this;
    }
}

class RelativePattern {
    /**
     * @param {string|{fsPath?:string,uri?:Uri}|Uri} base
     * @param {string} pattern
     */
    constructor(base, pattern) {
        this.pattern = pattern;
        if (typeof base === 'string') {
            this.base = base;
            this.baseUri = Uri.file(base);
        } else if (base && base.fsPath) {
            this.base = base.fsPath;
            this.baseUri = base.scheme ? base : Uri.file(base.fsPath);
        } else if (base && base.uri) {
            this.base = base.uri.fsPath;
            this.baseUri = base.uri;
        } else {
            this.base = String(base);
            this.baseUri = Uri.file(this.base);
        }
    }
}

function walkFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) {
        return acc;
    }
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st;
        try {
            st = fs.statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) {
            walkFiles(full, acc);
        } else if (st.isFile()) {
            acc.push(full);
        }
    }
    return acc;
}

/** 极简 glob：支持 ** / *.ext 与 *.ext */
function matchGlob(relPosix, pattern) {
    const pat = pattern.replace(/\\/g, '/');
    if (pat.startsWith('**/')) {
        const suffix = pat.slice(3); // *.mcfunction
        if (suffix.startsWith('*')) {
            const ext = suffix.slice(1); // .mcfunction
            return relPosix.endsWith(ext) || path.basename(relPosix).endsWith(ext.replace(/^\*/, ''));
        }
        return relPosix.endsWith(suffix) || relPosix.includes('/' + suffix) || relPosix === suffix;
    }
    if (pat.includes('*')) {
        const ext = pat.replace('*', '');
        return relPosix.endsWith(ext);
    }
    return relPosix === pat || relPosix.endsWith('/' + pat);
}

async function findFiles(include, _exclude) {
    let baseDir;
    let pattern = '**/*';
    if (include instanceof RelativePattern || (include && include.pattern != null)) {
        baseDir = include.baseUri ? include.baseUri.fsPath : include.base;
        pattern = include.pattern;
    } else if (include && include.fsPath) {
        baseDir = include.fsPath;
    } else if (typeof include === 'string') {
        baseDir = process.cwd();
        pattern = include;
    } else {
        return [];
    }
    baseDir = normalizeFs(baseDir);
    const files = walkFiles(baseDir);
    const out = [];
    for (const full of files) {
        const rel = path.relative(baseDir, full).split(path.sep).join('/');
        if (matchGlob(rel, pattern)) {
            out.push(Uri.file(full));
        }
    }
    return out;
}

const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

const workspaceFs = {
    async readFile(uri) {
        return fs.readFileSync(uri.fsPath);
    },
    async writeFile(uri, content) {
        fs.mkdirSync(path.dirname(uri.fsPath), { recursive: true });
        fs.writeFileSync(uri.fsPath, Buffer.from(content));
    },
    async delete(uri) {
        fs.unlinkSync(uri.fsPath);
    },
    async stat(uri) {
        const st = fs.statSync(uri.fsPath);
        return {
            type: st.isDirectory() ? FileType.Directory : FileType.File,
            ctime: st.ctimeMs,
            mtime: st.mtimeMs,
            size: st.size,
        };
    },
    async readDirectory(uri) {
        return fs.readdirSync(uri.fsPath).map((name) => {
            const st = fs.statSync(path.join(uri.fsPath, name));
            return [name, st.isDirectory() ? FileType.Directory : FileType.File];
        });
    },
};

/** 可在外部设置 workspaceFolders */
const workspaceState = {
    workspaceFolders: [],
};

module.exports = {
    CompletionItemKind,
    CompletionItem,
    SnippetString,
    Uri,
    RelativePattern,
    FileType,
    window: {
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
        setStatusBarMessage: () => ({ dispose() {} }),
        createTextEditorDecorationType: () => ({ dispose() {} }),
        activeTextEditor: undefined,
    },
    workspace: {
        get workspaceFolders() {
            return workspaceState.workspaceFolders;
        },
        set workspaceFolders(v) {
            workspaceState.workspaceFolders = v;
        },
        fs: workspaceFs,
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({ dispose() {} }),
            onDidChange: () => ({ dispose() {} }),
            onDidDelete: () => ({ dispose() {} }),
            dispose() {},
        }),
        onDidChangeTextDocument: () => ({ dispose() {} }),
        onDidOpenTextDocument: () => ({ dispose() {} }),
        findFiles,
        getConfiguration: () => ({ get: () => undefined }),
        asRelativePath: (p) => String(p),
    },
    languages: {
        registerCompletionItemProvider: () => ({ dispose() {} }),
        registerSignatureHelpProvider: () => ({ dispose() {} }),
        registerDefinitionProvider: () => ({ dispose() {} }),
        registerHoverProvider: () => ({ dispose() {} }),
        registerCodeLensProvider: () => ({ dispose() {} }),
    },
    commands: {
        registerCommand: () => ({ dispose() {} }),
    },
    EventEmitter: class {
        constructor() { this._listeners = []; }
        event(listener) { this._listeners.push(listener); return { dispose() {} }; }
        fire(v) { for (const l of this._listeners) { l(v); } }
    },
    OverviewRulerLane: { Center: 2 },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    MarkdownString: class {
        constructor(v) { this.value = v ?? ''; }
        appendMarkdown(s) { this.value += s; return this; }
        appendCodeblock(s) { this.value += s; return this; }
    },
    Range: class {
        constructor(a, b, c, d) {
            if (typeof a === 'object') {
                this.start = a; this.end = b;
            } else {
                this.start = { line: a, character: b };
                this.end = { line: c, character: d };
            }
        }
        get isEmpty() {
            return this.start.line === this.end.line && this.start.character === this.end.character;
        }
        get isSingleLine() {
            return this.start.line === this.end.line;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
        with(line, character) {
            return new module.exports.Position(
                line ?? this.line,
                character ?? this.character
            );
        }
    },
    Location: class {
        constructor(uri, range) { this.uri = uri; this.range = range; }
    },
    SignatureHelp: class {
        constructor() { this.signatures = []; this.activeSignature = 0; this.activeParameter = 0; }
    },
    SignatureInformation: class {
        constructor(label, doc) { this.label = label; this.documentation = doc; this.parameters = []; }
    },
    ParameterInformation: class {
        constructor(label, doc) { this.label = label; this.documentation = doc; }
    },
    CodeLens: class {
        constructor(range, command) { this.range = range; this.command = command; }
    },
    ThemeColor: class {
        constructor(id) { this.id = id; }
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    /** 测试辅助：重置/注入 workspaceFolders */
    __setWorkspaceFolders(folders) {
        workspaceState.workspaceFolders = folders;
    },
};
