/* eslint-disable curly */
import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { rootDir } from '../extension';
import { CommandUtils } from '../utils/CommandUtils';
import { MacroDefinition, MacroRegistry } from '../macro/MacroRegistry';
import { MacroAstParser } from '../macro/MacroAst';
import { MacroTokenizer } from '../macro/MacroTokenizer';
import * as path from 'path';
import { MacroAstVisualizer } from '../macro/MacroPrint';

interface ScoreboardData {
    type: string;
    desc: string;
    def: [vscode.Uri, number];  // 定义位置 uri:行索引
}

interface functionData {
    ref: Map<string, number[]>;  // 被哪些函数引用  uri:行索引
}
interface TeamData {
    color?: string;
    rule?: string;
    def: [vscode.Uri, number];  // 函数定义位置 uri:行索引
}
export enum DataType {
    Scoreboard = 0,
    Function = 1,
    Tag = 2,
    Team = 3,
    FakePlayer = 4
}
interface ConfigData {
    IgnorePattern: {
        Function: string[];
        Advancement: string[];
    },
    Signature: boolean,
    JsonPreview: {
        LinePreview: boolean,
        HoverPreview:boolean
    },
    FileProcessing: {
        MaxConcurrentReads: number
    }
    HoverProvider: {
    },
    CommandSchemaCheck: boolean

}


export class DataLoader {
    private static instance: DataLoader;
    private functionResNames: string[] = [];  // 函数文件资源列表
    private advancementResNames: string[] = []; // 进度文件资源列表
    private scoreboardsData: Map<string, ScoreboardData> = new Map(); // 记分板数据 
    private functionData: Map<string, functionData> = new Map();  // 函数数据
    private fakePlayerData: Map<string, number> = new Map();  // 假玩家数据
    private tagsData: Map<string, number> = new Map(); // 标签数据   标签:个数
    private teamsData: Map<string, TeamData> = new Map(); // 队伍数据
    private configData: ConfigData = DataLoader.getDefaultConfig();

    private docCache: Map<string, Map<number, { type: DataType, value: string }[]>> = new Map(); // resName -> 行号: { 类型 , 值 }

