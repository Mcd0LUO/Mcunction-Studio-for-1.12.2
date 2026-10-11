/**
 * /gamemode <mode> [player]
 *
 * wiki（Commands/gamemode，2018-05 修订）Java Edition 原文：
 *   gamemode <mode> [player]
 * player 可选 —— 省略时作用于命令执行者。
 */
import { command, argument, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestGameModes, suggestSelectors } from '../suggests';

export const gamemodeCmd: RootNode = command('gamemode')
    .then(
        argument('<mode>', suggestGameModes())
            .then(optional('[player]', suggestSelectors()))
    );
