/**
 * 1.12.2 命令语法核验表 —— **逐命令对照 wiki 原文**。
 *
 * 数据来源：minecraft.wiki 各 `Commands/<name>` 页在
 * 2018-06-01 之前的最后一个修订（1.12.2 发布于 2017-09-18，
 * 1.13 发布于 2018-07-18，故该时点正文即 1.12.2 语法）。
 *
 * 本表只断言一件事：**下列合法写法一条诊断都不能产生**。
 * 它是"防误报"的底线 —— 诊断层曾经把每一条 execute 都标红两条，
 * 也曾经把 `scoreboard players set @s obj 1 {a:1}` 判成多余参数。
 *
 * 新增/修改命令树时，先到这里补上 wiki 原文里的每一种形式。
 * 若某条写不进去，说明引擎结构不支持 —— 那才是要解决的问题。
 *
 * 注意 wiki 自身的坑（已踩过）：
 *   · `Commands/scoreboard` 只有一行转述，真表格在 `Scoreboard#Command reference`
 *   · `Commands/detect` 是 Education Edition 的 Agent 命令，**不是** Java 的 /detect
 *   · `summon` 语法行把 dataTag 写成尖括号，但 Arguments 段明确标着 "(optional)"
 *   · `fill` 的 oldBlockHandling **包含** `outline`（不是 1.13 新增）
 */
import * as assert from 'assert';
import { DiagnosticRunner, ALL_RULES } from '../../core/diagnostics/runner';
import { ValidationContext } from '../../core/diagnostics/types';
import { CompletionEngine } from '../../dsl/engine';
import { DataLoader } from '../../core/DataLoader';
import { registerAll } from '../../dsl/commands/index';

const engine = new CompletionEngine(DataLoader.getInstance());
registerAll(engine);

const ctx = new ValidationContext({
    commandTable: () => engine.commandNames(),
    hasScoreboard: () => true,
    hasTeam: () => true,
    hasTag: () => true,
    hasFunction: () => true,
    hasAdvancement: () => true,
    definitionsOf: () => [],
    isIndexReady: () => true,
});

const runner = new DiagnosticRunner({ rules: ALL_RULES, ctx, engine, levels: {} });

