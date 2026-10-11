/**
 * /spawnpoint [player] [x y z]
 *
 * wiki（Commands/spawnpoint，2018-05 修订）Java Edition 原文：
 *   spawnpoint
 *   spawnpoint <player>
 *   spawnpoint <player> <x> <y> <z>
 * 即 player 与坐标都可省略（全省略时设置执行者自己的出生点）。
 */
import { command, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestCoordinates } from '../suggests';

export const spawnpointCmd: RootNode = command('spawnpoint')
    .then(
        optional('[player]', suggestSelectors())
            .then(
                optional('[x]', suggestCoordinates())
                    .then(
                        optional('[y]', suggestCoordinates())
                            .then(optional('[z]', suggestCoordinates()))
                    )
            )
    );
