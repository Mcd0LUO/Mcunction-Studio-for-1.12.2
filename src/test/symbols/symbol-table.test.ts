/**
 * 符号抽取核验表 —— **命令 × 期望符号**。
 *
 * 期望值按 wiki（各 `Commands/<name>` 页 2018-05 修订）的 Java Edition 语法
 * **人工写出**，不是从实现反推的。跑出来对不上就是实现有问题。
 *
 * 为什么需要这张表：符号抽取是 References（Shift+F12）与 Rename（F2）的
 * **唯一数据源**。抽漏一个位置，表现就是"重命名改了一部分、漏了一处" ——
 * 数据包改完是坏的，而且没有任何报错。这类缺陷只能靠穷举发现：
 *
 *   · selectorPositions 的位置表曾整体错位，17 条命令里 15 条抽不到谓词
 *   · `stats … set <stat> <selector> <objective>` 的 objective 从未被抽
 *   · `entitydata {Tags:[…]}` 的标签定义从未被抽
 *   · `advancement test` 的进度名从未被抽
 *   · `execute …` 内层命令的符号从未被抽
 *
 * 新增/修改命令树时，先到这里补上 wiki 原文里的每一种形式。
 */
import * as assert from 'assert';
import { extractSymbols } from '../../core/symbols/extractor';

