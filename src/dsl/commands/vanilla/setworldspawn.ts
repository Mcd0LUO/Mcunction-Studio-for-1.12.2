/** /setworldspawn [<x> <y> <z>] */
import { command, argument } from '../../builder';
import { suggestCoordinates } from '../suggests';

export const setworldspawnCmd = command('setworldspawn')
    .then(
        argument('[x]', suggestCoordinates())
            .then(
                argument('[y]', suggestCoordinates())
                    .then(argument('[z]', suggestCoordinates()))
            )
    );
