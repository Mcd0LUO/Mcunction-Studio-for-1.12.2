/** /setblock <x> <y> <z> <block> [data] [mode] [dataTag] */
import { command, argument, literal, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const setblockCmd = command('setblock')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<block>', suggestBlocks())
                        .then(optional('[data]')
                            .then(
                                literal('destroy'),
                                literal('keep'),
                                literal('replace')
                            )
                        )
                    )
                )
            )
    );
