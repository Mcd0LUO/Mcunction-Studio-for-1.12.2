/** /spreadplayers <x> <z> <dist> <range> <respectTeams> <targets> */
import { command, argument } from '../../builder';
import { suggestCoordinates, suggestSelectors } from '../suggests';

export const spreadplayersCmd = command('spreadplayers')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<z>', suggestCoordinates())
                .then(argument('<dist>')
                    .then(argument('<range>')
                        .then(argument('<respectTeams>')
                            .then(argument('<targets>', suggestSelectors()))
                        )
                    )
                )
            )
    );
