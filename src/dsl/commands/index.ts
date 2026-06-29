import { CompletionEngine } from '../engine';
import { RootNode } from '../nodes';

// 根目录已有的 3 条
import { effectCmd } from './vanilla/effect';
import { functionCmd } from './vanilla/function';
import { scoreboardCmd } from './vanilla/scoreboard';

// vanilla
import { killCmd } from './vanilla/kill';
import { testforCmd } from './vanilla/testfor';
import { difficultyCmd } from './vanilla/difficulty';
import { tpCmd } from './vanilla/tp';
import { teleportCmd } from './vanilla/teleport';
import { spawnpointCmd } from './vanilla/spawnpoint';
import { gamemodeCmd } from './vanilla/gamemode';
import { weatherCmd } from './vanilla/weather';
import { clearCmd } from './vanilla/clear';
import { giveCmd } from './vanilla/give';
import { enchantCmd } from './vanilla/enchant';
import { xpCmd } from './vanilla/xp';
import { triggerCmd } from './vanilla/trigger';
import { titleCmd } from './vanilla/title';
import { timeCmd } from './vanilla/time';
import { executeCmd } from './vanilla/execute';
import { sayCmd } from './vanilla/say';
import { defaultgamemodeCmd } from './vanilla/defaultgamemode';
import { setworldspawnCmd } from './vanilla/setworldspawn';
import { toggledownfallCmd } from './vanilla/toggledownfall';
import { fillCmd } from './vanilla/fill';
import { cloneCmd } from './vanilla/clone';
import { setblockCmd } from './vanilla/setblock';
import { testforblockCmd } from './vanilla/testforblock';
import { testforblocksCmd } from './vanilla/testforblocks';
import { detectCmd } from './vanilla/detect';
import { blockdataCmd } from './vanilla/blockdata';
import { spreadplayersCmd } from './vanilla/spreadplayers';
import { stopsoundCmd } from './vanilla/stopsound';
import { playsoundCmd } from './vanilla/playsound';
import { particleCmd } from './vanilla/particle';
import { summonCmd } from './vanilla/summon';
import { tellrawCmd } from './vanilla/tellraw';
import { entitydataCmd } from './vanilla/entitydata';
import { replaceitemCmd } from './vanilla/replaceitem';
import { statsCmd } from './vanilla/stats';
import { gameruleCmd } from './vanilla/gamerule';
import { advancementCmd } from './vanilla/advancement';
import { worldborderCmd } from './vanilla/worldborder';

// EasyCber 已迁移为 YAML（src/dsl/builtin/*.yml），不再硬编码

const ALL: RootNode[] = [
    effectCmd, functionCmd, scoreboardCmd,
    killCmd, testforCmd, difficultyCmd, tpCmd, teleportCmd, spawnpointCmd,
    gamemodeCmd, weatherCmd, clearCmd, giveCmd, enchantCmd, xpCmd,
    triggerCmd, titleCmd, timeCmd, executeCmd, sayCmd,
    defaultgamemodeCmd, setworldspawnCmd, toggledownfallCmd,
    fillCmd, cloneCmd, setblockCmd, testforblockCmd, testforblocksCmd,
    detectCmd, blockdataCmd, spreadplayersCmd,
    stopsoundCmd, playsoundCmd, particleCmd, summonCmd, tellrawCmd, entitydataCmd,
    replaceitemCmd, statsCmd, gameruleCmd, advancementCmd, worldborderCmd,
];

export { ALL as commands };

/** 注册所有 DSL 命令到引擎 */
export function registerAll(engine: CompletionEngine): void {
    for (const cmd of ALL) { engine.register(cmd); }
    console.log(`[DSL] 已注册 ${ALL.length} 条命令: ${ALL.map(c => c.commandName).join(', ')}`);
}
