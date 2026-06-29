/** /foreach var|data ... as <ns> <var> run <command> */
import { command, literal, argument, forward } from '../../builder';
import { suggestSelectors, suggestCoordinates } from '../suggests';

export const foreachCmd = command('foreach')
    .then(
        literal('var')
            .then(argument('<ns>')
                .then(argument('<list_var>')
                    .then(
                        literal('as')
                            .then(argument('<ns>')
                                .then(argument('<item_var>')
                                    .then(
                                        literal('run').then(forward())
                                    )
                                )
                            )
                    )
                )
            ),
        literal('data')
            .then(
                literal('entity')
                    .then(argument('<selector>', suggestSelectors())
                        .then(argument('<path>')
                            .then(
                                literal('as')
                                    .then(argument('<ns>')
                                        .then(argument('<item_var>')
                                            .then(
                                                literal('run').then(forward())
                                            )
                                        )
                                    )
                            )
                        )
                    ),
                literal('block')
                    .then(argument('<x>', suggestCoordinates())
                        .then(argument('<y>', suggestCoordinates())
                            .then(argument('<z>', suggestCoordinates())
                                .then(argument('<path>')
                                    .then(
                                        literal('as')
                                            .then(argument('<ns>')
                                                .then(argument('<item_var>')
                                                    .then(
                                                        literal('run').then(forward())
                                                    )
                                                )
                                            )
                                    )
                                )
                            )
                        )
                    )
            )
    );
