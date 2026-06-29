/** /random var|score range|sample ... */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestScoreboards } from '../suggests';

const varRange = literal('var')
    .then(literal('range')
        .then(argument('<ns>')
            .then(argument('<var>')
                .then(argument('<min>')
                    .then(argument('<max>')
                        .then(
                            literal('int'),
                            literal('float')
                        )
                    )
                )
            )
        )
    );

const varSample = literal('var')
    .then(literal('sample')
        .then(argument('<ns>')
            .then(argument('<var>')
                .then(argument('<count>'))
            )
        )
    );

const scoreRange = literal('score')
    .then(literal('range')
        .then(argument('<obj>', suggestScoreboards())
            .then(argument('<sel>', suggestSelectors())
                .then(argument('<min>')
                    .then(argument('<max>'))
                )
            )
        )
    );

const scoreSample = literal('score')
    .then(literal('sample')
        .then(argument('<ns>')
            .then(argument('<var>')
                .then(argument('<obj>', suggestScoreboards())
                    .then(argument('<sel>', suggestSelectors()))
                )
            )
        )
    );

export const randomCmd = command('random')
    .then(varRange, varSample, scoreRange, scoreSample);
