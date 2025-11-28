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
    ref: Map<vscode.Uri, number[]>;  // 被哪些函数引用  uri:行索引
}
interface TeamData {
    color?: string;
    rule?: string;
    def: [vscode.Uri, number];  // 函数定义位置 uri:行索引
}


export class DataLoader {
    private static instance: DataLoader;
    private functionResNames: string[] = [];  // 函数文件资源列表
    private advancementResNames: string[] = []; // 进度文件资源列表
    private scoreboardsData: Map<string, ScoreboardData> = new Map(); // 记分板数据 
    private functionData: Map<string, functionData> = new Map();  // 函数数据
    private fakePlayerData: Map<string, Map<vscode.Uri, number[]>> = new Map();  // 假玩家数据
    private tagsData: Map<string, number> = new Map(); // 标签数据   标签:个数
    private teamsData: Map<string, TeamData> = new Map();

    private constructor() {
        this.loadData();
    }

    public static getInstance(): DataLoader {
        if (!DataLoader.instance) {
            DataLoader.instance = new DataLoader();
        }
        return DataLoader.instance;
    }
    // 加载数据
    public async loadData(): Promise<any> {
        this.scoreboardsData.clear();
        this.functionResNames = [];
        this.advancementResNames = [];
        this.tagsData.clear();
        this.functionData.clear();
        this.fakePlayerData.clear();
        this.teamsData.clear();
        // 并行执行
        const promise1 = this.loadFunctionData();
        const promise2 = this.loadAdvancementData();

        try {
            // 并行等待解析
            const [result1, result2] = await Promise.all([promise1, promise2]);

            if (result1 && result2) {
                vscode.window.showInformationMessage(
                    `加载 ${this.functionResNames.length} 个函数，提取到 ${this.scoreboardsData.size} 个记分板, ${this.tagsData.size} 个标签, ${this.advancementResNames} 个进度, ${this.fakePlayerData.size} 个假玩家`
                );
            }
        } catch (error) {
            // 处理任一函数执行失败的情况
            vscode.window.showErrorMessage(`加载数据失败: ${error}`);
        }

        return 0;
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
    public getFakePlayerData(): Map<string, Map<vscode.Uri, number[]>> {
        return this.fakePlayerData;
    }
    public getTagsData(): Map<string, number> {
        return this.tagsData;
    }
    public getTeamsData(): Map<string, TeamData> {
        return this.teamsData;
    }
    public getScoreboardDef(scoreboardName: string): { uri: vscode.Uri, range: vscode.Range } | null {
        const scoreboardData = DataLoader.getInstance().getScoreboardsData().get(scoreboardName);
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

    public addTag(tagName: string): void {
        const value = this.tagsData.get(tagName);
        if (value) {
            this.tagsData.set(tagName, value + 1);
        }
        this.tagsData.set(tagName, 1);
    }
    public addTeam(teamName: string, uri: vscode.Uri, lineNumber: number): void {
        const teamData = this.teamsData.get(teamName);
        if (teamData) {
            teamData.def = [uri, lineNumber];
        }
        this.teamsData.set(teamName, {def: [uri, lineNumber]});
    }
    public addFunction(uri: vscode.Uri): void  {
        const resName = MinecraftUtils.getFunctionResName(uri);
        if (resName) {
            this.functionResNames.push(resName);
        }
    }


    private addScoreboard(scoreboardName: string,type: string, lineNumber: number, uri: vscode.Uri, desc: string = ''): void {
        // 先尝试获取这个记分板
        const scoreboard = this.scoreboardsData.get(scoreboardName);
        if (!scoreboard) {
            const def: [vscode.Uri, number] = [uri, lineNumber];
            const data: ScoreboardData = { type: type, desc: desc, def: def };
            this.scoreboardsData.set(scoreboardName, data);
        }
        // 已有则警告
        else {
            const def = scoreboard.def;
            if (def) {
                vscode.window.showWarningMessage(`重复定义记分板目标：${scoreboardName} 在 ${uri.path}:${lineNumber}`);
            }
        }
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
     * 1. 提取所有函数的标准名称（resName）
     * 2. 并发解析所有函数文件，提取记分板和标签
     */
    public async loadFunctionData(): Promise<boolean | null> {
        try {
            const functionsUri = vscode.Uri.joinPath(rootDir, 'functions');
            const functionPaths = await DataLoader.getAllFunctionsPaths(functionsUri);

            if (functionPaths.length === 0) {
                vscode.window.showInformationMessage('未找到任何 .mcfunction 函数文件');
                return null;
            }

            // 第一步：提取所有函数的标准名称（resName）
            this.functionResNames = functionPaths
                .map(path => MinecraftUtils.buildFunctionCallByUri(path))
                .filter((resName): resName is string => !!resName); // 过滤无效名称

            // 第二步：并发解析所有函数文件（I/O 操作并发执行，比串行更快）
            await Promise.all(
                functionPaths.map(path => this.loadSingleFunctionData(path).catch(err => {
                    // 单个文件解析失败不中断整体流程
                    vscode.window.showWarningMessage(`解析函数文件失败：${path.path}，原因：${err.message}`);
                }))
            );


            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`加载函数数据失败：${(error as Error).message}`);
            return null;
        }
    }

    public async loadAdvancementData(): Promise<boolean | null> {
        const advancementPaths = await DataLoader.getAllAdvancementsPaths(vscode.Uri.joinPath(rootDir, 'advancements'));
        for (const path of advancementPaths) {
            const resName = MinecraftUtils.buildAdvancementCallByUri(path);
            if (!resName) continue;
            this.advancementResNames.push(resName);
        }
        return true;

    }

    public async loadSingleFunctionData(path: vscode.Uri): Promise<null> {
        try {
            // 1. 读取文件内容（VS Code 原生 API，兼容跨平台/远程工作区）
            const fileContent = await vscode.workspace.fs.readFile(path);
            // 解码为字符串（支持 UTF-8 编码，兼容中文注释）
            const content = new TextDecoder('utf-8').decode(fileContent);

            // 2. 按行解析（避免跨行长命令误匹配）
            const lines = content.split(/\r?\n|\r/);

            // 3. 提取数据（正则适配 1.12.2 命令格式）
            lines.forEach((line, index) => {
                // 解析为命令数组
                const trimLine = line.trim();
                if (!trimLine || trimLine.startsWith('#')) {
                    return;
                }
                const commands = CommandUtils.extraceActiveCommand(trimLine);
                switch (commands[0]) {
                    case 'scoreboard':
                        this.extractScoreboardData(path, index, commands);
                        break;
                    case 'function':
                        this.extractFunctionData(path, index, commands);
                    case "summon":
                        this.extractSummonData(path, index, commands);

                }
            });

            return null;
        } catch (error) {
            throw new Error((error as Error).message);
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
                const fakeData = this.fakePlayerData.get(commands[3]);
                if (!fakeData) {
                    const data = new Map<vscode.Uri, number[]>();
                    data.set(uri, [lineNumber]);
                    this.fakePlayerData.set(commands[3], data);
                }
                else {
                    const def = fakeData.get(uri);
                    if (def) {
                        def.push(lineNumber);
                    }
                    else {
                        fakeData.set(uri, [lineNumber]);
                    }
                }
            }
        }
        else if (commands[1] === 'players' && commands[2] === 'tag' && commands.length > 5) {
            // scoreboard players tag @s add|remove xxx
            this.addTag(commands[5]);
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


    async extractFunctionData(path: vscode.Uri, lineNumber: number, commands: string[]) {
        // 验证函数存在

        const funcData = this.functionData.get(commands[1]);
        // 检查该函数的data是否已经初始化
        if (funcData) {
            if (funcData.ref && funcData.ref.get(path)) {
                funcData.ref.get(path)?.push(lineNumber);
            }
            else {
                const funcData: functionData = { ref: new Map<vscode.Uri, number[]>() };
                funcData.ref.set(path, [lineNumber]);
                this.functionData.set(commands[1], funcData);
            }
        }
        else {
            const data = new Map<vscode.Uri, number[]>();
            data.set(path, [lineNumber]);
            this.functionData.set(commands[1], { ref: data });
        }



    }

    private extractSummonData(uri: vscode.Uri, lineNumber: number, commands: string[]): void {
        if (commands.length < 5) { return; }
        // summon xxx x y z {}
        const nbt = commands[5];
        const start_index = nbt.indexOf("Tags:[");
        if (start_index >= 0) {
            const tags = nbt.slice(start_index + 6);
            const end_index = tags.indexOf('"]');
            if (end_index >= 0) {
                const tag_list = tags.slice(0, end_index).split(",").map(tag => tag.replaceAll('"', ''));
                tag_list.forEach(tag => this.addTag(tag));
            }
        };
    }



}


