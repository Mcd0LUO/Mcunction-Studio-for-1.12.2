/** /playsound <sound> <target> [<x> <y> <z>] [volume] [pitch] [minVolume] */
import { command, argument, optional } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestSoundNames } from '../suggests';

export const playsoundCmd = command('playsound')
    .then(
        argument('<sound>', suggestSoundNames())
            .then(argument('<target>', suggestSelectors())
                .then(argument('[x]', suggestCoordinates())
                    .then(argument('[y]', suggestCoordinates())
                        .then(argument('[z]', suggestCoordinates())
                            .then(optional('[volume]')
                                .then(optional('[pitch]')
                                    .then(optional('[minVolume]'))
                                )
                            )
                        )
                    )
                )
            )
    );
