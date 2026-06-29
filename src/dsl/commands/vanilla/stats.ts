/** /stats entity|block ... */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestScoreboards } from '../suggests';

const entityStats = literal('entity')
    .then(
        argument('<targets>', suggestSelectors())
            .then(
                literal('clear'),
                literal('set')
                    .then(argument('<type>')
                        .then(argument('<selector>', suggestSelectors())
                            .then(argument('<scoreboard>', suggestScoreboards()))
                        )
                    )
            )
    );

const blockStats = literal('block')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(
                        literal('clear'),
                        literal('set')
                            .then(argument('<type>')
                                .then(argument('<selector>', suggestSelectors())
                                    .then(argument('<scoreboard>', suggestScoreboards()))
                                )
                            )
                    )
                )
            )
    );

export const statsCmd = command('stats')
    .then(entityStats, blockStats);