    private constructor() {
        this.init();
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

    /**
     * 并发控制工具函数：限制同时执行的Promise数量
     * @param concurrency 最大并发数
     * @param items 待处理项数组
     * @param processor 处理函数
     */
    private async concurrentMap<T>(
        concurrency: number,
        items: T[],
        processor: (item: T) => Promise<void>
    ): Promise<void> {
        const results: Promise<void>[] = [];
        const executing: Promise<void>[] = [];

        for (const item of items) {
            // 创建处理当前项的Promise
            const p = Promise.resolve().then(() => processor(item));
            results.push(p);

            // 当并发数达到上限时，等待任一Promise完成再继续
            if (concurrency <= items.length) {
                const e: Promise<void> = p.then(() => { executing.splice(executing.indexOf(e), 1); }) as Promise<void>;
                executing.push(e);
                if (executing.length >= concurrency) {
                    await Promise.race(executing);
                }
            }
        }

        // 等待所有处理完成
        await Promise.all(results);
    }
    // 加载数据
    // 修改loadData方法，支持切换加载模式（可选）
    public async loadData(useConcurrentControl: boolean = true, concurrency: number = 100): Promise<any> {
        this.scoreboardsData.clear();
        this.functionResNames = [];
        this.advancementResNames = [];
        this.tagsData.clear();
        this.functionData.clear();
        this.fakePlayerData.clear();
        this.teamsData.clear();

        // 传入加载模式参数
        const promise1 = this.loadFunctionData(useConcurrentControl, concurrency);
        const promise2 = this.loadAdvancementData();
        const promise3 = this.loadMacroData();

        try {
            const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

            if (result1 && result2 && result3) {
                // 在底层状态栏显示
                vscode.window.setStatusBarMessage(`加载函数 ${this.functionResNames.length} | 记分板 ${this.scoreboardsData.size} | 标签 ${this.tagsData.size} | 队伍 ${this.teamsData.size} | 进度 ${this.advancementResNames.length} | 假玩家 ${this.fakePlayerData.size} |  耗时>> ${result1}s <<`, 3000);
                vscode.window.showInformationMessage(`McfunctionStudio 初始化完成, 耗时 ${result1} s`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`加载数据失败: ${error}`);
        }

        return 0;
    }

    public getConfig(): ConfigData {
        return this.configData;

    }

    public static getDefaultConfig(): ConfigData {
        return {
            IgnorePattern: {
                Function: [],
                Advancement: []
            },
            JsonPreview: {
                LinePreview: true,
                HoverPreview: true
            },
            FileProcessing: {
                MaxConcurrentReads: 100
            },
            HoverProvider: {
            },
            Signature: true,
            CommandSchemaCheck: true
        };
    }

    public getFunctionResNames(): string[] {
        return this.functionResNames;
    }
    public getAdvancementResNames(): string[] {
        return this.advancementResNames;
    }
    public getScoreboardsData(): Map<string, ScoreboardData> {
        return this.scoreboardsData;
    }
    public getFunctionData(): Map<string, functionData> {
        return this.functionData;
    }
    public getFakePlayerData(): Map<string, number> {
        return this.fakePlayerData;
    }
    public getTagsData(): Map<string, number> {
        return this.tagsData;
    }
    public getTeamsData(): Map<string, TeamData> {
        return this.teamsData;
    }
    public getDocCache(): Map<string, Map<number, { type: DataType, value: string }[]>> {
        return this.docCache;
    }
    public getScoreboardDef(scoreboardName: string): { uri: vscode.Uri, range: vscode.Range } | null {
        const scoreboardData = this.scoreboardsData.get(scoreboardName);
        if (scoreboardData) {
            const [uri, lineNumber] = scoreboardData.def;
            return { uri, range: new vscode.Range(lineNumber, 0, lineNumber, 0) };
        }
        return null;
    }

    public getTeamDef(teamName: string): { uri: vscode.Uri, range: vscode.Range } | null {
        const teamData = DataLoader.getInstance().getTeamsData().get(teamName);
        if (teamData) {
            const [uri, lineNumber] = teamData.def;
            return { uri, range: new vscode.Range(lineNumber, 0, lineNumber, 0) };
        }
        return null;
    }

    public addTag(tagName: string, uri: vscode.Uri, lineNumber: number): void {
        const value = this.tagsData.get(tagName);
        if (value) {
            this.tagsData.set(tagName, value + 1);
        }
        this.tagsData.set(tagName, 1);
        const cache = this.docCache.get(MinecraftUtils.buildFunctionCall(uri) ?? '');
        const linemeta: { type: DataType, value: string }[] = cache?.get(lineNumber) ?? [];
        linemeta.push({ type: DataType.Tag, value: tagName });
        cache?.set(lineNumber, linemeta);
    }
    public addTeam(teamName: string, uri: vscode.Uri, lineNumber: number): void {
        const teamData = this.teamsData.get(teamName);
        if (teamData) {
            teamData.def = [uri, lineNumber];
        }
        this.teamsData.set(teamName, {def: [uri, lineNumber]});
        const cache = this.docCache.get(MinecraftUtils.buildFunctionCall(uri) ?? '');
        const linemeta: { type: DataType, value: string }[] = cache?.get(lineNumber) ?? [];
        linemeta.push({ type: DataType.Team, value: teamName });
        cache?.set(lineNumber, linemeta);
    }
    public addFunctionRes(uri: vscode.Uri): void  {
        const resName = MinecraftUtils.buildFunctionCall(uri);
        if (resName) {
            this.functionResNames.push(resName);
        }
    }
    public removeFunctionRes(resName: string): void { 
        const index = this.functionResNames.indexOf(resName);
        if (index > -1) {
            this.functionResNames.splice(index, 1);
        }
    }
    public addFakePlayer(playerName: string, uri: vscode.Uri, lineNumber: number): void { 
        const fakeData = this.fakePlayerData.get(playerName)?? 0;
        this.fakePlayerData.set(playerName, fakeData + 1);
        // cache
        const cache = this.docCache.get(MinecraftUtils.buildFunctionCall(uri) ?? '');
        const linemeta: { type: DataType, value: string }[] = cache?.get(lineNumber) ?? [];
        linemeta.push({ type: DataType.FakePlayer, value: playerName });
        cache?.set(lineNumber, linemeta);

    }

    private addScoreboard(scoreboardName: string, type: string, lineNumber: number, uri: vscode.Uri, desc: string = ''): void {
        // 先尝试获取这个记分板
        const scoreboard = this.scoreboardsData.get(scoreboardName);
        if (!scoreboard) {
            const def: [vscode.Uri, number] = [uri, lineNumber];
            const data: ScoreboardData = { type: type, desc: desc, def: def };
            // 存入
            this.scoreboardsData.set(scoreboardName, data);
            const cache = this.docCache.get(MinecraftUtils.buildFunctionCall(uri) ?? '');
            const linemeta: { type: DataType, value: string }[] = cache?.get(lineNumber) ?? [];
            linemeta.push({ type: DataType.Scoreboard, value: scoreboardName });
            cache?.set(lineNumber, linemeta);

        }
        // 已有则警告
        else {
            const def = scoreboard.def;
            if (def) {
                vscode.window.showWarningMessage(`重复定义记分板目标：${scoreboardName} 在 ${MinecraftUtils.buildFunctionCall(uri)} : ${lineNumber}`);
            }
        }

    }

    public clearCache(doc: vscode.TextDocument, startLine: number = 0, endLine: number = -1) {
        if (endLine === -1) {
            endLine = doc.lineCount - 1;
        }
        // 文档缓存
        const resName = MinecraftUtils.buildFunctionCall(doc.uri) ?? '';
        const docCacheEntry = this.docCache.get(resName);
        if (!docCacheEntry) {return;};
        // 遍历行缓存
        for (let i = startLine; i <= endLine; i++) {
            const lineCache = docCacheEntry.get(i);
            lineCache?.forEach(meta => {
                if (meta.type === DataType.Scoreboard) {
                    // 删除缓存
                    this.scoreboardsData.delete(meta.value);
                }
                else if (meta.type === DataType.Team) {
                    // 删除缓存
                    this.teamsData.delete(meta.value);
                }
                else if (meta.type === DataType.Tag) {
                    // 删除缓存
                    let count = this.tagsData.get(meta.value);
                    count && count > 1 ? this.tagsData.set(meta.value, count - 1) : this.tagsData.delete(meta.value);
                }
                else if (meta.type === DataType.FakePlayer) {
                    // 删除缓存
                    const count = this.fakePlayerData.get(meta.value);
                    count && count > 1 ? this.fakePlayerData.set(meta.value, count - 1) : this.fakePlayerData.delete(meta.value);
                }
            });
            docCacheEntry.delete(i);
        }
    }

    public clearSingleFileAllCache(uri: vscode.Uri) {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        const docCacheEntry = this.docCache.get(resName);
        if (!docCacheEntry) {return;}
        for (const [lineNumber, lineMeta] of docCacheEntry) {
             lineMeta.forEach(meta => {
                if (meta.type === DataType.Scoreboard) {
                    // 删除缓存
                    this.scoreboardsData.delete(meta.value);
                }
                else if (meta.type === DataType.Team) {
                    // 删除缓存
                    this.teamsData.delete(meta.value);
                }
                else if (meta.type === DataType.Tag) {
                    // 删除缓存
                    this.tagsData.delete(meta.value);
                }
                else if (meta.type === DataType.FakePlayer) {
                    // 删除缓存
                    this.fakePlayerData.delete(meta.value);
                }
            });
        }
        this.docCache.delete(resName);
        this.functionResNames = this.functionResNames.filter(name => name !== resName);
    }

    public async loadExtensionConfig(): Promise<void> {
        if (!rootDir) { return; }
        const configUri = vscode.Uri.joinPath(rootDir, 'McfunctionStudio.json');
        // 定义基础默认配置（完整结构）
        const defaultConfig: ConfigData = DataLoader.getDefaultConfig();

        try {
            // 尝试读取文件
            const configContent = await vscode.workspace.fs.readFile(configUri);
            let userConfig: Partial<ConfigData>;

            try {
                // 尝试解析用户配置
                userConfig = JSON.parse(configContent.toString());
                
                // 合并用户配置到默认配置（补充缺失字段）
                this.configData = this.mergeConfigs(defaultConfig, userConfig);
            } catch (parseError) {
                // JSON 语法错误：使用默认配置并提示
                vscode.window.showWarningMessage(`配置文件格式错误，已自动修复。错误：${(parseError as Error).message}`);
                this.configData = defaultConfig;
                
                // 仅在出现语法错误时才写回文件
                const finalConfigContent = Buffer.from(JSON.stringify(this.configData, null, 2), 'utf-8');
                await vscode.workspace.fs.writeFile(configUri, finalConfigContent);
            }

            console.log('配置文件加载完成');
            vscode.window.showInformationMessage('Mcfunction Studio 配置文件已加载');
        } catch (error) {
            // 文件不存在或读取失败：创建默认配置
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
                // 其他错误（如权限问题）
                vscode.window.showErrorMessage(`加载配置失败: ${(error as Error).message}`);
                // 至少保证内存中的配置是完整的默认配置
                this.configData = defaultConfig;
            }
        }
    }

    /**
     * 递归合并用户配置到默认配置（用户配置缺失的字段用默认值补充）
     * @param defaultConfig 完整的默认配置
     * @param userConfig 用户提供的不完整配置
     */
    private mergeConfigs<T extends object>(defaultConfig: T, userConfig: Partial<T>): T {
        const merged: any = { ...defaultConfig };
        for (const key in userConfig) {
            if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
                const defaultVal = merged[key];
                const userVal = userConfig[key];
                // 如果是对象且不是数组，递归合并（避免覆盖嵌套结构）
                if (defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal) && userVal !== null && typeof userVal === 'object') {
                    merged[key] = this.mergeConfigs(defaultVal, userVal as object);
                } else {
                    // 基本类型或数组：直接使用用户配置（如果存在）
                    merged[key] = userVal !== undefined ? userVal : defaultVal;
                }
            }
        }
        return merged as T;
    }



    /**
    * 获取所有函数文件路径
    * @param rootDir 存档data根目录
    */
    public static async getAllFunctionsPaths(functionsUri: vscode.Uri): Promise<vscode.Uri[]> {
        try {
            await vscode.workspace.fs.stat(functionsUri);
        } catch (error) {
            vscode.window.showErrorMessage(`函数目录不存在: ${rootDir.path}/functions`);
            return [];
        }

        try {
            // 2. 核心：用 glob 模式 **/*.mcfunction 递归匹配所有函数文件
            // glob 格式：{functions目录路径}/**/*.mcfunction（** 表示所有子目录）
            const excludeFolders = this.instance.configData.IgnorePattern.Function;
            const includePattern = new vscode.RelativePattern(functionsUri, '**/*.mcfunction');
            const excludePattern = excludeFolders.length > 0 
                ? new vscode.RelativePattern(functionsUri, `{${excludeFolders.join(',')}}`)
                : undefined;

            // 3. 调用 VS Code API 查找文件（自动递归，无需手动遍历）
            const functionUris = await vscode.workspace.findFiles(includePattern, excludePattern);

            console.log(`在 ${functionsUri.path} 下找到 ${functionUris.length} 个 函数文件`);
            return functionUris;
        } catch (error) {
            vscode.window.showErrorMessage(`查找函数文件失败: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * 获取所有进度文件路径
     * @param rootDir 存档data根目录
     */
    public static async getAllAdvancementsPaths(advancementsUri: vscode.Uri): Promise<vscode.Uri[]> {
        try {
            await vscode.workspace.fs.stat(advancementsUri);
        } catch (error) {
            vscode.window.showErrorMessage(`进度目录不存在: ${rootDir.path}/advancements`);
            return [];
        }

        try {
            // 2. 核心：用 glob 模式 **/*.json 递归匹配所有函数文件
            // glob 格式：{functions目录路径}/**/*.json（** 表示所有子目录）
            const excludeFolders = this.instance.configData.IgnorePattern.Advancement;
            const globPattern = new vscode.RelativePattern(advancementsUri, '**/*.json');
            const excludePattern = excludeFolders.length > 0
                ? new vscode.RelativePattern(advancementsUri, `{${excludeFolders.join(',')}}`)
                : undefined;

            const AdvancementsUris = await vscode.workspace.findFiles(globPattern, excludePattern);

            console.log(`在 ${advancementsUri.path} 下找到 ${AdvancementsUris.length} 个 进度文件`);
            return AdvancementsUris;
        } catch (error) {
            vscode.window.showErrorMessage(`查找进度文件失败: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * 获取所有宏定义文件路径
     */
    public static async getAllMacroPaths(macroUri: vscode.Uri): Promise<vscode.Uri[]> {
        try {
            await vscode.workspace.fs.stat(macroUri);
        } catch (error) {
            // vscode.window.showErrorMessage(`宏目录不存在: ${rootDir.path}/advancements`);
            return [];
        }

        try {

            const excludeFolders = this.instance.configData.IgnorePattern.Advancement;
            const globPattern = new vscode.RelativePattern(macroUri, '**/*.mcmacro');
            const excludePattern = excludeFolders.length > 0
                ? new vscode.RelativePattern(macroUri, `{${excludeFolders.join(',')}}`)
                : undefined;

            const MacroUris = await vscode.workspace.findFiles(globPattern, excludePattern);
            console.log(`在 ${macroUri.path} 中找到 ${MacroUris.length} 个宏文件`);
            return MacroUris;
        } catch (error) {
            vscode.window.showErrorMessage(`查找宏文件失败: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * 批量加载所有函数数据：
     * 支持两种加载模式，通过参数切换并统计运行时间
     * @param useConcurrentControl 是否使用并发控制（true：限制并发数；false：全量并发）
     * @param concurrency 并发控制模式下的最大并发数（默认50）
     */
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

            // 提取所有函数的标准名称（resName）
            this.functionResNames = functionPaths
                .map(path => MinecraftUtils.buildFunctionCall(path))
                .filter((resName): resName is string => !!resName);

            // 记录开始时间
            const startTime = Date.now();
            const modeName = useConcurrentControl ? `限制并发（${concurrency}）` : '全量并发';

            if (useConcurrentControl) {
                // 模式1：使用并发控制加载
                await this.concurrentMap(concurrency, functionPaths, async (path) => {
                    const resName = MinecraftUtils.buildFunctionCall(path);
                    if (!resName) return;

                    this.docCache.set(resName, new Map());
                    try {
                        await this.loadSingleFileByUri(path);
                    } catch (err) {
                        vscode.window.showWarningMessage(`解析函数文件失败：${path.path}，原因：${(err as Error).message}`);
                    }
                });
            }

            // 计算并输出运行时间
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // 转换为秒
            console.log(`【函数加载性能测试】模式：${modeName}，文件数量：${functionPaths.length}，耗时：${duration.toFixed(2)}秒`);

            return duration;
        } catch (error) {
            vscode.window.showErrorMessage(`加载函数数据失败：${(error as Error).message}`);
            return null;
        }
    }

    public async loadAdvancementData(): Promise<boolean | null> {
        const advancementPaths = await DataLoader.getAllAdvancementsPaths(vscode.Uri.joinPath(rootDir, 'advancements'));
        for (const path of advancementPaths) {
            const resName = MinecraftUtils.buildAdvancementCall(path);
            if (!resName) continue;
            this.advancementResNames.push(resName);
        }
        return true;

    }

    public async loadMacroData(): Promise<boolean> {
        const macroRoot = vscode.Uri.joinPath(rootDir, 'mcmacro');
        const macroPaths = await DataLoader.getAllMacroPaths(macroRoot);
        const macroRegistry = MacroRegistry.getInstance();
        macroRegistry.clear();
        macroRegistry.setConflictStrategy('strict');
        for (const macroUri of macroPaths) {
            await this.parseMacroFile(macroUri, macroRoot);
        }


        return true;
    }


    /**
     * 解析单个宏文件，提取宏定义并注册
     * @param macroUri 宏文件Uri
     * @param mcmacroRootUri mcmacro根目录Uri
     */
    private async parseMacroFile(macroUri: vscode.Uri, mcmacroRootUri: vscode.Uri): Promise<void> {
        try {
            // 1. 读取文件内容
            const fileContent = await vscode.workspace.fs.readFile(macroUri);
            const text = Buffer.from(fileContent).toString('utf8');

            // 2. 词法分析 + AST解析（使用之前的Lexer和Parser）
            const lexer = new MacroTokenizer(text);
            const tokens = lexer.parse();
            const parser = new MacroAstParser(tokens);
            console.log(tokens);
            const ast = parser.parse(); // 得到McFunctionFile AST
            MacroAstVisualizer.print(ast);

            // 3. 生成文件的命名空间（基于相对于mcmacro根目录的路径）
            const namespace = this.getNamespaceFromPath(macroUri, mcmacroRootUri);

            // 4. 遍历AST中的宏定义，提取并注册
            if (ast.macros && ast.macros.length > 0) {
                for (const macroNode of ast.macros) {
                    // 4.1 提取宏参数签名（如 "a,b"）
                    const paramSignature = macroNode.parameters.map(p => p.name).join(',');
                    // 4.2 生成宏完整标识
                    const fullId = `${namespace}.${macroNode.name}(${paramSignature})`;
                    // 4.3 构建宏定义对象
                    const macroDef: MacroDefinition = {
                        fullId,
                        name: macroNode.name,
                        namespace,
                        params: macroNode.parameters.map(p => ({ name: p.name, type: p.paramType || 'score' })),
                        paramSignature,
                        body: macroNode.body,
                        filePath: macroUri.fsPath,
                        position: new vscode.Position(
                            macroNode.position.start.line - 1, // 转换为VSCode的0行起始
                            macroNode.position.start.column - 1
                        )
                    };

                    // 4.4 注册宏
                    MacroRegistry.getInstance().registerMacro(macroDef);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`解析宏文件失败 ${macroUri.fsPath}：${(error as Error).message}`);
            console.error(error);
        }
    }

    /**
     * 基于文件路径生成命名空间
     * @param fileUri 宏文件Uri
     * @param rootUri mcmacro根目录Uri
     * @returns string 命名空间（如 player::skill）
     */
    private getNamespaceFromPath(fileUri: vscode.Uri, rootUri: vscode.Uri): string {
        // 获取文件相对于mcmacro根目录的路径（如 player/skill/c.mcmacro）
        const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
        // 去掉文件名和后缀，保留目录部分
        const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
        // 根目录文件 → default，子目录 → 目录名用::分隔
        return dirPath === '' ? 'default' : dirPath.replace(/\//g, '.');
    }

    /**
    * 加载单个函数数据
    * @param path 函数文件路径
    * @param startLine 起始行数（默认从0行开始）
    * @param mode 模式：0-新加载模式 1-刷新，模式
    */
    public async loadSingleFileByUri(path: vscode.Uri, startLine: number = 0, endLine: number = -1): Promise<null> {
        // 1. 读取文件内容（VS Code 原生 API，兼容跨平台/远程工作区）

        const fileContent = await vscode.workspace.fs.readFile(path);
        // 解码为字符串（支持 UTF-8 编码，兼容中文注释）
        const content = new TextDecoder('utf-8').decode(fileContent);

        // 2. 按行解析（避免跨行长命令误匹配）
        const lines = content.split(/\r?\n|\r/);
        for (let i = startLine; i < lines.length; i++) {
            this.handleSingleLine(path, lines[i], i);
        }

        return null;

        
    }
    /**
    * 加载单个函数数据
    * @param path 函数文件路径
    * @param startLine 起始行数（默认从0行开始）
    * @param mode 模式：0-新加载模式 1-刷新，模式
    */
    public async loadSingleFileByDoc(doc: vscode.TextDocument, startLine: number = 0, endLine: number = -1): Promise<null> {
        // 1. 读取文件内容（VS Code 原生 API，兼容跨平台/远程工作区）

        // 2. 按行解析（避免跨行长命令误匹配）
        const lines = doc.getText().split(/\r?\n|\r/);
        for (let i = startLine; i < lines.length; i++) {
            this.handleSingleLine(doc.uri, lines[i], i);
        }

        return null;

    }

    


    public handleSingleLine(uri: vscode.Uri, line: string, index: number): void {
        {
            const trimLine = line.trim();
            if (!trimLine || trimLine.startsWith('#')) {
                return;
            }
            const commands = CommandUtils.extraceActiveCommand(trimLine);
            switch (commands[0]) {
                case 'scoreboard':
                    this.extractScoreboardData(uri, index, commands);
                    break;
                case 'function':
                    this.extractFunctionData(uri, index, commands);
                case "summon":
                    this.extractSummonData(uri, index, commands);

            }
        }
    }

    private extractScoreboardData(uri: vscode.Uri, lineNumber: number, commands: string[]): void {
        if (commands.length <= 3) { return; }
        // scoreboard objectives add xxx dummy desc 
        if (commands[1] === 'objectives' && commands[2] === 'add' && commands.length > 4) {
            this.addScoreboard(commands[3], commands[4],lineNumber, uri , commands[5]);

        }
        // scoreboard players add|set|operation|remove xxx yyy zzz
        else if (commands[1] === 'players' && ["add", "remove", "set", "operation", "reset"].includes(commands[2])) {
            // 如果有假玩家名，则添加到假玩家
            if (CommandUtils.isFakePlayerSelector(commands[3])) {
                this.addFakePlayer(commands[3],uri, lineNumber);
            }
        }
        else if (commands[1] === 'players' && commands[2] === 'tag' && commands[4] === 'add' && commands.length > 5) {
            // scoreboard players tag @s add|remove xxx
            this.addTag(commands[5], uri, lineNumber);
        }
        else if (commands[1] === 'teams') {
            // scoreboard teams add xxx
            if (commands[2] === 'add') {
                this.addTeam(commands[3],uri,lineNumber);
            }
            else if (commands[2] === 'opetion') {
                
            }
        }

    }

    /**
     * 提取函数命令数据
     * @param uri 当前函数路径
     * @param lineNumber 当前行号
     * @param commands 命令组
     */
    async extractFunctionData(uri: vscode.Uri, lineNumber: number, commands: string[]) {
        // 设置函数引用
        let funcData = this.functionData.get(commands[1]);
        if (!funcData) {
            // 创建该行函数缓存
            const newMap = { ref: new Map<string, number[]>()} as functionData;
            this.functionData.set(commands[1], newMap);
        }
        funcData = this.functionData.get(commands[1]);
        // 本函数res
        const resName = MinecraftUtils.buildFunctionCall(uri)?? '';
        // 设置函数引用
        const lines = funcData?.ref.get(resName) ?? [];
        lines.push(lineNumber);
        funcData?.ref.set(resName, lines);

        // 修复错误：正确地设置docCache
        const cache = this.docCache.get(resName) ?? new Map<number, { type: DataType, value: string }[]>();
        const linemeta: { type: DataType, value: string }[] = cache.get(lineNumber) ?? [];
        linemeta.push({ type: DataType.Function, value: commands[1] });
        cache.set(lineNumber, linemeta);
    }

    private extractSummonData(uri: vscode.Uri, lineNumber: number, commands: string[]): void {
        if (commands.length < 5) { return; }
        // summon xxx x y z {Tags:["demo"]}
        const nbt = commands[5];
        const start_index = nbt.indexOf("Tags:[");
        if (start_index >= 0) {
            const tags = nbt.slice(start_index + 6);
            const end_index = tags.indexOf('"]');
            if (end_index >= 0) {
                const tag_list = tags.slice(0, end_index).split(",").map(tag => tag.replaceAll('"', ''));
                tag_list.forEach(tag => this.addTag(tag, uri, lineNumber));
            }
        };
    }



}


