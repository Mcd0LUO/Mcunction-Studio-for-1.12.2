/** /score set <obj> <sel> from <source> [...] [scale N] */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestScoreboards, suggestCoordinates } from '../suggests';

const fromSources = literal('from')
    .then(
        literal('var')
            .then(argument('<ns>')
                .then(argument('<var>'))
            ),
        literal('score')
            .then(argument('<sel>', suggestSelectors())
                .then(argument('<obj>', suggestScoreboards()))
            ),
        literal('entity')
            .then(argument('<sel>', suggestSelectors())
                .then(argument('<path>'))
            ),
        literal('block')
            .then(argument('<x>', suggestCoordinates())
                .then(argument('<y>', suggestCoordinates())
                    .then(argument('<z>', suggestCoordinates())
                        .then(argument('<path>'))
                    )
                )
            ),
        literal('time')
            .then(argument('<unit>'))
    );

export const scoreCmd = command('score')
    .then(
        literal('set')
            .then(argument('<obj>', suggestScoreboards())
                .then(argument('<sel>', suggestSelectors())
                    .then(fromSources)
                )
            )
    );
