/** /stopsound <target> [source] [sound] */
import { command, argument, optional } from '../../builder';
import { suggestSelectors, suggestSoundNames } from '../suggests';

export const stopsoundCmd = command('stopsound')
    .then(
        argument('<target>', suggestSelectors())
            .then(optional('[source]')
                .then(optional('[sound]', suggestSoundNames()))
            )
    );
