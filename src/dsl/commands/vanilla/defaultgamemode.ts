/** /defaultgamemode <mode> */
import { command, argument } from '../../builder';
import { suggestGameModes } from '../suggests';

export const defaultgamemodeCmd = command('defaultgamemode')
    .then(argument('<mode>', suggestGameModes()));
