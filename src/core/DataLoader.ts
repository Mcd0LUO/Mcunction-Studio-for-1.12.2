import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { rootDir } from '../extension';
import { CommandUtils } from '../utils/CommandUtils';
import {
    IndexedStore, DataType, ScoreboardData, FunctionData, TeamData,
    readIndexCache, writeIndexCache, cacheMetaMatch, buildPayload,
} from './data';
import { registerHandlers as registerMinecraft } from './extractors/MinecraftExtractor';
import { registerHandlers as registerEasyCber } from './extractors/EasyCberExtractor';
export { DataType };

// ============================================================
// 类型定义
// ============================================================

interface ConfigData {
    IgnorePattern: {
        Function: string[];
        Advancement: string[];
        Macro: string[];
    },
    Signature: boolean,
    JsonPreview: {
        LinePreview: boolean,
        HoverPreview: boolean
    },
    FileProcessing: {
        MaxConcurrentReads: number;
        AutoRenameFunctionReference: boolean;
    };
    HoverProvider: Record<string, unknown>;
    CommandSchemaCheck: boolean;
}

// ============================================================
// DataLoader — 协调层
// ============================================================

export class DataLoader {
    private static instance: DataLoader;

    // ---- 统一数据存储（替代原来 5 个分散的 Map + docCache） ----
    store = new IndexedStore();

    // ---- 简单列表（不与 docCache 交互） ----
    private functionResNames: string[] = [];
    private advancementResNames: string[] = [];

    // ---- 配置 ----
    private configData: ConfigData = DataLoader.getDefaultConfig();

    // ---- 命令解析注册表：command → handler ----
    private commandHandlers: Map<string, (uri: vscode.Uri, line: number, commands: string[]) => void> = new Map();

    /** uri.toString() → mtime，用于增量跳过未改文件 */
    private fileMtimes = new Map<string, number>();

    /** 单飞行：防止重叠 loadData */
    private loadFlight: Promise<void> | null = null;

    private constructor() {
        this.registerHandlers();
        // 注意：init() 不在构造函数中调用，因为此时 rootDir 可能尚未设置。
        // 由 extension.ts 的 activate() 在 rootDir 就绪后显式调用。
    }

    /** 委托给各 CommandExtractor 注册（原版 + EasyCber 各自独立） */
    private registerHandlers(): void {
        registerMinecraft(this.store, this.commandHandlers);
        registerEasyCber(this.store, this.commandHandlers);
    }

    /** 由 extension.ts 在 rootDir 设置后调用 */
    public async init(): Promise<void> {
        if (!rootDir) {
            console.error('[McfunctionStudio] rootDir 未设置，无法加载数据');
            return;
        }
        await this.loadExtensionConfig();
        await this.loadData(true, this.configData.FileProcessing.MaxConcurrentReads, true);
    }

    public static getInstance(): DataLoader {
        if (!DataLoader.instance) {
            DataLoader.instance = new DataLoader();
        }
        return DataLoader.instance;
    }

    // ================================================================
    // 并发控制
    // ================================================================

