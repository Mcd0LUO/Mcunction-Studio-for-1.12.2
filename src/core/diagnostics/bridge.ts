/**
 * 把 DataLoader + CompletionEngine 组装成 ValidationContext。
 *
 * 这是**唯一**同时认识 vscode 数据层与诊断层的桥。
 * 规则侧只看到 ValidationContext 的接口，将来抽 headless core 时只需替换本文件。
 */
import * as vscode from 'vscode';
import { DataLoader } from '../DataLoader';
import { CompletionEngine } from '../../dsl/engine';
import { rootDir } from '../paths';
import { ValidationContext } from './types';
import { EngineValidator } from './rules/syntax';

/** IndexedStore 的最小只读子集（避免把整个类拖进诊断层类型） */
interface IndexedStoreLike {
    getScoreboardDefPoints(name: string): string[];
    getTeamDefPoints(name: string): string[];
    getScoreboardCriteria(name: string): string | undefined;
}

/** 判断资源名是否存在于函数/进度索引中 */
function hasResName(list: readonly string[], name: string): boolean {
    return list.indexOf(name) >= 0;
}

/**
 * 构造绑定当前 DataLoader 实例的 ValidationContext。
 *
 * @param loader 可注入，便于单测用 fake
 * @param engine 可注入；不传则取 CompletionEngine.getCurrent()
 */
export function createValidationContext(
    loader: DataLoader = DataLoader.getInstance(),
    engine?: EngineValidator,
): ValidationContext {
    const validator = engine ?? (CompletionEngine.getCurrent() as unknown as EngineValidator | undefined);

    return new ValidationContext({
        /**
         * 已注册的命令名列表。
         *
         * 空数组 = 命令表尚未装配（无工作区 / 引擎未就绪），
         * 此时全部语法规则跳过——否则每条命令都会被判成"未知命令"。
         */
        commandTable: () => {
            const e = CompletionEngine.getCurrent();
            return e ? e.commandNames() : [];
        },
        /**
         * 索引是否真的加载过。
         *
         * 判据不是「rootDir 非空」而是「索引里有东西」：
         * activate 中 dataloader.init() 是异步的，诊断可能在其完成前就跑了第一轮。
         * 若用 rootDir 判断，这段时间里所有"未定义引用"规则都会误报。
         */
        isIndexReady: () => loader.getFunctionResNames().length > 0,
        hasScoreboard: (name) => loader.getScoreboardsData().has(name),
        hasTeam: (name) => loader.getTeamsData().has(name),
        hasTag: (name) => loader.getTagsData().has(name),
        hasFunction: (res) => hasResName(loader.getFunctionResNames(), res),
        hasAdvancement: (res) => hasResName(loader.getAdvancementResNames(), res),
        definitionsOf: (kind, name) => {
            const store = (loader as unknown as { store: IndexedStoreLike }).store;
            return kind === 'scoreboard'
                ? store.getScoreboardDefPoints(name)
                : store.getTeamDefPoints(name);
        },
        getScoreboardCriteria: (name) => {
            const store = (loader as unknown as { store: IndexedStoreLike }).store;
            return store.getScoreboardCriteria(name);
        },
    });
}

/** 工作区是否存在（用于跳过无数据包场景） */
export function hasWorkspace(): boolean {
    return rootDir !== undefined;
}

/** 文档是否应参与诊断（mcfunction 文件） */
export function isDiagnosticTarget(doc: vscode.TextDocument): boolean {
    return doc.languageId === 'mcfunction';
}