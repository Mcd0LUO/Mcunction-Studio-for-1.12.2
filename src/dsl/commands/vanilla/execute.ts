/** /execute <target> <x> <y> <z> <command> */
import { command, argument, forward } from '../../builder';
import { suggestSelectors, suggestCoordinates } from '../suggests';

export const executeCmd = command('execute')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<x>', suggestCoordinates())
                    .then(
                        argument('<y>', suggestCoordinates())
                            .then(
                                argument('<z>', suggestCoordinates())
                                    .then(forward())
                            )
                    )
            )
    );