/** [行, 期望的 "kind:value:role" 集合（顺序无关）] */
const CASES: ReadonlyArray<readonly [string, readonly string[]]> = [
    // ============================================================
    // 资源引用（function / advancement / gamerule）
    // ============================================================
    ['function ns:foo', ['function:ns:foo:reference']],
    ['function ns:foo if @a', ['function:ns:foo:reference']],
    ['function ns:foo unless @a', ['function:ns:foo:reference']],
    ['gamerule gameLoopFunction ns:loop', ['function:ns:loop:reference']],
    ['gamerule doDaylightCycle', []],
    ['advancement grant @s only ns:a', ['advancement:ns:a:reference']],
    ['advancement grant @s until ns:a', ['advancement:ns:a:reference']],
    ['advancement grant @s from ns:a', ['advancement:ns:a:reference']],
    ['advancement grant @s through ns:a', ['advancement:ns:a:reference']],
    ['advancement grant @s everything', []],
    ['advancement revoke @s only ns:a', ['advancement:ns:a:reference']],
    ['advancement test @s ns:a', ['advancement:ns:a:reference']],
    ['advancement test @s ns:a crit', ['advancement:ns:a:reference']],

    // ============================================================
    // 记分板 / 队伍 / 标签：定义
    // ============================================================
    ['scoreboard objectives add kills dummy', ['scoreboard:kills:definition']],
    ['scoreboard objectives add kills dummy 击杀数', ['scoreboard:kills:definition']],
    ['scoreboard objectives remove kills', ['scoreboard:kills:definition']],
    ['scoreboard objectives setdisplay sidebar kills', ['scoreboard:kills:reference']],
    ['scoreboard objectives setdisplay sidebar', []],
    ['scoreboard objectives list', []],
    ['scoreboard teams add red', ['team:red:definition']],
    ['scoreboard teams add red 红队', ['team:red:definition']],
    ['scoreboard teams remove red', ['team:red:reference']],
    ['scoreboard teams empty red', ['team:red:reference']],
    ['scoreboard teams join red @a', ['team:red:reference']],
    ['scoreboard teams leave @a', []],
    ['scoreboard teams list', []],
    ['scoreboard teams option red color dark_red', ['team:red:reference']],
    ['scoreboard players tag @s add mytag', ['tag:mytag:definition']],
    // remove 记为 reference：它引用一个已存在的标签，不是定义
    ['scoreboard players tag @s remove mytag', ['tag:mytag:reference']],
    ['scoreboard players tag @s list', []],

    // ============================================================
    // 记分板：引用
    // ============================================================
    ['scoreboard players set @s kills 1', ['scoreboard:kills:reference']],
    ['scoreboard players add @s kills 1', ['scoreboard:kills:reference']],
    ['scoreboard players remove @s kills 1', ['scoreboard:kills:reference']],
    ['scoreboard players reset @s kills', ['scoreboard:kills:reference']],
    ['scoreboard players reset @s', []],
    ['scoreboard players enable @s trig', ['scoreboard:trig:reference']],
    ['scoreboard players test @s kills 1 10', ['scoreboard:kills:reference']],
    ['scoreboard players list', []],
    ['scoreboard players operation @s a += @s b', ['scoreboard:a:reference', 'scoreboard:b:reference']],
    // 假玩家一律 reference（抽取是逐行的，无法判断哪次是首次出现）
    ['scoreboard players set #fp kills 1', ['fake_player:fp:reference', 'scoreboard:kills:reference']],
    ['scoreboard players operation #fp a += @s b',
        ['fake_player:fp:reference', 'scoreboard:a:reference', 'scoreboard:b:reference']],
    ['trigger obj add 1', ['scoreboard:obj:reference']],

    // ============================================================
    // 选择器谓词 —— 目标在下标 1 的命令
    // ============================================================
    ['clear @a[tag=x]', ['tag:x:reference']],
    ['effect @a[tag=x] speed', ['tag:x:reference']],
    ['enchant @a[tag=x] minecraft:sharpness', ['tag:x:reference']],
    ['entitydata @a[tag=x] {}', ['tag:x:reference']],
    ['execute @a[tag=x] ~ ~ ~ say hi', ['tag:x:reference']],
    ['give @a[tag=x] minecraft:stone', ['tag:x:reference']],
    ['kill @a[tag=x]', ['tag:x:reference']],
    ['spawnpoint @a[tag=x]', ['tag:x:reference']],
    ['stopsound @a[tag=x]', ['tag:x:reference']],
    ['tellraw @a[tag=x] {"text":"hi"}', ['tag:x:reference']],
    ['testfor @a[tag=x]', ['tag:x:reference']],
    ['title @a[tag=x] clear', ['tag:x:reference']],

    // ---- 目标在下标 2 ----
    ['advancement grant @a[tag=x] only ns:a', ['advancement:ns:a:reference', 'tag:x:reference']],
    ['gamemode creative @a[tag=x]', ['tag:x:reference']],
    ['xp 30 @a[tag=x]', ['tag:x:reference']],

    // ---- 位置随可选参数漂移 ----
    ['tp @a[tag=x] 1 2 3', ['tag:x:reference']],
    ['tp @a[tag=x]', ['tag:x:reference']],
    ['teleport @a[tag=x] 1 2 3', ['tag:x:reference']],
    ['playsound minecraft:x master @a[tag=x]', ['tag:x:reference']],
    ['spreadplayers 0 0 1 10 false @a[tag=x]', ['tag:x:reference']],
    ['replaceitem entity @a[tag=x] slot.weapon.mainhand minecraft:stone', ['tag:x:reference']],
    ['particle flame 1 2 3 0 0 0 1 5 @a[tag=x]', ['tag:x:reference']],
    ['particle flame 1 2 3 0 0 0 1 5 normal @a[tag=x]', ['tag:x:reference']],

    // ---- 子命令形态 ----
    ['scoreboard players set @a[tag=x] obj 1', ['scoreboard:obj:reference', 'tag:x:reference']],
    ['scoreboard players operation @a[tag=x] obj += @s obj2',
        ['scoreboard:obj:reference', 'scoreboard:obj2:reference', 'tag:x:reference']],
    ['scoreboard players tag @a[tag=x] add t', ['tag:t:definition', 'tag:x:reference']],
    ['scoreboard teams join red @a[tag=x]', ['tag:x:reference', 'team:red:reference']],
    ['scoreboard teams leave @a[tag=x]', ['tag:x:reference']],

    // ============================================================
    // stats —— set 形式的 objective 是记分板引用
    // ============================================================
    ['stats entity @a[tag=x] set AffectedBlocks @s obj', ['scoreboard:obj:reference', 'tag:x:reference']],
    ['stats block 1 2 3 set AffectedBlocks @a[tag=x] obj', ['scoreboard:obj:reference', 'tag:x:reference']],
    ['stats entity @s clear AffectedBlocks', []],
    ['stats block 1 2 3 clear AffectedBlocks', []],

    // ============================================================
    // 选择器谓词的三种 kind
    // ============================================================
    ['kill @a[score_obj=1]', ['scoreboard:obj:reference']],
    ['kill @a[team=red]', ['team:red:reference']],
    ['kill @a[score_a_min=1,score_b=2]',
        ['scoreboard:a:reference', 'scoreboard:b:reference']],

    // ============================================================
    // execute 内层命令
    // ============================================================
    ['execute @s ~ ~ ~ function ns:foo', ['function:ns:foo:reference']],
    ['execute @s ~ ~ ~ scoreboard players set @s obj 1', ['scoreboard:obj:reference']],
    ['execute @s ~ ~ ~ detect ~ ~ ~ stone 0 function ns:foo', ['function:ns:foo:reference']],
    ['execute @s ~ ~ ~ execute @s ~ ~ ~ function ns:deep', ['function:ns:deep:reference']],
    ['execute @s ~ ~ ~', []],
    ['execute @s ~ ~ ~ detect ~ ~ ~ stone 0', []],

    // ============================================================
    // NBT 里的 Tags:[...] —— 标签定义
    // ============================================================
    ['summon minecraft:creeper 1 2 3 {Tags:["boss"]}', ['tag:boss:definition']],
    ['summon minecraft:creeper 1 2 3 {Tags:["boss","elite"]}',
        ['tag:boss:definition', 'tag:elite:definition']],
    ['summon minecraft:creeper', []],
    ['entitydata @s {Tags:["boss"]}', ['tag:boss:definition']],
    ['entitydata @s {Tags:["boss","elite"]}',
        ['tag:boss:definition', 'tag:elite:definition']],
    ['entitydata @s {Health:10}', []],

    // ============================================================
    // 角色隔离：这些行**不该**产出任何符号
    // ============================================================
    ['say @a[tag=x]', []],
    ['say function ns:foo', []],
    ['say hello world', []],
    ['tellraw @a {"text":"ns:foo"}', []],
    ['# scoreboard objectives add foo dummy', []],
    ['scoreboard objectives add foo dummy 击杀数 kills', ['scoreboard:foo:definition']],
];

describe('symbols/符号抽取核验表', () => {
    for (const [line, want] of CASES) {
        it(JSON.stringify(line), () => {
            const got = extractSymbols(line)
                .map(o => `${o.kind}:${o.value}:${o.role}`)
                .sort();
            assert.deepStrictEqual(
                got, [...want].sort(),
                `符号不符：\n  行: ${line}`,
            );
        });
    }

    it('核验表规模（防误删）', () => {
        assert.ok(CASES.length >= 80, `核验表只剩 ${CASES.length} 条，是不是被误删了`);
    });
});
