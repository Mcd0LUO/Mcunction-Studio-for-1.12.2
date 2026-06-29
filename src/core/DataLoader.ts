import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { rootDir } from '../extension';
import { CommandUtils } from '../utils/CommandUtils';
import { IndexedStore, DataType, ScoreboardData, FunctionData, TeamData } from './data';
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
    private store = new IndexedStore();

    // ---- 简单列表（不与 docCache 交互） ----
    private functionResNames: string[] = [];
    private advancementResNames: string[] = [];

    // ---- 配置 ----
    private configData: ConfigData = DataLoader.getDefaultConfig();

    // ---- 命令解析注册表：command → handler ----
    private commandHandlers: Map<string, (uri: vscode.Uri, line: number, commands: string[]) => void> = new Map();

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
        this.loadData(true, this.configData.FileProcessing.MaxConcurrentReads);
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
                MaxConcurrentReads: 100,
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
        if (!this.store.hasDocEntry(resName)) { return; }

        if (endLine === -1) {
            endLine = doc.lineCount - 1;
        }

        this.store.clearLines(resName, startLine, endLine);
    }

    /**
     * 清除整个文件的缓存 + 数据 + 函数资源名。
     */
    public clearSingleFileAllCache(uri: vscode.Uri): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.removeFunctionRes(resName);
        this.store.clearFile(resName);
    }

    // ================================================================
    // 数据加载主流程
    // ================================================================

    public async loadData(useConcurrentControl: boolean = true, concurrency: number = 100): Promise<void> {
        // 原地清空（保持实例引用不变，handler 闭包不受影响）
        this.store.clear();
        this.functionResNames.length = 0;
        this.advancementResNames.length = 0;
        try { (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearAllCustomData(); } catch {}

        const promise1 = this.loadFunctionData(useConcurrentControl, concurrency);
        const promise2 = this.loadAdvancementData();

        try {
            const [result1, result2] = await Promise.all([promise1, promise2]);

            if (!result1 || !result2) {
                console.warn('[McfunctionStudio] 数据加载未完成', { functionResult: result1, advancementResult: result2 });
                return;
            }

            const statusMsg = `加载函数 ${this.functionResNames.length} | 记分板 ${this.store.getScoreboards().size} | 标签 ${this.store.getTags().size} | 队伍 ${this.store.getTeams().size} | 进度 ${this.advancementResNames.length} | 假玩家 ${this.store.getFakePlayers().size} 耗时>> ${result1}s <<`;
            vscode.window.setStatusBarMessage(statusMsg, 3000);
            vscode.window.showInformationMessage(`McfunctionStudio 初始化完成, 耗时 ${result1.toFixed(3)} s`);
        } catch (error) {
            console.error('[McfunctionStudio] 加载数据失败', error);
            vscode.window.showErrorMessage(`加载数据失败: ${error}`);
        }
    }

    public async loadAdvancementData(): Promise<boolean | null> {
        try {
            const advancementPaths = await DataLoader.getAllAdvancementsPaths();
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
        concurrency: number = 50
    ): Promise<number | null> {
        try {
            const functionsUri = vscode.Uri.joinPath(rootDir, 'functions');
            const functionPaths = await DataLoader.getAllFunctionsPaths(functionsUri);

            if (functionPaths.length === 0) {
                vscode.window.showInformationMessage('未找到任何 .mcfunction 函数文件');
                return null;
            }

            this.functionResNames = functionPaths
                .map(p => MinecraftUtils.buildFunctionCall(p))
                .filter((n): n is string => !!n);

            const startTime = Date.now();
            const modeName = useConcurrentControl ? `限制并发（${concurrency}）` : '串行';

            if (useConcurrentControl) {
                await this.concurrentMap(concurrency, functionPaths, async (path) => {
                    const resName = MinecraftUtils.buildFunctionCall(path);
                    if (!resName) { return; }
                    try {
                        await this.loadSingleFuncFileByUri(path);
                    } catch (err) {
                        vscode.window.showWarningMessage(`解析函数文件失败：${path.path}，原因：${(err as Error).message}`);
                    }
                });
            } else {
                for (const path of functionPaths) {
                    const resName = MinecraftUtils.buildFunctionCall(path);
                    if (!resName) { continue; }
                    try {
                        await this.loadSingleFuncFileByUri(path);
                    } catch (err) {
                        vscode.window.showWarningMessage(`解析函数文件失败：${path.path}，原因：${(err as Error).message}`);
                    }
                }
            }

            const duration = (Date.now() - startTime) / 1000;
            console.log(`【函数加载性能测试】模式：${modeName}，文件数量：${functionPaths.length}，耗时：${duration.toFixed(3)}秒`);
            return duration;
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
        // 清除该文件旧提取值
        try { (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearFileExtract(path.toString()); } catch {}
        const fileContent = await vscode.workspace.fs.readFile(path);
        const content = new TextDecoder('utf-8').decode(fileContent);
        this.parseLines(path, content.split(/\r?\n|\r/));
    }

    public async loadSingleFuncFileByDoc(doc: vscode.TextDocument, startLine: number = 0): Promise<void> {
        try { (require('../dsl/yaml/extractor') as typeof import('../dsl/yaml/extractor')).clearFileExtract(doc.uri.toString()); } catch {}
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
            applyExtractForFile(commands[0], commands, uri.toString());
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
