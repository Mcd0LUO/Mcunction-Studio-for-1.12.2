/** /team add|remove|join|leave|clear|list|option ... */
import { command, literal, argument, optional } from '../../builder';
import { suggestSelectors, suggestTeams } from '../suggests';

export const teamCmd = command('team')
    .then(
        literal('add')
            .then(argument('<name>', suggestTeams())
                .then(optional('[displayName]'))
            ),
        literal('remove')
            .then(argument('<name>', suggestTeams())),
        literal('join')
            .then(argument('<name>', suggestTeams())
                .then(argument('<target>', suggestSelectors()))
            ),
        literal('leave')
            .then(argument('<target>', suggestSelectors())),
        literal('clear')
            .then(argument('<name>', suggestTeams())),
        literal('list'),
        literal('option')
            .then(argument('<name>', suggestTeams())
                .then(argument('<key>')
                    .then(argument('<value>'))
                )
            )
    );
