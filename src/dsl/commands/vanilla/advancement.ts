/** /advancement grant|revoke|test ... */
import { command, literal, argument } from '../../builder';
import { suggestSelectors } from '../suggests';

export const advancementCmd = command('advancement')
    .then(
        literal('grant')
            .then(argument('<targets>', suggestSelectors())
                .then(
                    literal('only').then(argument('<advancement>')),
                    literal('from').then(argument('<advancement>')),
                    literal('through').then(argument('<advancement>')),
                    literal('everything')
                )
            ),
        literal('revoke')
            .then(argument('<targets>', suggestSelectors())
                .then(
                    literal('only').then(argument('<advancement>')),
                    literal('from').then(argument('<advancement>')),
                    literal('through').then(argument('<advancement>')),
                    literal('everything')
                )
            ),
        literal('test')
            .then(argument('<targets>', suggestSelectors())
                .then(argument('<advancement>'))
            )
    );
