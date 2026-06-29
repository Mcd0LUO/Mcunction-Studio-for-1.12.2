/** /advancement grant|revoke|test ... */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestAdvancements } from '../suggests';

export const advancementCmd = command('advancement')
    .then(
        literal('grant')
            .then(argument('<targets>', suggestSelectors())
                .then(
                    literal('only').then(argument('<advancement>', suggestAdvancements())),
                    literal('from').then(argument('<advancement>', suggestAdvancements())),
                    literal('through').then(argument('<advancement>', suggestAdvancements())),
                    literal('everything')
                )
            ),
        literal('revoke')
            .then(argument('<targets>', suggestSelectors())
                .then(
                    literal('only').then(argument('<advancement>', suggestAdvancements())),
                    literal('from').then(argument('<advancement>', suggestAdvancements())),
                    literal('through').then(argument('<advancement>', suggestAdvancements())),
                    literal('everything')
                )
            ),
        literal('test')
            .then(argument('<targets>', suggestSelectors())
                .then(argument('<advancement>', suggestAdvancements()))
            )
    );
