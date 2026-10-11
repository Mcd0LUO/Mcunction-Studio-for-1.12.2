/**
 * /particle <name> <x> <y> <z> <xd> <yd> <zd> <speed> [count] [mode] [player] [params ...]
 *
 * wiki（Commands/particle，2018-05 修订）Java Edition 原文：
 *   particle <name> <x> <y> <z> <xd> <yd> <zd> <speed> [count] [mode] [player] [params ...]
 * mode 的取值：normal | force（Arguments 段原文）。
 *
 * ⚠️ 这四个尾巴参数是**顺序可选**，不是并列选择。
 *    此前写成了 `([count] | normal | force | [player] ...)` ——
 *    等于说 count、mode、player 只能出现一个，与实际不符。
 * ⚠️ [params ...] 是**变长**的（iconcrack 收 2 个，其余收 1 个），
 *    用 greedy 而非固定两个 [params] [params2]。
 */
import { command, argument, literal, optional, greedy } from '../../builder';
import { suggestCoordinates, suggestSelectors, suggestParticleNames } from '../suggests';

/** mode 之后（或省略 mode 直接）的 [player] [params ...] */
function tail() {
    return optional('[player]', suggestSelectors())
        .then(greedy('[params...]'));
}

export const particleCmd = command('particle')
    .then(
        argument('<name>', suggestParticleNames())
            .then(argument('<x>', suggestCoordinates())
                .then(argument('<y>', suggestCoordinates())
                    .then(argument('<z>', suggestCoordinates())
                        .then(argument('<xd>', suggestCoordinates())
                            .then(argument('<yd>', suggestCoordinates())
                                .then(argument('<zd>', suggestCoordinates())
                                    .then(argument('<speed>')
                                        .then(optional('[count]')
                                            .then(
                                                literal('normal').then(tail()),
                                                literal('force').then(tail()),
                                                // mode 可省略，直接给 [player]
                                                tail(),
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
