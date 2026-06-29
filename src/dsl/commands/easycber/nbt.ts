/** /nbt get|set entity|block ... */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestScoreboards } from '../suggests';

const fromSources = literal('from')
    .then(
        literal('var').then(argument('<ns>').then(argument('<var>'))),
        literal('score').then(argument('<sel>', suggestSelectors()).then(argument('<obj>', suggestScoreboards()))),
        literal('entity').then(argument('<sel>', suggestSelectors()).then(argument('<path>'))),
        literal('block').then(argument('<x>', suggestCoordinates()).then(argument('<y>', suggestCoordinates()).then(argument('<z>', suggestCoordinates()).then(argument('<path>'))))),
        literal('time').then(argument('<unit>')),
        literal('value').then(argument('<value>'))
    );

const getEntity = literal('entity')
    .then(argument('<sel>', suggestSelectors())
        .then(argument('[path]'))
    );

const getBlock = literal('block')
    .then(argument('<x>', suggestCoordinates())
        .then(argument('<y>', suggestCoordinates())
            .then(argument('<z>', suggestCoordinates())
                .then(argument('[path]'))
            )
        )
    );

const setEntity = literal('entity')
    .then(argument('<sel>', suggestSelectors())
        .then(argument('<path>')
            .then(
                literal('value').then(argument('<value>')),
                fromSources
            )
        )
    );

const setBlock = literal('block')
    .then(argument('<x>', suggestCoordinates())
        .then(argument('<y>', suggestCoordinates())
            .then(argument('<z>', suggestCoordinates())
                .then(argument('<path>')
                    .then(
                        literal('value').then(argument('<value>')),
                        fromSources
                    )
                )
            )
        )
    );

export const nbtCmd = command('nbt')
    .then(
        literal('get').then(getEntity, getBlock),
        literal('set').then(setEntity, setBlock)
    );
