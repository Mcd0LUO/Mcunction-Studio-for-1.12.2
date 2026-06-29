/** /detect <x> <y> <z> <block> <data> <subcommand> */
import { command, argument } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const detectCmd = command('detect')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<block>', suggestBlocks())
                        .then(argument('<data>')
                            .then(argument('<subcommand>'))
                        )
                    )
                )
            )
    );