    private async concurrentMap<T>(
        concurrency: number,
        items: T[],
        processor: (item: T) => Promise<void>
    ): Promise<void> {
        const executing = new Set<Promise<void>>();

        for (const item of items) {
            const p = Promise.resolve().then(() => processor(item));
            executing.add(p);
            p.then(() => { executing.delete(p); });

            if (executing.size >= concurrency) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
    }

    // ================================================================
    // 配置
    // ================================================================

    public getConfig(): ConfigData {
        return this.configData;
    }

    public static getDefaultConfig(): ConfigData {
        return {
            IgnorePattern: {
                Function: [],
                Advancement: [],
                Macro: []
            },
            JsonPreview: {
                LinePreview: true,
                HoverPreview: true
            },
            FileProcessing: {
                // 小文件场景过高并发无收益且易打满磁盘（bench: M 包 100≈串行）
                MaxConcurrentReads: 16,
                AutoRenameFunctionReference: true
            },
            HoverProvider: {
            },
            Signature: true,
            CommandSchemaCheck: true
        };
    }

    public async loadExtensionConfig(): Promise<void> {
        if (!rootDir) { return; }
        const configUri = vscode.Uri.joinPath(rootDir,".McfStudio", 'McfunctionStudio.json');
        const defaultConfig: ConfigData = DataLoader.getDefaultConfig();

        try {
            const configContent = await vscode.workspace.fs.readFile(configUri);
            let userConfig: Partial<ConfigData>;

            try {
                userConfig = JSON.parse(configContent.toString());
                this.configData = this.mergeConfigs(defaultConfig, userConfig);
            } catch (parseError) {
                vscode.window.showWarningMessage(`配置文件格式错误，已自动修复。错误：${(parseError as Error).message}`);
                this.configData = defaultConfig;

                const finalConfigContent = Buffer.from(JSON.stringify(this.configData, null, 2), 'utf-8');
                await vscode.workspace.fs.writeFile(configUri, finalConfigContent);
            }

            console.log('配置文件加载完成');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'FileNotFound') {
                try {
                    this.configData = defaultConfig;
                    const configContent = Buffer.from(JSON.stringify(defaultConfig, null, 2), 'utf-8');
                    await vscode.workspace.fs.writeFile(configUri, configContent);
                    vscode.window.showInformationMessage('配置文件不存在，已创建默认配置');
                } catch (writeError) {
                    vscode.window.showErrorMessage(`创建默认配置失败: ${(writeError as Error).message}`);
                }
            } else {
                vscode.window.showErrorMessage(`加载配置失败: ${(error as Error).message}`);
                this.configData = defaultConfig;
            }
        }
    }

