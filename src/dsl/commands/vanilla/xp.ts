/** /xp <amount> [target] */
import { command, argument } from '../../builder';
import { suggestSelectors } from '../suggests';

export const xpCmd = command('xp')
    .then(
        argument('<amount>')
            .then(argument('[target]', suggestSelectors()))
    );
