/** /var set|operation|get|del|delall|save|load ... */
import { command, literal, argument, optional } from '../../builder';
import { suggestSelectors, suggestScoreboards, suggestCoordinates } from '../suggests';

const fromSources = literal('from')
    .then(
        literal('var')
            .then(argument('<ns>').then(argument('<var>'))),
        literal('score')
            .then(argument('<sel>', suggestSelectors()).then(argument('<obj>', suggestScoreboards()))),
        literal('entity')
            .then(argument('<sel>', suggestSelectors()).then(argument('<path>'))),
        literal('block')
            .then(argument('<x>', suggestCoordinates()).then(argument('<y>', suggestCoordinates()).then(argument('<z>', suggestCoordinates()).then(argument('<path>'))))),
        literal('time')
            .then(argument('<unit>'))
    );

const operation = literal('operation')
    .then(argument('<ns>')
        .then(argument('<var>')
            .then(
                literal('math').then(argument('<op>')),
                literal('string').then(argument('<op>')),
                literal('list').then(argument('<op>'))
            )
        )
    );

export const varCmd = command('var')
    .then(
        literal('set')
            .then(argument('<ns>')
                .then(argument('<var>')
                    .then(
                        literal('value').then(argument('<value>')
                            .then(
                                literal('int'), literal('float'), literal('string'),
                                literal('bool'), literal('list'), literal('map')
                            )
                        ),
                        fromSources
                    )
                )
            ),
        operation,
        literal('get')
            .then(argument('<ns>')
                .then(optional('[var]'))
            ),
        literal('del')
            .then(argument('<ns>')
                .then(argument('<var>'))
            ),
        literal('delall'),
        literal('save'),
        literal('load')
    );
