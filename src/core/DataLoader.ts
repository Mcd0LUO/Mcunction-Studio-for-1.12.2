import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { rootDir } from '../extension';
import { CommandUtils } from '../utils/CommandUtils';
import { IndexedStore, DataType, ScoreboardData, FunctionData, TeamData } from './IndexedStore';
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
        this.init();
    }

    /** 注册所有命令解析器（追加新命令只需加一行 set） */
    private registerHandlers(): void {
        // 原版
        this.commandHandlers.set('scoreboard', this.extractScoreboardData.bind(this));
        this.commandHandlers.set('function',   this.extractFunctionData.bind(this));
        this.commandHandlers.set('summon',     this.extractSummonData.bind(this));
        // EasyCber
        this.commandHandlers.set('team',       this.extractEasyCberTeamData.bind(this));
        this.commandHandlers.set('schedule',   this.extractScheduleData.bind(this));
        this.commandHandlers.set('score',      this.extractEasyCberScoreData.bind(this));
        this.commandHandlers.set('var',        this.extractEasyCberVarData.bind(this));
    }

    private async init(): Promise<void> {
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
        const configUri = vscode.Uri.joinPath(rootDir, 'McfunctionStudio.json');
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
        // 清空内存
        this.store = new IndexedStore();
        this.functionResNames = [];
        this.advancementResNames = [];

        const promise1 = this.loadFunctionData(useConcurrentControl, concurrency);
        const promise2 = this.loadAdvancementData();

        try {
            const [result1, result2] = await Promise.all([promise1, promise2]);

            if (result1 && result2) {
                const statusMsg = `加载函数 ${this.functionResNames.length} | 记分板 ${this.store.getScoreboards().size} | 标签 ${this.store.getTags().size} | 队伍 ${this.store.getTeams().size} | 进度 ${this.advancementResNames.length} | 假玩家 ${this.store.getFakePlayers().size} 耗时>> ${result1}s <<`;
                vscode.window.setStatusBarMessage(statusMsg, 3000);
                vscode.window.showInformationMessage(`McfunctionStudio 初始化完成, 耗时 ${result1.toFixed(3)} s`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`加载数据失败: ${error}`);
        }
    }

    public async loadAdvancementData(): Promise<boolean | null> {
        const advancementPaths = await DataLoader.getAllAdvancementsPaths();
        for (const path of advancementPaths) {
            const resName = MinecraftUtils.buildAdvancementCall(path);
            if (!resName) { continue; }
            this.advancementResNames.push(resName);
        }
        return true;
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
    }

    // ---- 原版命令解析器 ----

    private extractScoreboardData(uri: vscode.Uri, line: number, commands: string[]): void {
        if (commands.length <= 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        // scoreboard objectives add xxx dummy [desc]
        if (commands[1] === 'objectives' && commands[2] === 'add' && commands.length > 4) {
            this.store.addScoreboard(resName, commands[3], line, uri, commands[4], commands[5] ?? '');
        }
        // scoreboard players add|set|operation|remove xxx
        else if (commands[1] === 'players' && ['add', 'remove', 'set', 'operation', 'reset'].includes(commands[2])) {
            if (CommandUtils.isFakePlayerSelector(commands[3])) {
                this.store.addFakePlayer(resName, commands[3], line, uri);
            }
        }
        // scoreboard players tag @s add xxx
        else if (commands[1] === 'players' && commands[2] === 'tag' && commands[4] === 'add' && commands.length > 5) {
            this.store.addTag(resName, commands[5], line, uri);
        }
        // scoreboard teams add xxx
        else if (commands[1] === 'teams' && commands[2] === 'add') {
            this.store.addTeam(resName, commands[3], line, uri);
        }
    }

    private extractFunctionData(uri: vscode.Uri, line: number, commands: string[]): void {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        this.store.addFunctionRef(resName, commands[1], line, uri);
    }

    private extractSummonData(uri: vscode.Uri, line: number, commands: string[]): void {
        if (commands.length < 5) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        const nbt = commands[5];
        const startIdx = nbt.indexOf('Tags:[');
        if (startIdx >= 0) {
            const tags = nbt.slice(startIdx + 6);
            const endIdx = tags.indexOf('"]');
            if (endIdx >= 0) {
                const tagList = tags.slice(0, endIdx).split(',').map((t: string) => t.replaceAll('"', ''));
                tagList.forEach((tag: string) => this.store.addTag(resName, tag, line, uri));
            }
        }
    }

    // ---- EasyCber 命令解析器 ----

    /** /team add <name> → 队伍定义 */
    private extractEasyCberTeamData(uri: vscode.Uri, line: number, commands: string[]): void {
        if (commands.length < 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        if (commands[1] === 'add') {
            this.store.addTeam(resName, commands[2], line, uri);
        }
        // join / clear / leave / list / option — 引用已有队伍，暂不产生新数据
    }

    /**
     * /schedule function <func> <time> [append|replace]
     * /schedule repeat   <func> <interval> [次数]
     * /schedule random   <func> <min> <max>
     * /schedule clear    [func]
     */
    private extractScheduleData(uri: vscode.Uri, line: number, commands: string[]): void {
        if (commands.length < 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        // clear 可能没有 func 参数
        if (commands[1] === 'clear') {
            if (commands.length >= 3) {
                this.store.addFunctionRef(resName, commands[2], line, uri);
            }
            return;
        }

        // function / repeat / random 都在 commands[2] 位置有函数名
        if (['function', 'repeat', 'random'].includes(commands[1])) {
            this.store.addFunctionRef(resName, commands[2], line, uri);
        }
    }

    /**
     * /score set <obj> <sel> from <源> ...
     * 当源为 score 时，第二个记分板名被引用
     */
    /**
     * /score set <obj> <sel> from <源> ...
     * 当前：预留解析入口。记分板引用关系（如 from score <sel2> <obj2>）暂不产生 index 条目，
     * 后续可在 IndexedStore 中加入 refCount 追踪后启用。
     */
    private extractEasyCberScoreData(_uri: vscode.Uri, _line: number, commands: string[]): void {
        if (commands.length < 8) { return; }
        if (commands[1] === 'set' && commands[5] === 'from' && commands[6] === 'score') {
            // TODO: store.addScoreboardRef(commands[8]) — 追踪记分板引用
        }
    }

    /**
     * /var set <ns> <name> from <源> ...
     * 当前：预留解析入口。from score/entity/block 的引用关系暂不产生 index 条目。
     */
    private extractEasyCberVarData(_uri: vscode.Uri, _line: number, commands: string[]): void {
        if (commands.length < 8) { return; }
        if (commands[1] === 'set' && commands[4] === 'from') {
            // TODO: 根据 commands[5] (score|entity|block|time) 追踪对应引用
        }
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

    public static async getAllMacroPaths(_macroUri?: vscode.Uri): Promise<vscode.Uri[]> {
        return this.scanFiles('macros', '**/*.mcmacro', 'Macro', '宏', /* silent */ true);
    }
}