/** 命令名 → wiki 原文里列出的合法写法 */
const WIKI: Record<string, string[]> = {
    // ---------- 选择器 / 记分板 ----------
    advancement: [
        'advancement grant @s only minecraft:story/root',
        'advancement grant @s only minecraft:story/root criterion_name',
        'advancement grant @s until minecraft:story/root',
        'advancement grant @s from minecraft:story/root',
        'advancement grant @s through minecraft:story/root',
        'advancement grant @s everything',
        'advancement revoke @s only minecraft:story/root',
        'advancement test @s minecraft:story/root',
        'advancement test @s minecraft:story/root criterion_name',
    ],
    blockdata: ['blockdata 1 2 3 {a:1}'],
    clear: [
        'clear',
        'clear @s',
        'clear @s minecraft:stone',
        'clear @s minecraft:stone 0',
        'clear @s minecraft:stone 0 64',
        'clear @s minecraft:stone 0 64 {a:1}',
    ],
    clone: [
        'clone 1 1 1 2 2 2 3 3 3',
        'clone 1 1 1 2 2 2 3 3 3 masked',
        'clone 1 1 1 2 2 2 3 3 3 masked force',
        'clone 1 1 1 2 2 2 3 3 3 masked force minecraft:stone',
        'clone 1 1 1 2 2 2 3 3 3 masked force minecraft:stone 0',
        'clone 1 1 1 2 2 2 3 3 3 filtered normal minecraft:stone 0',
        'clone 1 1 1 2 2 2 3 3 3 replace move',
    ],
    defaultgamemode: ['defaultgamemode creative'],
    difficulty: ['difficulty peaceful'],
    effect: ['effect @s speed', 'effect @s speed 30 1 true', 'effect @s clear'],
    enchant: ['enchant @s minecraft:sharpness', 'enchant @s minecraft:sharpness 5'],
    entitydata: ['entitydata @s {a:1}'],
    execute: [
        'execute @s ~ ~ ~ say hi',
        'execute @s ~ ~ ~ say hello world',
        'execute @s ~ ~ ~ detect ~ ~ ~ stone 0 say hi',
        'execute @s ~ ~ ~ detect ~ ~ -1 minecraft:stone 0 setblock ~ ~ ~ air',
        'execute @s ~ ~ ~ scoreboard players set @s obj 1',
    ],
    fill: [
        'fill 1 1 1 2 2 2 minecraft:stone',
        'fill 1 1 1 2 2 2 minecraft:stone 0',
        'fill 1 1 1 2 2 2 minecraft:stone 0 destroy',
        'fill 1 1 1 2 2 2 minecraft:stone 0 hollow',
        'fill 1 1 1 2 2 2 minecraft:stone 0 keep',
        'fill 1 1 1 2 2 2 minecraft:stone 0 outline',
        'fill 1 1 1 2 2 2 minecraft:stone 0 keep {a:1}',
        'fill 1 1 1 2 2 2 minecraft:stone 0 {a:1}',
        'fill 1 1 1 2 2 2 minecraft:stone 0 replace',
        'fill 1 1 1 2 2 2 minecraft:stone 0 replace minecraft:dirt',
        'fill 1 1 1 2 2 2 minecraft:stone 0 replace minecraft:dirt 0',
    ],
    function: ['function ns:foo', 'function ns:foo if @a', 'function ns:foo unless @a'],
    gamemode: ['gamemode creative', 'gamemode creative @s', 'gamemode survival @a'],
    gamerule: ['gamerule doDaylightCycle', 'gamerule doDaylightCycle false'],
    give: [
        'give @s minecraft:stone',
        'give @s minecraft:stone 64',
        'give @s minecraft:stone 64 0',
        'give @s minecraft:stone 64 0 {a:1}',
    ],
    kill: ['kill', 'kill @a'],
    particle: [
        'particle flame 1 2 3 0 0 0 1',
        'particle flame 1 2 3 0 0 0 1 5',
        'particle flame 1 2 3 0 0 0 1 5 normal',
        'particle flame 1 2 3 0 0 0 1 5 force @a',
        'particle flame 1 2 3 0 0 0 1 5 normal @a',
        'particle iconcrack 1 2 3 0 0 0 1 5 normal @a 1 2',
    ],
    playsound: [
        'playsound minecraft:block.note.harp master @a',
        'playsound minecraft:block.note.harp master @a 1 2 3',
        'playsound minecraft:block.note.harp master @a 1 2 3 1 1 1',
    ],
    replaceitem: [
        'replaceitem entity @s slot.weapon.mainhand minecraft:stone',
        'replaceitem entity @s slot.weapon.mainhand minecraft:stone 1 0 {a:1}',
        'replaceitem block 1 2 3 slot.weapon.mainhand minecraft:stone 1 0 {a:1}',
    ],
    say: ['say hello world'],
    scoreboard: [
        'scoreboard objectives add foo dummy',
        'scoreboard objectives add foo dummy My Display Name',
        'scoreboard objectives setdisplay sidebar',
        'scoreboard objectives setdisplay sidebar obj',
        'scoreboard players list',
        'scoreboard players set @s obj 1',
        'scoreboard players set @s obj 1 {Health:10}',
        'scoreboard players set @s obj 1 {a: 1, b: 2}',
        'scoreboard players add @s obj 5 {a:1}',
        'scoreboard players remove @s obj 5 {a:1}',
        'scoreboard players reset @s',
        'scoreboard players reset @s obj',
        'scoreboard players enable @s mytrigger',
        'scoreboard players test @s obj 1 10',
        'scoreboard players test @s obj 1',
        'scoreboard players operation @s obj += @s obj2',
        'scoreboard players operation @s obj >< @s obj2',
        'scoreboard players tag @s add mytag',
        'scoreboard players tag @s add mytag {a:1}',
        'scoreboard players tag @s remove mytag {a:1}',
        'scoreboard players tag @s list',
        'scoreboard teams list',
        'scoreboard teams add red',
        'scoreboard teams add red The Red Team',
        'scoreboard teams remove red',
        'scoreboard teams empty red',
        'scoreboard teams join red',
        'scoreboard teams join red @a @p @r',
        'scoreboard teams leave',
        'scoreboard teams leave @a @p',
        'scoreboard teams option red color dark_red',
        'scoreboard teams option red friendlyfire false',
        'scoreboard teams option red seeFriendlyInvisibles true',
        'scoreboard teams option red nametagVisibility hideForOtherTeams',
        'scoreboard teams option red deathMessageVisibility never',
        'scoreboard teams option red collisionRule pushOwnTeam',
    ],
    setblock: [
        'setblock 1 2 3 minecraft:stone',
        'setblock 1 2 3 minecraft:stone 0',
        'setblock 1 2 3 minecraft:stone 0 destroy',
        'setblock 1 2 3 minecraft:stone 0 keep',
        'setblock 1 2 3 minecraft:stone 0 replace',
        'setblock 1 2 3 minecraft:stone 0 destroy {a:1}',
        'setblock 1 2 3 minecraft:stone 0 {a:1}',
        'setblock 1 2 3 minecraft:stone {a:1}',
    ],
    setworldspawn: ['setworldspawn', 'setworldspawn 1 2 3'],
    spawnpoint: ['spawnpoint', 'spawnpoint @s', 'spawnpoint @s 1 2 3'],
    spreadplayers: ['spreadplayers 0 0 1 10 false @a'],
    stats: [
        'stats entity @s set AffectedBlocks @a obj',
        'stats entity @s clear AffectedBlocks',
        'stats block 1 2 3 set AffectedBlocks @a obj',
        'stats block 1 2 3 clear AffectedBlocks',
    ],
    stopsound: ['stopsound @a', 'stopsound @a master', 'stopsound @a master minecraft:block.note.harp'],
    summon: ['summon minecraft:creeper', 'summon minecraft:creeper 1 2 3 {a:1}'],
    teleport: [
        'teleport @s @p',
        'teleport @s 1 2 3',
        'teleport @s 1 2 3 90 0',
        'teleport @s @p facing @e',
        'teleport @s 1 2 3 facing 4 5 6',
    ],
    tellraw: ['tellraw @a {"text":"hi"}'],
    testfor: ['testfor @s', 'testfor @s {a:1}'],
    testforblock: [
        'testforblock 1 2 3 minecraft:stone',
        'testforblock 1 2 3 minecraft:stone 0',
        'testforblock 1 2 3 minecraft:stone 0 {a:1}',
    ],
    testforblocks: ['testforblocks 1 1 1 2 2 2 3 3 3', 'testforblocks 1 1 1 2 2 2 3 3 3 all'],
    time: ['time set day', 'time set 1000', 'time add 100', 'time query daytime', 'time query gametime'],
    title: [
        'title @s clear',
        'title @s reset',
        'title @s title {"text":"hi"}',
        'title @s subtitle {"text":"hi"}',
        'title @s actionbar {"text":"hi"}',
        'title @s times 10 70 20',
    ],
    toggledownfall: ['toggledownfall'],
    tp: ['tp @s @p', 'tp @s 1 2 3', 'tp @s 1 2 3 90 0'],
    trigger: ['trigger obj add 1', 'trigger obj set 1'],
    weather: ['weather clear', 'weather rain', 'weather rain 100', 'weather thunder 100'],
    worldborder: [
        'worldborder add 10 5',
        'worldborder set 10 5',
        'worldborder center 1 2',
        'worldborder damage amount 1',
        'worldborder damage buffer 5',
        'worldborder get',
        'worldborder warning distance 5',
        'worldborder warning time 15',
    ],
    xp: ['xp 30', 'xp 30 @s', 'xp 30L @s'],
};

describe('1.12.2 命令语法核验（逐命令对照 wiki 原文）', () => {
    for (const [cmd, lines] of Object.entries(WIKI)) {
        it(`${cmd}：${lines.length} 种合法写法零误报`, () => {
            for (const line of lines) {
                const d = runner.checkDocument([line]);
                assert.deepStrictEqual(
                    d.map(x => `${x.ruleId}: ${x.message}`), [],
                    `合法写法被误报：${line}`,
                );
            }
        });
    }

    it('核验表覆盖全部 41 条内置命令', () => {
        const covered = Object.keys(WIKI).sort();
        const registered = engine.commandNames().slice().sort();
        assert.deepStrictEqual(
            covered, registered,
            `核验表与注册命令不一致：\n  表中有而引擎无：${covered.filter(c => !registered.includes(c))}\n`
            + `  引擎有而表中无：${registered.filter(c => !covered.includes(c))}`,
        );
    });
});
