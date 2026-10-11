/**
 * /playsound <sound> <source> <player> [x] [y] [z] [volume] [pitch] [minimumVolume]
 *
 * wiki（Commands/playsound，2018-05 修订）Java Edition 原文：
 *   playsound <sound> <source> <player> [x] [y] [z] [volume] [pitch] [minimumVolume]
 *
 * ⚠️ `<source>`（声音频道，如 master / player / block）此前整个漏了 ——
 *    少了它会让 `playsound foo master @a` 把 master 当成选择器。
 */
import { command, argument, optional } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestSoundNames } from '../suggests';

export const playsoundCmd = command('playsound')
    .then(
        argument('<sound>', suggestSoundNames())
            .then(argument('<source>')
                .then(argument('<player>', suggestSelectors())
                    .then(argument('[x]', suggestCoordinates())
                        .then(argument('[y]', suggestCoordinates())
                            .then(argument('[z]', suggestCoordinates())
                                .then(optional('[volume]')
                                    .then(optional('[pitch]')
                                        .then(optional('[minimumVolume]'))
                                    )
                                )
                            )
                        )
                    )
                )
            )
    );
