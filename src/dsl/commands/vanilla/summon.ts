/** /summon <entity> [<x> <y> <z>] [dataTag] */
import { command, argument, optional } from '../../builder';
import { suggestCoordinates, suggestEntityTypes } from '../suggests';

export const summonCmd = command('summon')
    .then(
        argument('<entity>', suggestEntityTypes())
            .then(optional('[x]', suggestCoordinates())
                .then(optional('[y]', suggestCoordinates())
                    .then(optional('[z]', suggestCoordinates())
                        .then(optional('[dataTag]'))
                    )
                )
            )
    );
