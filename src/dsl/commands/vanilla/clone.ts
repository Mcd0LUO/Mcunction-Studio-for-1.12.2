/** /clone <x1> <y1> <z1> <x2> <y2> <z2> <x> <y> <z> [mask] [mode] */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

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
                                                literal('masked'),
                                                literal('replace'),
                                                literal('filtered').then(argument('[block]', suggestBlocks()))
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
