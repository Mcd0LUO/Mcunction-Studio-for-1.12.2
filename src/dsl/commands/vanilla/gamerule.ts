/** /gamerule <rule> [value] */
import { command, argument, optional } from '../../builder';
import { suggestGameRules } from '../suggests';

export const gameruleCmd = command('gamerule')
    .then(argument('<rule>', suggestGameRules())
        .then(optional('[value]'))
    );
