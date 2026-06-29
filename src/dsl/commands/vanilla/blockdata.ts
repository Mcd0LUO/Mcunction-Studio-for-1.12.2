/** /blockdata <x> <y> <z> <dataTag> */
import { command, argument } from '../../builder';
import { suggestCoordinates } from '../suggests';

export const blockdataCmd = command('blockdata')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<dataTag>'))
                )
            )
    );
