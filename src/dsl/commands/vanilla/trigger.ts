/** /trigger <objective> [add|set] [value] */
import { command, argument, literal } from '../../builder';
import { suggestScoreboards } from '../suggests';

export const triggerCmd = command('trigger')
    .then(
        argument('<objective>', suggestScoreboards())
            .then(
                literal('add').then(argument('<value>')),
                literal('set').then(argument('<value>'))
            )
    );