    private mergeConfigs<T extends object>(defaultConfig: T, userConfig: Partial<T>): T {
        const merged: any = { ...defaultConfig };
        for (const key in userConfig) {
            if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
                const defaultVal = merged[key];
                const userVal = userConfig[key];
                if (defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal) && userVal !== null && typeof userVal === 'object') {
                    merged[key] = this.mergeConfigs(defaultVal, userVal as object);
                } else {
                    merged[key] = userVal !== undefined ? userVal : defaultVal;
                }
            }
        }
        return merged as T;
    }

    // ================================================================
    // 公开查询 API（向后兼容，签名不变）
    // ================================================================

    public getFunctionResNames(): string[] { return this.functionResNames; }
    public getAdvancementResNames(): string[] { return this.advancementResNames; }
    public getScoreboardsData(): Map<string, ScoreboardData> { return this.store.getScoreboards(); }
    public getFunctionData(): Map<string, FunctionData> { return this.store.getFunctions(); }
    public getFakePlayerData(): Map<string, number> { return this.store.getFakePlayers(); }
    public getTagsData(): Map<string, number> { return this.store.getTags(); }
    public getTeamsData(): Map<string, TeamData> { return this.store.getTeams(); }
    public getDocCache(): Map<string, Map<number, { type: DataType, value: string }[]>> { return this.store.getDocIndex(); }

    public getScoreboardDef(scoreboardName: string): { uri: vscode.Uri, range: vscode.Range } | null {
        const data = this.store.getScoreboards().get(scoreboardName);
        if (data) {
            const [uri, lineNum] = data.def;
            return { uri, range: new vscode.Range(lineNum, 0, lineNum, 0) };
        }
        return null;
    }

    public getTeamDef(teamName: string): { uri: vscode.Uri, range: vscode.Range } | null {
        const data = this.store.getTeams().get(teamName);
        if (data) {
            const [uri, lineNum] = data.def;
            return { uri, range: new vscode.Range(lineNum, 0, lineNum, 0) };
        }
        return null;
    }

    // ================================================================
    // 数据写入（委托给 IndexedStore）
    // ================================================================

    public addTag(tagName: string, uri: vscode.Uri, lineNumber: number): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.store.addTag(resName, tagName, lineNumber, uri);
    }

    public addTeam(teamName: string, uri: vscode.Uri, lineNumber: number): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.store.addTeam(resName, teamName, lineNumber, uri);
    }

    public addFakePlayer(playerName: string, uri: vscode.Uri, lineNumber: number): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.store.addFakePlayer(resName, playerName, lineNumber, uri);
    }

    // ================================================================
    // 资源名列表管理（简单数组，不涉及 docIndex）
    // ================================================================

    public addFunctionResByUri(uri: vscode.Uri): void {
        const resName = MinecraftUtils.buildFunctionCall(uri);
        if (resName) { this.functionResNames.push(resName); }
    }

    public addAdvancementResByUri(uri: vscode.Uri): void {
        const resName = MinecraftUtils.buildAdvancementCall(uri);
        if (resName) { this.advancementResNames.push(resName); }
    }

    public removeFunctionRes(resName: string): void {
        const idx = this.functionResNames.indexOf(resName);
        if (idx > -1) { this.functionResNames.splice(idx, 1); }
    }

    public removeAdvancementRes(resName: string): void {
        const idx = this.advancementResNames.indexOf(resName);
        if (idx > -1) { this.advancementResNames.splice(idx, 1); }
    }

    // ================================================================
    // 缓存清除（委托给 IndexedStore）
    // ================================================================

    /**
     * 清除指定行范围的缓存，联动清理对应数据 Map。
     * endLine = -1 表示到文件末尾。
     */
    public clearCache(doc: vscode.TextDocument, startLine: number = 0, endLine: number = -1): void {
        const resName = MinecraftUtils.buildFunctionCall(doc.uri) ?? '';
        if (!doc.uri) { return; }

        if (endLine === -1) {
            // 删除行后旧索引可能超出新 lineCount；_docIndex 与 LineIndex 取较大者
            const maxDoc = this.store.getMaxLine(resName);
            const maxLi = this.store.getLineIndex().getMaxLine(doc.uri.toString());
            endLine = Math.max(doc.lineCount - 1, maxDoc, maxLi);
        }
        if (endLine < startLine) { return; }

        this.store.clearLines(resName, startLine, endLine, doc.uri);
    }

    /**
     * 清除整个文件的缓存 + 数据 + 函数资源名。
     */
    public clearSingleFileAllCache(uri: vscode.Uri): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.removeFunctionRes(resName);
        this.store.clearFile(resName, uri);
        try {
            (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearFileExtract(uri.toString());
        } catch { /* extractor 未加载 */ }
    }

    // ================================================================
    // 数据加载主流程
    // ================================================================

    /**
     * 加载 / 刷新工作区索引。
     * @param useConcurrentControl 是否限制并发
     * @param concurrency 并发度（默认取配置，上限 32）
     * @param forceFull true=清空后全量解析；false=按 mtime 跳过未改文件（reload 推荐）
     */
    public async loadData(
        useConcurrentControl: boolean = true,
        concurrency: number = this.configData.FileProcessing.MaxConcurrentReads,
        forceFull: boolean = true,
    ): Promise<void> {
        // 单飞行：重叠调用串行化
        while (this.loadFlight) {
            await this.loadFlight;
        }
        const flight = this.loadDataInternal(useConcurrentControl, concurrency, forceFull);
        this.loadFlight = flight;
        try {
            await flight;
        } finally {
            if (this.loadFlight === flight) {
                this.loadFlight = null;
            }
        }
    }

    private async loadDataInternal(
        useConcurrentControl: boolean,
        concurrency: number,
        forceFull: boolean,
    ): Promise<void> {
        const conc = Math.max(1, Math.min(concurrency || 16, 32));

        try {
            // 冷启动 forceFull：优先尝试磁盘 index-cache（mtime 全匹配则跳过解析）
            if (forceFull) {
                const restored = await this.tryRestoreFromDiskCache();
                if (restored) {
                    const statusMsg =
                        `McfunctionStudio: 函数 ${this.functionResNames.length} | 记分板 ${this.store.getScoreboards().size}` +
                        ` | 标签 ${this.store.getTags().size} | 队伍 ${this.store.getTeams().size}` +
                        ` | 进度 ${this.advancementResNames.length}` +
                        ` | 缓存命中 ${restored.duration.toFixed(3)}s`;
                    vscode.window.setStatusBarMessage(statusMsg, 5000);
                    console.log(
                        `【函数加载】磁盘缓存命中 文件=${this.functionResNames.length}` +
                        ` 耗时=${restored.duration.toFixed(3)}s`,
                    );
                    return;
                }

                this.store.clear();
                this.functionResNames.length = 0;
                this.advancementResNames.length = 0;
                this.fileMtimes.clear();
                try {
                    (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearAllCustomData();
                } catch { /* extractor 未加载 */ }
            }

            const [funcStats, advOk] = await Promise.all([
                this.loadFunctionData(useConcurrentControl, conc, forceFull),
                this.loadAdvancementData(forceFull),
            ]);

            if (funcStats === null || advOk === null) {
                console.warn('[McfunctionStudio] 数据加载未完成', { funcStats, advOk });
                return;
            }

            // 全量或有解析时回写缓存；warm 全跳过则不写
            if (forceFull || funcStats.parsed > 0) {
                await this.persistIndexCache();
            }

            const statusMsg =
                `McfunctionStudio: 函数 ${this.functionResNames.length} | 记分板 ${this.store.getScoreboards().size}` +
                ` | 标签 ${this.store.getTags().size} | 队伍 ${this.store.getTeams().size}` +
                ` | 进度 ${this.advancementResNames.length}` +
                ` | 解析 ${funcStats.parsed}/跳过 ${funcStats.skipped}` +
                ` | ${funcStats.duration.toFixed(3)}s`;
            vscode.window.setStatusBarMessage(statusMsg, 5000);
            // 不再 showInformationMessage，避免每次 reload 抢焦点
        } catch (error) {
            console.error('[McfunctionStudio] 加载数据失败', error);
            vscode.window.showErrorMessage(`加载数据失败: ${error}`);
        }
    }

    /**
     * 若 index-cache.json.gz 存在且所有函数 mtime 一致，恢复 IndexedStore。
     * 进度列表仍扫描磁盘（轻量）。
     */
    private async tryRestoreFromDiskCache(): Promise<{ duration: number } | null> {
        const t0 = Date.now();
        try {
            const functionPaths = await DataLoader.getAllFunctionsPaths();
            const currentMtimes = new Map<string, number>();
            for (const p of functionPaths) {
                try {
                    const st = await vscode.workspace.fs.stat(p);
                    currentMtimes.set(p.toString(), st.mtime);
                } catch {
                    // 无法 stat 则视为缓存不可用
                    return null;
                }
            }

            const cached = await readIndexCache();
            if (!rootDir || !cached || !cacheMetaMatch(cached, currentMtimes, rootDir)) {
                return null;
            }

            this.store.importState(cached.store);
            this.fileMtimes = new Map(currentMtimes);
            this.functionResNames = functionPaths
                .map(p => MinecraftUtils.buildFunctionCall(p))
                .filter((n): n is string => !!n);

            // 进度：廉价扫描，不信任缓存里的名单也可
            await this.loadAdvancementData(true);

            return { duration: (Date.now() - t0) / 1000 };
        } catch (err) {
            console.warn('[McfunctionStudio] 读取 index-cache 失败，回退全量解析', err);
            return null;
        }
    }

    /** 将当前索引写入 data/.McfStudio/index-cache.json.gz */
    private async persistIndexCache(): Promise<void> {
        try {
            const payload = buildPayload(
                this.fileMtimes,
                this.functionResNames,
                this.advancementResNames,
                this.store.exportState(),
            );
            const ok = await writeIndexCache(payload);
            if (ok) {
                console.log(
                    `[McfunctionStudio] index-cache.json.gz 已写入（函数 ${this.functionResNames.length}，` +
                    `记分板 ${this.store.getScoreboards().size}，标签 ${this.store.getTags().size}）`,
                );
            }
        } catch (err) {
            console.warn('[McfunctionStudio] persistIndexCache 失败', err);
        }
    }

    public async loadAdvancementData(forceFull: boolean = true): Promise<boolean | null> {
        try {
            const advancementPaths = await DataLoader.getAllAdvancementsPaths();
            if (forceFull) {
                this.advancementResNames.length = 0;
            } else {
                this.advancementResNames.length = 0;
            }
            for (const path of advancementPaths) {
                const resName = MinecraftUtils.buildAdvancementCall(path);
                if (!resName) { continue; }
                this.advancementResNames.push(resName);
            }
            return true;
        } catch (error) {
            console.error('[McfunctionStudio] 加载进度数据失败', error);
            vscode.window.showErrorMessage(`加载进度数据失败：${(error as Error).message}`);
            return null;
        }
    }

    public async loadFunctionData(
        useConcurrentControl: boolean = false,
        concurrency: number = 16,
        forceFull: boolean = true,
    ): Promise<{ duration: number; parsed: number; skipped: number } | null> {
        try {
            const functionPaths = await DataLoader.getAllFunctionsPaths();

            if (functionPaths.length === 0) {
                this.functionResNames = [];
                console.log('[McfunctionStudio] 未找到任何 .mcfunction 函数文件');
                return { duration: 0, parsed: 0, skipped: 0 };
            }

            // 增量：剔除已删除文件的索引
            if (!forceFull) {
                const live = new Set(functionPaths.map(p => p.toString()));
                for (const uriStr of [...this.fileMtimes.keys()]) {
                    if (!live.has(uriStr)) {
                        try {
                            const gone = vscode.Uri.parse(uriStr);
                            this.clearSingleFileAllCache(gone);
                        } catch {
                            this.fileMtimes.delete(uriStr);
                        }
                        this.fileMtimes.delete(uriStr);
                    }
                }
            }

            // 挑选需要解析的文件
            const toParse: vscode.Uri[] = [];
            let skipped = 0;
            for (const path of functionPaths) {
                const key = path.toString();
                let mtime = -1;
                try {
                    const st = await vscode.workspace.fs.stat(path);
                    mtime = st.mtime;
                } catch {
                    toParse.push(path);
                    continue;
                }
                if (!forceFull && this.fileMtimes.get(key) === mtime) {
                    skipped++;
                    continue;
                }
                toParse.push(path);
            }

            this.functionResNames = functionPaths
                .map(p => MinecraftUtils.buildFunctionCall(p))
                .filter((n): n is string => !!n);

            const startTime = Date.now();
            const modeName = useConcurrentControl ? `并发≤${concurrency}` : '串行';

            const parseOne = async (path: vscode.Uri) => {
                try {
                    await this.loadSingleFuncFileByUri(path);
                    try {
                        const st = await vscode.workspace.fs.stat(path);
                        this.fileMtimes.set(path.toString(), st.mtime);
                    } catch {
                        this.fileMtimes.set(path.toString(), Date.now());
                    }
                } catch (err) {
                    vscode.window.showWarningMessage(
                        `解析函数文件失败：${path.path}，原因：${(err as Error).message}`,
                    );
                }
            };

            if (useConcurrentControl && concurrency > 1) {
                await this.concurrentMap(concurrency, toParse, parseOne);
            } else {
                for (const path of toParse) {
                    await parseOne(path);
                }
            }

            const duration = (Date.now() - startTime) / 1000;
            console.log(
                `【函数加载】${modeName} 全量=${forceFull} 文件=${functionPaths.length}` +
                ` 解析=${toParse.length} 跳过=${skipped} 耗时=${duration.toFixed(3)}s`,
            );
            return { duration, parsed: toParse.length, skipped };
        } catch (error) {
            console.error('[McfunctionStudio] 加载函数数据失败', error);
            vscode.window.showErrorMessage(`加载函数数据失败：${(error as Error).message}`);
            return null;
        }
    }

    // ================================================================
    // 单文件解析
    // ================================================================

    /** 逐行解析（Uri 和 Doc 共用） */
    private parseLines(uri: vscode.Uri, lines: string[], startLine: number = 0): void {
        for (let i = startLine; i < lines.length; i++) {
            this.handleSingleLine(uri, lines[i], i);
        }
    }

    public async loadSingleFuncFileByUri(path: vscode.Uri): Promise<void> {
        // 完整清理：_docIndex + LineIndex + 定义 Map（避免重复 push）
        const resName = MinecraftUtils.buildFunctionCall(path) ?? '';
        if (resName) {
            this.store.clearFile(resName, path);
        } else {
            try {
                (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearFileExtract(path.toString());
            } catch { /* extractor 未加载 */ }
        }
        const fileContent = await vscode.workspace.fs.readFile(path);
        const content = new TextDecoder('utf-8').decode(fileContent);
        this.parseLines(path, content.split(/\r?\n|\r/));
    }

    public async loadSingleFuncFileByDoc(doc: vscode.TextDocument, startLine: number = 0): Promise<void> {
        this.parseLines(doc.uri, doc.getText().split(/\r?\n|\r/), startLine);
    }

    // ================================================================
    // 命令行解析
    // ================================================================

    public handleSingleLine(uri: vscode.Uri, line: string, index: number): void {
        const trimLine = line.trim();
        if (!trimLine || trimLine.startsWith('#')) { return; }

        const commands = CommandUtils.extraceActiveCommand(trimLine);
        const handler = this.commandHandlers.get(commands[0]);
        if (handler) {
            handler(uri, index, commands);
        }
        // YAML 自定义数据提取（与 scoreboard/team 提取走同一通道）
        try {
            const { applyExtractForFile } = require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor');
            applyExtractForFile(commands[0], commands, uri.toString(), index);
        } catch { /* extractor 未加载 */ }
    }

    // ================================================================
    // 静态文件扫描器
    // ================================================================

    /**
     * 通用文件扫描器。
     * @param dirName    相对于 rootDir 的子目录名（如 'functions'）
     * @param glob       匹配模式（如 '**\/*.mcfunction'）
     * @param ignoreKey  IgnorePattern 中的键
     * @param label      日志中的中文标签
     * @param silent     目录不存在时是否静默（宏目录可选，不报错）
     */
    private static async scanFiles(
        dirName: string,
        glob: string,
        ignoreKey: keyof ConfigData['IgnorePattern'],
        label: string,
        silent: boolean = false
    ): Promise<vscode.Uri[]> {
        if (!rootDir) { return []; }
        const uri = vscode.Uri.joinPath(rootDir, dirName);
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            if (!silent) {
                vscode.window.showErrorMessage(`${label}目录不存在: ${rootDir.path}/${dirName}`);
            }
            return [];
        }

        try {
            const excludeFolders = this.instance.configData.IgnorePattern[ignoreKey] as string[];
            const include = new vscode.RelativePattern(uri, glob);
            const exclude = excludeFolders.length > 0
                ? new vscode.RelativePattern(uri, `{${excludeFolders.join(',')}}`)
                : undefined;

            const uris = await vscode.workspace.findFiles(include, exclude);
            console.log(`在 ${uri.path} 下找到 ${uris.length} 个 ${label}文件`);
            return uris;
        } catch (error) {
            vscode.window.showErrorMessage(`查找${label}文件失败: ${(error as Error).message}`);
            return [];
        }
    }

    public static async getAllFunctionsPaths(_functionsUri?: vscode.Uri): Promise<vscode.Uri[]> {
        return this.scanFiles('functions', '**/*.mcfunction', 'Function', '函数');
    }

    public static async getAllAdvancementsPaths(_advancementsUri?: vscode.Uri): Promise<vscode.Uri[]> {
        return this.scanFiles('advancements', '**/*.json', 'Advancement', '进度');
    }

}
