/**
 * 1.12.2:
 *   /clone <x1> <y1> <z1> <x2> <y2> <z2> <x> <y> <z> [maskMode] [cloneMode] [TileName] [dataValue]
 *
 * maskMode = filtered | masked | replace（默认 replace）
 * cloneMode = force | move | normal（默认 normal）
 * TileName  = 方块 id，filtered 模式下必填
 * dataValue = 0–15
 *
 * 注意顺序：1.12.2 中 <block> 位于 cloneMode **之后**。
 * 1.13 (17w45a) 才把 filtered 的 <block> 挪到 mode 之前 —— 不要照抄新版。
 */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

/**
 * 三个 cloneMode 关键字必须**各自**挂上后续尾巴（<block> [data]）：
 * 引擎的 matchChild 匹配到 literal 后不会回退到兄弟节点，
 * 若只挂在父节点上，输入 `filtered force` 会停在 force 这个空叶子上，
 * 后续补全变为空。
 */
export const cloneCmd = command('clone')
    .then(
        argument('<x1>', suggestCoordinates())
            .then(argument('<y1>', suggestCoordinates())
                .then(argument('<z1>', suggestCoordinates())
                    .then(argument('<x2>', suggestCoordinates())
                        .then(argument('<y2>', suggestCoordinates())
                            .then(argument('<z2>', suggestCoordinates())
                                .then(argument('<x>', suggestCoordinates())
                                    .then(argument('<y>', suggestCoordinates())
                                        .then(argument('<z>', suggestCoordinates())
                                            .then(
                                                // masked / replace：block 可省略（游戏会忽略）
                                                literal('masked').then(
                                                    literal('force').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                    literal('move').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                    literal('normal').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                ),
                                                literal('replace').then(
                                                    literal('force').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                    literal('move').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                    literal('normal').then(optional('[block]', suggestBlocks())).then(optional('[data]')),
                                                ),
                                                // filtered：block 必填
                                                literal('filtered').then(
                                                    literal('force').then(argument('<block>', suggestBlocks())).then(optional('[data]')),
                                                    literal('move').then(argument('<block>', suggestBlocks())).then(optional('[data]')),
                                                    literal('normal').then(argument('<block>', suggestBlocks())).then(optional('[data]')),
                                                ),
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
    );
