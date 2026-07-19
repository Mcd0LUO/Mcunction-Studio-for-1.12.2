/**
 * /title <target> clear|reset|title|subtitle|actionbar|times ...
 * 1.12.2
 */
import { command, argument, literal } from '../../builder';
import { suggestSelectors } from '../suggests';

export const titleCmd = command('title')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                literal('clear'),
                literal('reset'),
                literal('title').then(argument('<json>')),
                literal('subtitle').then(argument('<json>')),
                literal('actionbar').then(argument('<json>')),
                literal('times').then(
                    argument('<fadeIn>').then(
                        argument('<stay>').then(
                            argument('<fadeOut>'),
                        ),
                    ),
                ),
            ),
    );
