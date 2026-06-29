/** /spawnpoint [<target>] [<x> <y> <z>] */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestCoordinates } from '../suggests';

export const spawnpointCmd: RootNode = command('spawnpoint')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<x>', suggestCoordinates())
                    .then(
                        argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates()))
                    )
            )
    );
