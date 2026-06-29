/** /superexe [if|unless|facing|positioned] [...] run <command> */
import { command, literal, argument, forward } from '../../builder';
import { suggestSelectors, suggestScoreboards, suggestCoordinates } from '../suggests';

export const superexeCmd = command('superexe')
    .then(
        literal('if').then(
            literal('entity').then(argument('<sel>', suggestSelectors())),
            literal('block').then(
                argument('<x>', suggestCoordinates())
                    .then(argument('<y>', suggestCoordinates())
                        .then(argument('<z>', suggestCoordinates()))
                    )
            ),
            literal('score').then(
                argument('<sel>', suggestSelectors())
                    .then(argument('<obj>', suggestScoreboards()))
            ),
            literal('var').then(argument('<ns>').then(argument('<var>'))),
            literal('data').then(
                literal('entity').then(argument('<sel>', suggestSelectors())),
                literal('block').then(
                    argument('<x>', suggestCoordinates())
                        .then(argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates()))
                        )
                )
            )
        ),
        literal('unless').then(
            literal('entity').then(argument('<sel>', suggestSelectors())),
            literal('block').then(
                argument('<x>', suggestCoordinates())
                    .then(argument('<y>', suggestCoordinates())
                        .then(argument('<z>', suggestCoordinates()))
                    )
            ),
            literal('score').then(
                argument('<sel>', suggestSelectors())
                    .then(argument('<obj>', suggestScoreboards()))
            ),
            literal('var').then(argument('<ns>').then(argument('<var>'))),
            literal('data').then(
                literal('entity').then(argument('<sel>', suggestSelectors())),
                literal('block').then(
                    argument('<x>', suggestCoordinates())
                        .then(argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates()))
                        )
                )
            )
        ),
        literal('facing').then(
            literal('entity').then(argument('<sel>', suggestSelectors())),
            literal('block').then(
                argument('<x>', suggestCoordinates())
                    .then(argument('<y>', suggestCoordinates())
                        .then(argument('<z>', suggestCoordinates()))
                    )
            )
        ),
        literal('positioned').then(argument('<pos>', suggestSelectors())),
        literal('run').then(forward())
    );
