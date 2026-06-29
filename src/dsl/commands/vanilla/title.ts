/** /title <target> <action> [...] */
import { command, argument, literal } from '../../builder';
import { suggestSelectors } from '../suggests';

export const titleCmd = command('title')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                literal('title'),
                literal('subtitle'),
                literal('actionbar'),
                literal('times'),
                literal('clear')
            )
    );
