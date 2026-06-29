/** /testforblocks <x1> <y1> <z1> <x2> <y2> <z2> <x> <y> <z> [mode] */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates } from '../suggests';

export const testforblocksCmd = command('testforblocks')
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
                                                literal('all'),
                                                literal('masked')
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
