/** /entitydata <target> <dataTag> */
import { command, argument } from '../../builder';
import { suggestSelectors } from '../suggests';

export const entitydataCmd = command('entitydata')
    .then(
        argument('<target>', suggestSelectors())
            .then(argument('<dataTag>'))
    );
