/** /dispatch <command> */
import { command, argument } from '../../builder';

export const dispatchCmd = command('dispatch')
    .then(argument('<command>'));
