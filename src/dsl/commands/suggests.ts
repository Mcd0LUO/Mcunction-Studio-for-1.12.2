/**
 * 共享 Suggest 工厂 — 桥接 CompletionContext 的现有方法。
 * 多个命令定义文件共用，避免重复。
 */
import * as vscode from 'vscode';
import { SuggestContext } from '../nodes';
import { ParticleNames, SoundNames } from '../../utils/EnumLib';

// ----------------------------------------------------------------
// 通用
// ----------------------------------------------------------------

export function suggestSelectors() {
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        ctx.cc.selectors(ctx.commands[ctx.commands.length - 1] || '');
}

// ----------------------------------------------------------------
// 数据驱动（来自 DataLoader）
// ----------------------------------------------------------------

export function suggestScoreboards() {
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        ctx.cc.scoreboards();
}

export function suggestTeams() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.teams();
}

export function suggestTags() {
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        ctx.cc.tags();
}

export function suggestFunctions() {
    return (ctx: SuggestContext) => ctx.cc.functions();
}

export function suggestTeamOptions() {
    const options = [
        { label: 'color', desc: '队伍颜色' },
        { label: 'friendlyFire', desc: '友军伤害' },
        { label: 'nametagVisibility', desc: '名称标签可见性' },
        { label: 'deathMessageVisibility', desc: '死亡消息可见性' },
        { label: 'collisionRule', desc: '碰撞规则' },
        { label: 'seeFriendlyInvisibles', desc: '友方隐身可见' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        options.map(o => ctx.item(o.label, o.desc, o.label, false, vscode.CompletionItemKind.Enum));
}

export function suggestOperations() {
    const ops = [
        { label: '+=', desc: '加' },
        { label: '-=', desc: '减' },
        { label: '*=', desc: '乘' },
        { label: '/=', desc: '除' },
        { label: '%=', desc: '取余' },
        { label: '>', desc: '使左值大于右值' },
        { label: '<', desc: '使左值小于右值' },
        { label: '><', desc: '交换两侧值' },
        { label: '=', desc: '赋值' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        ops.map(op => ctx.item(op.label, op.desc, op.label, false, vscode.CompletionItemKind.Operator));
}

// ----------------------------------------------------------------
// 静态枚举
// ----------------------------------------------------------------

export function suggestEffects() {
    const effects = [
        'absorption', 'blindness', 'fire_resistance', 'glowing', 'haste',
        'health_boost', 'hunger', 'instant_damage', 'instant_health', 'invisibility',
        'jump_boost', 'levitation', 'luck', 'mining_fatigue', 'nausea',
        'night_vision', 'poison', 'regeneration', 'resistance', 'saturation',
        'slowness', 'speed', 'strength', 'unluck', 'water_breathing',
        'weakness', 'wither',
    ];
    return (_ctx: SuggestContext): vscode.CompletionItem[] =>
        effects.map(e => _ctx.item(e, '', e, true, vscode.CompletionItemKind.Class));
}

export function suggestCriteria() {
    const criteria = [
        'dummy', 'trigger', 'deathCount', 'playerKillCount', 'totalKillCount',
        'health', 'food', 'air', 'armor', 'level', 'xp',
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        criteria.map(c => ctx.item(c, '', c, false, vscode.CompletionItemKind.Enum));
}

// ----------------------------------------------------------------
// 第1批迁移新增
// ----------------------------------------------------------------

export function suggestDifficulties() {
    const list = [
        { label: 'peaceful', desc: '和平' },
        { label: 'easy', desc: '简单' },
        { label: 'normal', desc: '普通' },
        { label: 'hard', desc: '困难' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        list.map(d => ctx.item(d.label, d.desc, d.label, false, vscode.CompletionItemKind.Enum));
}

export function suggestGameModes() {
    const list = [
        { label: 'survival', desc: '生存', alias: '0' },
        { label: 'creative', desc: '创造', alias: '1' },
        { label: 'adventure', desc: '冒险', alias: '2' },
        { label: 'spectator', desc: '旁观', alias: '3' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] => {
        const items = list.map(m => ctx.item(m.label, m.desc, m.label, false, vscode.CompletionItemKind.Enum));
        items.push(...list.map(m => ctx.item(m.alias, m.desc, m.alias, false, vscode.CompletionItemKind.Enum)));
        return items;
    };
}

export function suggestWeatherTypes() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => [
        ctx.item('clear', '晴天', 'clear', true, vscode.CompletionItemKind.Keyword),
        ctx.item('rain', '雨天', 'rain', true, vscode.CompletionItemKind.Keyword),
        ctx.item('thunder', '雷雨天', 'thunder', true, vscode.CompletionItemKind.Keyword),
    ];
}

/** tp/teleport 的目标参数：选择器 + 坐标占位 */
export function suggestSelectorsOrCoords() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => {
        const items = ctx.cc.selectors(ctx.commands[ctx.commands.length - 1] || '');
        items.push(ctx.item('<x> <y> <z>', '绝对坐标', '${1:x} ${2:y} ${3:z}', false, vscode.CompletionItemKind.Value));
        items.push(ctx.item('~<x> ~<y> ~<z>', '相对坐标', '~${1:x} ~${2:y} ~${3:z}', false, vscode.CompletionItemKind.Value));
        return items;
    };
}

export function suggestCoordinates() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.coordinates();
}

export function suggestItems() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.items();
}

export function suggestBlocks() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.blocks();
}

export function suggestEntityTypes() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.entityTypes();
}

export function suggestAdvancements() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.advancements();
}

export function suggestParticleNames() {
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        ParticleNames.all.map(p => ctx.item(p.name, p.desc, p.name, false, vscode.CompletionItemKind.Class));
}

export function suggestSoundNames() {
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        SoundNames.all.map(s => ctx.item(s.name, s.desc, s.name, false, vscode.CompletionItemKind.Reference));
}

export function suggestGameRules() {
    const rules = [
        { name: 'announceAdvancements', type: 'boolean' },
        { name: 'commandBlockOutput', type: 'boolean' },
        { name: 'disableElytraMovementCheck', type: 'boolean' },
        { name: 'doDaylightCycle', type: 'boolean' },
        { name: 'doEntityDrops', type: 'boolean' },
        { name: 'doFireTick', type: 'boolean' },
        { name: 'doMobLoot', type: 'boolean' },
        { name: 'doMobSpawning', type: 'boolean' },
        { name: 'doTileDrops', type: 'boolean' },
        { name: 'doWeatherCycle', type: 'boolean' },
        { name: 'gameLoopFunction', type: 'function' },
        { name: 'keepInventory', type: 'boolean' },
        { name: 'logAdminCommands', type: 'boolean' },
        { name: 'maxCommandChainLength', type: 'integer' },
        { name: 'maxEntityCramming', type: 'integer' },
        { name: 'mobGriefing', type: 'boolean' },
        { name: 'naturalRegeneration', type: 'boolean' },
        { name: 'randomTickSpeed', type: 'integer' },
        { name: 'reducedDebugInfo', type: 'boolean' },
        { name: 'sendCommandFeedback', type: 'boolean' },
        { name: 'showDeathMessages', type: 'boolean' },
        { name: 'spawnRadius', type: 'integer' },
        { name: 'spectatorsGenerateChunks', type: 'boolean' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        rules.map(r => ctx.item(r.name, r.type, r.name, false, vscode.CompletionItemKind.Enum));
}
