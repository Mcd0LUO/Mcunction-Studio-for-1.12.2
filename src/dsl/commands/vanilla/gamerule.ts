/** /gamerule <rule> [value] */
import { command, argument, optional } from '../../builder';

export const gameruleCmd = command('gamerule')
    .then(argument('<rule>')
        .then(optional('[value]'))
    );
