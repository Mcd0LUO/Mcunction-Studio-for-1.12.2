/** /gamemode <mode> [target] */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestGameModes, suggestSelectors } from '../suggests';

export const gamemodeCmd: RootNode = command('gamemode')
    .then(
        argument('<mode>', suggestGameModes())
            .then(argument('<target>', suggestSelectors()))
    );
