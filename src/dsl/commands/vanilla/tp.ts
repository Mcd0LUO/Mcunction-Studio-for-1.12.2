/**
 * /tp [target player] <destination player>
 * /tp [target player] <x> <y> <z> [<yaw> <pitch>]
 *
 * wiki（Commands/tp，2018-05 修订）Java Edition 原文即上面两行。
 *
 * 引擎不会回溯（matchChild 取第一个 argument 子节点），无法按"目标是不是坐标"
 * 分派，因此把坐标链直接挂在 <destination> 下面：
 *   tp @s @p        → target=@s destination=@p           ✓
 *   tp @s 1 2 3     → target=@s destination=1 y=2 z=3    ✓
 *   tp @s 1 2 3 90 0→ … z=3 yaw=90 pitch=0               ✓
 * 代价：`tp @s @p 90 0` 会把 90/0 认成 y/z 而非 yaw/pitch ——
 * 只是标签不准，不会误报。
 */
import { command, argument, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestSelectorsOrCoords, suggestCoordinates } from '../suggests';

export const tpCmd: RootNode = command('tp')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<destination>', suggestSelectorsOrCoords())
                    .then(
                        argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates())
                                .then(optional('[yaw]')
                                    .then(optional('[pitch]'))
                                )
                            )
                    )
            )
    );
