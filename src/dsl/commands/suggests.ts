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
    return (ctx: SuggestContext): vscode.CompletionItem[] => {
        const token = ctx.commands[ctx.commands.length - 1] || '';
        /**
         * 光标在该 token 内的偏移。
         *
         * `selectors()` 需要它来区分「光标还在方括号里」和「方括号已闭合」——
         * 两者的 token 都以 ']' 结尾，只看字符串无法分辨。
         * 用行内最后一次出现的位置往右找：同一个选择器一般只写一次。
         */
        let cursorInToken: number | undefined;
        const at = ctx.lineText.lastIndexOf(token);
        const cursorCol = ctx.cursorCharacter;
        if (token && at >= 0 && cursorCol !== undefined) {
            if (cursorCol >= at && cursorCol <= at + token.length) {
                cursorInToken = cursorCol - at;
            }
        }
        return ctx.cc.selectors(token, cursorInToken);
    };
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

/**
 * `scoreboard teams option <team> <option> <value>` 的六个选项。
 *
 * 已核对 wiki（Scoreboard#Command reference，2018-05-26 修订）原文，
 * 1.12.2 只有这六个：color / friendlyfire / seeFriendlyInvisibles /
 * nametagVisibility / deathMessageVisibility / collisionRule。
 *
 * ⚠️ 注意是 **friendlyfire**（全小写）。早先写成 `friendlyFire` 是错的，
 *    游戏不认这个选项名。
 * ⚠️ 1.12.2 **没有** prefix/suffix 的 option 子命令 ——
 *    它们只存在于 scoreboard.dat 的 NBT 里。
 */
export function suggestTeamOptions() {
    const options = [
        { label: 'color', desc: '队伍颜色' },
        { label: 'friendlyfire', desc: '友军伤害（true|false）' },
        { label: 'seeFriendlyInvisibles', desc: '友方隐身可见（true|false）' },
        { label: 'nametagVisibility', desc: '名称标签可见性' },
        { label: 'deathMessageVisibility', desc: '死亡消息可见性' },
        { label: 'collisionRule', desc: '碰撞规则' },
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        options.map(o => ctx.item(o.label, o.desc, o.label, false, vscode.CompletionItemKind.Enum));
}

/** 队伍颜色（16 个，wiki 原文列举） */
export function suggestTeamColors() {
    const colors = [
        'black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple',
        'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red',
        'light_purple', 'yellow', 'white',
    ];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        colors.map(c => ctx.item(c, '', c, false, vscode.CompletionItemKind.Color));
}

/** true | false */
export function suggestBoolean() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => [
        ctx.item('true', '', 'true', false, vscode.CompletionItemKind.Keyword),
        ctx.item('false', '', 'false', false, vscode.CompletionItemKind.Keyword),
    ];
}

/** nametagVisibility / deathMessageVisibility 的取值 */
export function suggestVisibility() {
    const values = ['never', 'hideForOtherTeams', 'hideForOwnTeam', 'always'];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        values.map(v => ctx.item(v, '', v, false, vscode.CompletionItemKind.Enum));
}

/** collisionRule 的取值 */
export function suggestCollisionRule() {
    const values = ['always', 'never', 'pushOwnTeam', 'pushOtherTeams'];
    return (ctx: SuggestContext): vscode.CompletionItem[] =>
        values.map(v => ctx.item(v, '', v, false, vscode.CompletionItemKind.Enum));
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

/** 音效名（549 条）—— 委托 CompletionContext 的懒加载缓存，避免每次按键重建 */
export function suggestSoundNames() {
    return (ctx: SuggestContext): vscode.CompletionItem[] => ctx.cc.soundNames();
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
