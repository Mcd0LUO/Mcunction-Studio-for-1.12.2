/* eslint-disable curly */
import * as vscode from 'vscode';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { rootDir } from '../extension';
import { CommandUtils } from '../utils/CommandUtils';

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
        function: string[];
        advancement: string[];
    },
    Signature: boolean,
    JsonPreview: {
        LinePreview: boolean,
        HoverPreview:boolean
    },
    SelecterDiagnostics: boolean,
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
    private configData: ConfigData = {
        IgnorePattern: {
            function: [],
            advancement: []
        },
        JsonPreview: {
            LinePreview: true,
            HoverPreview: true
        },
        Signature: true,
        SelecterDiagnostics: true,
        CommandSchemaCheck: true
    }; // 配置数据

    private docCache: Map<string, Map<number, { type: DataType, value: string }[]>> = new Map(); // uri -> 行号: { 类型 , 值 }

    private constructor() {
        this.loadData(false);

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
    public async loadData(useConcurrentControl: boolean = false, concurrency: number = 10): Promise<any> {
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

        try {
            const [result1, result2] = await Promise.all([promise1, promise2]);

            if (result1 && result2) {
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
        if (!docCacheEntry) {console.log('no cache'); return;};
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
        if (!docCacheEntry) {console.log('no cache'); return;}
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
            const globPattern = new vscode.RelativePattern(functionsUri, '**/*.mcfunction');

            // 3. 调用 VS Code API 查找文件（自动递归，无需手动遍历）
            const functionUris = await vscode.workspace.findFiles(globPattern);

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
            const globPattern = new vscode.RelativePattern(advancementsUri, '**/*.json');

            const AdvancementsUris = await vscode.workspace.findFiles(globPattern);

            console.log(`在 ${advancementsUri.path} 下找到 ${AdvancementsUris.length} 个 进度文件`);
            return AdvancementsUris;
        } catch (error) {
            vscode.window.showErrorMessage(`查找进度文件失败: ${(error as Error).message}`);
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
        concurrency: number = 10
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
            } else {
                // 模式2：原有全量并发加载
                await Promise.all(
                    functionPaths.map(path => {
                        const resName = MinecraftUtils.buildFunctionCall(path);
                        if (!resName) return Promise.resolve();
                        this.docCache.set(resName, new Map());
                        return this.loadSingleFileByUri(path).catch(err => {
                            vscode.window.showWarningMessage(`解析函数文件失败：${path.path}，原因：${err.message}`);
                        });
                    })
                );
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
        else if (commands[1] === 'players' && ["add", "remove", "set", "operation"].includes(commands[2])) {
            // 如果有假玩家名，则添加到假玩家
            if (CommandUtils.isFakePlayerSelector(commands[3])) {
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


