/** /tp <target> [destination] */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestSelectorsOrCoords } from '../suggests';

export const tpCmd: RootNode = command('tp')
    .then(
        argument('<target>', suggestSelectors())
            .then(argument('<destination>', suggestSelectorsOrCoords()))
    );
