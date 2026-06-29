/** /fill <x1> <y1> <z1> <x2> <y2> <z2> <block> [data] [mode] */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const fillCmd = command('fill')
    .then(
        argument('<x1>', suggestCoordinates())
            .then(argument('<y1>', suggestCoordinates())
                .then(argument('<z1>', suggestCoordinates())
                    .then(argument('<x2>', suggestCoordinates())
                        .then(argument('<y2>', suggestCoordinates())
                            .then(argument('<z2>', suggestCoordinates())
                                .then(argument('<block>', suggestBlocks())
                                    .then(optional('[data]')
                                        .then(
                                            literal('destroy'),
                                            literal('hollow'),
                                            literal('keep'),
                                            literal('outline'),
                                            literal('replace')
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
    );
