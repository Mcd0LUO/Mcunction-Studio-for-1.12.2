/**
 * /scoreboard objectives|players|teams ...
 *
 * TODO: 参数结构待修正（Mcd0LUO）
 */
import { command, literal, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestScoreboards, suggestSelectors, suggestTags, suggestTeams, suggestCriteria, suggestOperations, suggestTeamOptions } from '../suggests';

export const scoreboardCmd: RootNode = command('scoreboard')
    .then(
        literal('objectives')
            .then(
                literal('add')
                    .then(
                        argument('<name>', suggestScoreboards())
                            .then(argument('<criteria>', suggestCriteria()))
                    ),
                literal('remove')
                    .then(argument('<name>', suggestScoreboards())),
                literal('list'),
                literal('setdisplay')
                    .then(
                        argument('<slot>')
                            .then(argument('<objective>', suggestScoreboards()))
                    )
            ),
        literal('players')
            .then(
                literal('tag')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(
                                literal('add').then(argument('<name>', suggestTags())),
                                literal('remove').then(argument('<name>', suggestTags())),
                                literal('list')
                            )
                    ),
                literal('add')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<value>'))
                            )
                    ),
                literal('remove')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(argument('<objective>', suggestScoreboards()))
                    ),
                literal('set')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<value>'))
                            )
                    ),
                literal('reset')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(argument('<objective>', suggestScoreboards()))
                    ),
                literal('list'),
                literal('operation')
                    .then(
                        argument('<target>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(
                                        argument('<operation>', suggestOperations())
                                            .then(
                                                argument('<source>', suggestSelectors())
                                                    .then(argument('<sourceObjective>', suggestScoreboards()))
                                            )
                                    )
                            )
                    )
            ),
        literal('teams')
            .then(
                literal('add').then(argument('<name>')),
                literal('remove').then(argument('<name>', suggestTeams())),
                literal('join')
                    .then(
                        argument('<name>', suggestTeams())
                            .then(argument('<target>', suggestSelectors()))
                    ),
                literal('leave')
                    .then(argument('<target>', suggestSelectors())),
                literal('empty')
                    .then(argument('<name>', suggestTeams())),
                literal('option')
                    .then(
                        argument('<name>', suggestTeams())
                            .then(
                                argument('<option>', suggestTeamOptions())
                                    .then(argument('<value>'))
                            )
                    )
            )
    );
