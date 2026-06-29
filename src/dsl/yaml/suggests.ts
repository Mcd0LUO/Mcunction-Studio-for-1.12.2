/**
 * Suggest 注册表 — 名字 → SuggestionProvider
 * 支持内置函数引用 + YAML 内联静态列表动态创建
 */
import * as vscode from 'vscode';
import { SuggestionProvider, SuggestContext } from '../nodes';
import { YamlSuggestItem } from './types';

/** 内置 suggest 名称映射表 */
const builtins: Record<string, (items?: YamlSuggestItem[]) => SuggestionProvider> = {
    selectors: () => (ctx: SuggestContext) =>
        ctx.cc.selectors(ctx.commands[ctx.commands.length - 1] || ''),

    scoreboards: () => (ctx: SuggestContext) =>
        ctx.cc.scoreboards(),

    teams: () => (ctx: SuggestContext) =>
        ctx.cc.teams(),

    tags: () => (ctx: SuggestContext) =>
        ctx.cc.tags(),

    functions: () => (ctx: SuggestContext) =>
        ctx.cc.functions(),

    coordinates: () => (ctx: SuggestContext) =>
        ctx.cc.coordinates(),

    items: () => (ctx: SuggestContext) =>
        ctx.cc.items(),

    blocks: () => (ctx: SuggestContext) =>
        ctx.cc.blocks(),

    entityTypes: () => (ctx: SuggestContext) =>
        ctx.cc.entityTypes(),

    advancements: () => (ctx: SuggestContext) =>
        ctx.cc.advancements(),

    particleNames: () => {
        const { ParticleNames }: { ParticleNames: { all: { name: string; desc: string }[] } } =
            require('../../utils/EnumLib');
        return (ctx: SuggestContext): vscode.CompletionItem[] =>
            ParticleNames.all.map(p => ctx.item(p.name, p.desc, p.name, false, vscode.CompletionItemKind.Class));
    },

    soundNames: () => {
        const { SoundNames }: { SoundNames: { all: { name: string; desc: string }[] } } =
            require('../../utils/EnumLib');
        return (ctx: SuggestContext): vscode.CompletionItem[] =>
            SoundNames.all.map(s => ctx.item(s.name, s.desc, s.name, false, vscode.CompletionItemKind.Reference));
    },

    gameRules: () => {
        const rules = [
            'announceAdvancements', 'commandBlockOutput', 'disableElytraMovementCheck',
            'doDaylightCycle', 'doEntityDrops', 'doFireTick', 'doMobLoot', 'doMobSpawning',
            'doTileDrops', 'doWeatherCycle', 'gameLoopFunction', 'keepInventory',
            'logAdminCommands', 'maxCommandChainLength', 'maxEntityCramming', 'mobGriefing',
            'naturalRegeneration', 'randomTickSpeed', 'reducedDebugInfo', 'sendCommandFeedback',
            'showDeathMessages', 'spawnRadius', 'spectatorsGenerateChunks',
        ];
        return (ctx: SuggestContext): vscode.CompletionItem[] =>
            rules.map(r => ctx.item(r, '', r, false, vscode.CompletionItemKind.Enum));
    },

    effects: () => (_ctx: SuggestContext) => {
        const list = [
            'absorption', 'blindness', 'fire_resistance', 'glowing', 'haste',
            'health_boost', 'hunger', 'instant_damage', 'instant_health', 'invisibility',
            'jump_boost', 'levitation', 'luck', 'mining_fatigue', 'nausea',
            'night_vision', 'poison', 'regeneration', 'resistance', 'saturation',
            'slowness', 'speed', 'strength', 'unluck', 'water_breathing', 'weakness', 'wither',
        ];
        return list.map(e => _ctx.item(e, '', e, true, vscode.CompletionItemKind.Class));
    },

    weatherTypes: () => (ctx: SuggestContext) => [
        ctx.item('clear', '晴天', 'clear', true, vscode.CompletionItemKind.Keyword),
        ctx.item('rain', '雨天', 'rain', true, vscode.CompletionItemKind.Keyword),
        ctx.item('thunder', '雷雨天', 'thunder', true, vscode.CompletionItemKind.Keyword),
    ],

    gameModes: () => (ctx: SuggestContext) => {
        const modes = [
            { label: 'survival', desc: '生存', alias: '0' },
            { label: 'creative', desc: '创造', alias: '1' },
            { label: 'adventure', desc: '冒险', alias: '2' },
            { label: 'spectator', desc: '旁观', alias: '3' },
        ];
        const items = modes.map(m => ctx.item(m.label, m.desc, m.label, false, vscode.CompletionItemKind.Enum));
        items.push(...modes.map(m => ctx.item(m.alias, m.desc, m.alias, false, vscode.CompletionItemKind.Enum)));
        return items;
    },

    difficulties: () => (ctx: SuggestContext) =>
        ['peaceful', 'easy', 'normal', 'hard'].map(d =>
            ctx.item(d, '', d, false, vscode.CompletionItemKind.Enum)
        ),

    criteria: () => (ctx: SuggestContext) =>
        ['dummy', 'trigger', 'deathCount', 'playerKillCount', 'totalKillCount',
         'health', 'food', 'air', 'armor', 'level', 'xp'].map(c =>
            ctx.item(c, '', c, false, vscode.CompletionItemKind.Enum)
        ),

    operations: () => (ctx: SuggestContext) =>
        ['+=', '-=', '*=', '/=', '%=', '>', '<', '><', '='].map(op =>
            ctx.item(op, '', op, false, vscode.CompletionItemKind.Operator)
        ),

    teamOptions: () => (ctx: SuggestContext) =>
        ['color', 'friendlyFire', 'nametagVisibility', 'deathMessageVisibility',
         'collisionRule', 'seeFriendlyInvisibles'].map(o =>
            ctx.item(o, '', o, false, vscode.CompletionItemKind.Enum)
        ),

    selectorsOrCoords: () => (ctx: SuggestContext) => {
        const items = ctx.cc.selectors(ctx.commands[ctx.commands.length - 1] || '');
        items.push(ctx.item('<x> <y> <z>', '绝对坐标', '${1:x} ${2:y} ${3:z}', false, vscode.CompletionItemKind.Value));
        items.push(ctx.item('~<x> ~<y> ~<z>', '相对坐标', '~${1:x} ~${2:y} ~${3:z}', false, vscode.CompletionItemKind.Value));
        return items;
    },

    /** 无补全，仅占位提示 */
    placeholder: () => (): vscode.CompletionItem[] => [],

    /** 空补全 */
    none: () => (): vscode.CompletionItem[] => [],
};

