/** /kill <target> */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors } from '../suggests';

export const killCmd: RootNode = command('kill')
    .then(argument('<target>', suggestSelectors()));
