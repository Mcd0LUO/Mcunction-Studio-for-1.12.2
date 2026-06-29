/** /particle <name> <x> <y> <z> [xd] [yd] [zd] [speed] [count] [mode] [target] [params] */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestSelectors, suggestParticleNames } from '../suggests';

export const particleCmd = command('particle')
    .then(
        argument('<name>', suggestParticleNames())
            .then(argument('<x>', suggestCoordinates())
                .then(argument('<y>', suggestCoordinates())
                    .then(argument('<z>', suggestCoordinates())
                        .then(optional('[xd]')
                            .then(optional('[yd]')
                                .then(optional('[zd]')
                                    .then(optional('[speed]')
                                        .then(optional('[count]')
                                            .then(
                                                literal('normal')
                                                    .then(optional('[target]', suggestSelectors())
                                                        .then(optional('[params]'))
                                                    ),
                                                literal('force')
                                                    .then(optional('[target]', suggestSelectors())
                                                        .then(optional('[params]'))
                                                    )
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
