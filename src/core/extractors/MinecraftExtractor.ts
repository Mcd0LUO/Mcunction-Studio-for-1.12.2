import * as vscode from 'vscode';
import { IndexedStore } from '../data';
import { MinecraftUtils } from '../../utils/MinecraftUtils';
import { CommandUtils } from '../../utils/CommandUtils';
import { extractSymbols, extractOuterSymbols } from '../symbols/extractor';

type LineHandler = (uri: vscode.Uri, line: number, commands: string[]) => void;

/**
 * 原版 Minecraft 命令解析器。
 * 负责从 scoreboard / function / summon 命令中提取可索引数据。
 */
export function registerHandlers(store: IndexedStore, handlers: Map<string, LineHandler>): void {

    // ---- scoreboard ----
    handlers.set('scoreboard', (uri, line, commands) => {
        if (commands.length <= 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        // scoreboard objectives add xxx dummy [desc]
        if (commands[1] === 'objectives' && commands[2] === 'add' && commands.length > 4) {
            store.addScoreboard(resName, commands[3], line, uri, commands[4], commands[5] ?? '');
        }
        // scoreboard players add|set|operation|remove xxx
        else if (commands[1] === 'players' && ['add', 'remove', 'set', 'operation', 'reset'].includes(commands[2])) {
            if (CommandUtils.isFakePlayerSelector(commands[3])) {
                store.addFakePlayer(resName, commands[3], line, uri);
            }
        }
        // scoreboard players tag @s add xxx
        else if (commands[1] === 'players' && commands[2] === 'tag' && commands[4] === 'add' && commands.length > 5) {
            store.addTag(resName, commands[5], line, uri);
        }
        // scoreboard teams add xxx
        else if (commands[1] === 'teams' && commands[2] === 'add') {
            store.addTeam(resName, commands[3], line, uri);
        }
    });

    // ---- function ----
    handlers.set('function', (uri, line, commands) => {
        if (!commands[1]) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        store.addFunctionRef(resName, commands[1], line, uri);
    });

    // ---- summon ----
    handlers.set('summon', (uri, line, commands) => {
        if (commands.length < 5) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        const nbt = commands[5];
        if (!nbt || typeof nbt !== 'string') { return; }
        const startIdx = nbt.indexOf('Tags:[');
        if (startIdx >= 0) {
            const tags = nbt.slice(startIdx + 6);
            const endIdx = tags.indexOf('"]');
            if (endIdx >= 0) {
                const tagList = tags.slice(0, endIdx).split(',').map((t: string) => t.replaceAll('"', '').trim()).filter(Boolean);
                store.addTags(resName, tagList, line, uri);
            }
        }
    });

    // ---- 选择器内的引用 ----
    // ⚠️ 这一段是 References / Rename 能跨文件工作的前提。
    //    早先只索引了 scoreboard/function/summon 三类命令，
    //    于是 `kill @a[score_x=1]` 里的引用在索引里根本不存在，
    //    "查找引用" 对选择器引用永远返回空。
    // 复用一个处理器挂到所有可能带选择器的命令上。

    /** 把抽取到的引用写进索引 */
    const indexRefs = (uri: vscode.Uri, line: number, occs: ReturnType<typeof extractSymbols>): void => {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        for (const occ of occs) {
            if (occ.role !== 'reference') { continue; }
            switch (occ.kind) {
                case 'scoreboard':
                    store.addScoreboardRef(resName, occ.value, line, uri);
                    break;
                case 'tag':
                    store.addTag(resName, occ.value, line, uri);
                    break;
                case 'team':
                    store.addTeamRef(resName, occ.value, line, uri);
                    break;
                case 'fake_player':
                    store.addFakePlayer(resName, occ.value, line, uri);
                    break;
                case 'advancement':
                    // 进度与 function 一样只有"引用"（定义是磁盘上的 JSON 文件）。
                    // 此前这个 case 缺失 → 落到 default 被静默丢弃，
                    // 于是 References / Rename 对进度全都拿不到数据。
                    store.addAdvancementRef(resName, occ.value, line, uri);
                    break;
                default:
                    break;
            }
        }
    };

    const selectorHandler = (uri: vscode.Uri, line: number, commands: string[]) => {
        indexRefs(uri, line, extractSymbols(commands.join(' ')));
    };

    /**
     * `execute` 的**外层**选择器。
     *
     * `DataLoader.handleSingleLine` 按活跃命令分派，会把 execute 前缀剥掉：
     * `execute @a[tag=x] ~ ~ ~ say hi` 的活跃命令是 `say`，
     * 于是 execute 的处理器压根不会被调用 —— 外层选择器永远进不了索引，
     * 重命名标签时这一处被漏改。
     *
     * 这里只抽本层（`extractOuterSymbols`），内层由它自己的处理器负责，
     * 避免重复索引（LineIndex.appendEntries 不去重，引用计数会虚高）。
     */
    const executeOuterHandler = (uri: vscode.Uri, line: number, commands: string[]) => {
        indexRefs(uri, line, extractOuterSymbols(commands.join(' ')));
    };

    // 与 core/symbols/extractor 的 selectorPositions 保持一致
    for (const cmd of [
        'kill', 'clear', 'effect', 'enchant', 'gamemode', 'give', 'tp', 'teleport',
        'spawnpoint', 'title', 'playsound', 'stopsound', 'testfor', 'tellraw',
        'testforblock', 'testforblocks', 'stats', 'summon', 'replaceitem',
        // advancement 不带选择器，但它含**进度资源名**符号；
        // 复用同一个抽取器，靠 kind 分派即可
        'advancement',
    ]) {
        handlers.set(cmd, selectorHandler);
    }
    // execute 单独处理：内层命令由活跃命令分派，这里只管外层
    handlers.set('execute', executeOuterHandler);

    // execute 的内层命令是任意一条命令，选择器可能在更深的位置；
    // 这里对整行再做一次兜底抽取（幂等：LineIndex 按 "file:line" 去重）。
    const origScoreboard = handlers.get('scoreboard')!;
    handlers.set('scoreboard', (uri, line, commands) => {
        origScoreboard(uri, line, commands);
        selectorHandler(uri, line, commands);
    });
    const origSummon = handlers.get('summon')!;
    handlers.set('summon', (uri, line, commands) => {
        origSummon(uri, line, commands);
        selectorHandler(uri, line, commands);
    });
    const origFunction = handlers.get('function')!;
    handlers.set('function', (uri, line, commands) => {
        origFunction(uri, line, commands);
        selectorHandler(uri, line, commands);
    });
}
