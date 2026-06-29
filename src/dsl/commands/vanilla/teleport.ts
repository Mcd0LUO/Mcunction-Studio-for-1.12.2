/** /teleport <target> [destination] */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestSelectorsOrCoords } from '../suggests';

export const teleportCmd: RootNode = command('teleport')
    .then(
        argument('<target>', suggestSelectors())
            .then(argument('<destination>', suggestSelectorsOrCoords()))
    );
