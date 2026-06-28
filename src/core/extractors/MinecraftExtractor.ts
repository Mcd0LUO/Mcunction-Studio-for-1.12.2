import * as vscode from 'vscode';
import { IndexedStore } from '../data';
import { MinecraftUtils } from '../../utils/MinecraftUtils';
import { CommandUtils } from '../../utils/CommandUtils';

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
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        store.addFunctionRef(resName, commands[1], line, uri);
    });

    // ---- summon ----
    handlers.set('summon', (uri, line, commands) => {
        if (commands.length < 5) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';
        const nbt = commands[5];
        const startIdx = nbt.indexOf('Tags:[');
        if (startIdx >= 0) {
            const tags = nbt.slice(startIdx + 6);
            const endIdx = tags.indexOf('"]');
            if (endIdx >= 0) {
                const tagList = tags.slice(0, endIdx).split(',').map((t: string) => t.replaceAll('"', ''));
                tagList.forEach((tag: string) => store.addTag(resName, tag, line, uri));
            }
        }
    });
}
