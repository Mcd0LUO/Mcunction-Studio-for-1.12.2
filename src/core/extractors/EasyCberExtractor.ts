import * as vscode from 'vscode';
import { IndexedStore } from '../data';
import { MinecraftUtils } from '../../utils/MinecraftUtils';

type LineHandler = (uri: vscode.Uri, line: number, commands: string[]) => void;

/**
 * EasyCber 插件命令解析器。
 * 负责从 EasyCber 扩展命令中提取可索引数据（team / schedule / score / var）。
 */
export function registerHandlers(store: IndexedStore, handlers: Map<string, LineHandler>): void {

    // ---- /team add <name> → 队伍定义 ----
    handlers.set('team', (uri, line, commands) => {
        if (commands.length < 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        if (commands[1] === 'add') {
            store.addTeam(resName, commands[2], line, uri);
        }
        // join / clear / leave / list / option — 引用已有队伍，暂不产生新数据
    });

    // ---- /schedule function|repeat|random <func> → 函数引用 ----
    handlers.set('schedule', (uri, line, commands) => {
        if (commands.length < 3) { return; }
        const resName = MinecraftUtils.buildFunctionCall(uri) ?? '';

        if (commands[1] === 'clear') {
            if (commands.length >= 3) {
                store.addFunctionRef(resName, commands[2], line, uri);
            }
            return;
        }

        if (['function', 'repeat', 'random'].includes(commands[1])) {
            store.addFunctionRef(resName, commands[2], line, uri);
        }
    });

    // ---- /score set ... from score <sel2> <obj2> → 记分板引用（预留） ----
    handlers.set('score', (_uri, _line, commands) => {
        if (commands.length < 8) { return; }
        if (commands[1] === 'set' && commands[5] === 'from' && commands[6] === 'score') {
            // TODO: store.addScoreboardRef(commands[8])
        }
    });

    // ---- /var set ... from score|entity|block → 引用追踪（预留） ----
    handlers.set('var', (_uri, _line, commands) => {
        if (commands.length < 8) { return; }
        if (commands[1] === 'set' && commands[4] === 'from') {
            // TODO: 根据 commands[5] (score|entity|block|time) 追踪引用
        }
    });
}
