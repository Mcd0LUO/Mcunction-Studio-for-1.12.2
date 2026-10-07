/**
 * 1.12.2:
 *   /particle <name> <x> <y> <z> <xd> <yd> <zd> <speed> [count] [mode] [player] [params ...]
 *
 * <xd> <yd> <zd> <speed> 在 1.12.2 中**都是必填**（1.13 起才允许省略）。
 * [mode] = normal | force，可选 —— 不写 mode 也可以直接给 [player]。
 * [params ...] 是变长的：iconcrack 收 2 个参数，其余粒子收 1 个。
 */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestSelectors, suggestParticleNames } from '../suggests';

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
                                        .then(optional('[count]'))
                                            .then(
                                                literal('normal'),
                                                literal('force'),
                                                // mode 可省略：这条边直通 [player]
                                                optional('[player]', suggestSelectors())
                                                    // params 变长，最多 2 个（iconcrack 收 2 个）
                                                    .then(optional('[params]'))
                                                    .then(optional('[params2]'))
                                            )
                                    )
                                )
                            )
                        )
                    )
                )
            )
    );
