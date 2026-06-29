/** /testforblock <x> <y> <z> <block> [data] */
import { command, argument, optional } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const testforblockCmd = command('testforblock')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<block>', suggestBlocks())
                        .then(optional('[data]'))
                    )
                )
            )
    );