/**
 * 解析 suggest 字段：可以是内置名称字符串 或 自定义静态列表。
 *
 * YAML 语法：
 *   suggest: selectors          ← 引用内置
 *   suggest:                   ← 自定义静态列表
 *     - name: lobby
 *       description: 大厅
 *     - name: arena
 *       description: 竞技场
 */
export function resolveSuggest(nameOrList?: string | YamlSuggestItem[]): SuggestionProvider | null {
    if (!nameOrList) { return null; }

    // 字符串 → 查内置表 → 查自定义提取数据 → null
    if (typeof nameOrList === 'string') {
        const factory = builtins[nameOrList];
        if (factory) { return factory(); }

        // 尝试从 YAML extractor 的自定义数据中查找
        try {
            const { getCustomData } = require('./extractor') as typeof import('./extractor');
            const values = getCustomData(nameOrList);
            if (values.length > 0) {
                const list = values;
                return (ctx: SuggestContext): vscode.CompletionItem[] =>
                    list.map(v => ctx.item(v, '', v, false, vscode.CompletionItemKind.Field));
            }
        } catch { /* extractor 未加载 */ }

        console.warn(`[YAML] 未知 suggest: "${nameOrList}"，已回退为 placeholder`);
        return null;
    }

    // 数组 → 动态创建静态列表 suggest
    if (Array.isArray(nameOrList)) {
        const list = nameOrList as YamlSuggestItem[];
        return (ctx: SuggestContext): vscode.CompletionItem[] =>
            list.map(item =>
                ctx.item(item.name, item.description ?? '', item.name, false, vscode.CompletionItemKind.Enum)
            );
    }

    return null;
}

/** 检查是否有这个名字的内置 suggest */
export function hasSuggest(name: string): boolean {
    return name in builtins;
}
