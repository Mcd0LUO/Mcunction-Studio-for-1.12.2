import * as vscode from 'vscode';
import { IndexedStore } from '../data';
import { MinecraftUtils } from '../../utils/MinecraftUtils';
import { CommandUtils } from '../../utils/CommandUtils';
import { extractSymbols } from '../symbols/extractor';

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
    const selectorHandler = (uri: vscode.Uri, line: number, commands: string[]) => {
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        const lineText = commands.join(' ');
        for (const occ of extractSymbols(lineText)) {
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
                default:
                    break;
            }
        }
    };

    // 与 core/symbols/extractor 的 selectorPositions 保持一致
    for (const cmd of [
        'kill', 'clear', 'effect', 'enchant', 'gamemode', 'give', 'tp', 'teleport',
        'spawnpoint', 'title', 'playsound', 'stopsound', 'testfor', 'tellraw',
        'execute', 'testforblock', 'testforblocks', 'stats', 'summon', 'replaceitem',
    ]) {
        handlers.set(cmd, selectorHandler);
    }

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
