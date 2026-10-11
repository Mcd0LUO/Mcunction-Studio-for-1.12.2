/**
 * /teleport —— wiki（Commands/teleport，2018-05 修订）Java Edition 原文：
 *   teleport <destination>
 *   teleport <location> [<rotation>]
 *   teleport <targets> <destination>
 *   teleport <targets> (<location>|<entity>) facing (<facingEntity>|<facingLocation>)
 *   teleport <targets> <location> [<rotation>]
 *
 * 引擎不会回溯（matchChild 取第一个 argument 子节点），无法按"这一项是实体还是坐标"
 * 分派，因此把坐标链与 facing 分支都挂在 <destination> 下面，靠 literal 分派 facing：
 *   teleport @s @p                  → targets=@s destination=@p              ✓
 *   teleport @s 1 2 3               → targets=@s destination=1 y=2 z=3       ✓
 *   teleport @s 1 2 3 90 0          → … z=3 yaw=90 pitch=0                   ✓
 *   teleport @s @p facing @e        → targets=@s destination=@p facing @e    ✓
 *   teleport @s 1 2 3 facing 4 5 6  → … z=3 facing 4 5 6                     ✓
 */
import { command, argument, literal, optional } from '../../builder';
import { RootNode } from '../../nodes';
import {
    suggestSelectors, suggestSelectorsOrCoords, suggestCoordinates,
} from '../suggests';

/**
 * facing 之后：实体（1 个 token）或坐标（3 个 token）。
 *
 * 两种形式都是"一个实体或一组坐标"，但坐标占 3 个 token，
 * 所以要把 y/z 挂在第一个参数下面 —— 只写一个 argument 的话
 * `teleport @s 1 2 3 facing 4 5 6` 的 `5 6` 会变成多余 token。
 */
function facingTarget() {
    return argument('<facingEntity|facingLocation>', suggestSelectorsOrCoords())
        .then(
            optional('[facingY]', suggestCoordinates())
                .then(optional('[facingZ]', suggestCoordinates())),
        );
}

export const teleportCmd: RootNode = command('teleport')
    .then(
        argument('<targets>', suggestSelectors())
            .then(
                argument('<destination>', suggestSelectorsOrCoords())
                    .then(
                        // facing 是字面量，matchChild 优先匹配它
                        literal('facing').then(facingTarget()),
                        // 坐标形式：<destination> 实为 x，后面接 y z 与可选朝向
                        argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates())
                                .then(
                                    literal('facing').then(facingTarget()),
                                    optional('[yaw]').then(optional('[pitch]')),
                                )
                            ),
                        // 实体形式：可选朝向
                        optional('[yaw]').then(optional('[pitch]')),
                    )
            )
    );
