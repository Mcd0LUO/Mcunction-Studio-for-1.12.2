/** /testfor <target> */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors } from '../suggests';

export const testforCmd: RootNode = command('testfor')
    .then(argument('<target>', suggestSelectors()));
