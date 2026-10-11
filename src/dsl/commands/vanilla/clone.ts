/**
 * /clone <x1> <y1> <z1> <x2> <y2> <z2> <x> <y> <z> [maskMode] [cloneMode] [TileName] [dataValue|state]
 *
 * wiki（Commands/clone，2018-05 修订）Java Edition 原文即上面一行 ——
 * 四个尾巴参数是**顺序可选**的，不是"maskMode 与 cloneMode 的组合矩阵"。
 *
 * maskMode  = masked | replace | filtered
 * cloneMode = normal | force | move
 * TileName / dataValue 仅 filtered 模式有意义（游戏对其它模式会忽略）
 *
 * ⚠️ 此前写成了 maskMode → cloneMode 的两层交叉（每个组合各挂一次 block/data），
 *    结构冗余且与原文不符；而且 `.then(...).then(...)` 是链在**父节点**上的，
 *    导致 `[data]` 实际成了 `[block]` 的兄弟而非子节点。
 *
 * ⚠️ 顺序：1.12.2 的 TileName 在 cloneMode **之后**。
 *    1.13 (17w45a) 才把它挪到 mode 之前 —— 不要照抄新版。
 */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

/** maskMode/cloneMode 之后的 [TileName] [dataValue] */
function tileTail() {
    return optional('[TileName]', suggestBlocks())
        .then(optional('[dataValue]'));
}

/** cloneMode 三值，各自挂尾巴；另有一条省略 cloneMode 的边 */
function cloneModeBranches() {
    return [
        literal('normal').then(tileTail()),
        literal('force').then(tileTail()),
        literal('move').then(tileTail()),
        // cloneMode 可省略，直接写 TileName
        tileTail(),
    ];
}

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
                                                literal('masked').then(...cloneModeBranches()),
                                                literal('replace').then(...cloneModeBranches()),
                                                literal('filtered').then(...cloneModeBranches()),
                                                // maskMode 可省略
                                                ...cloneModeBranches(),
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
