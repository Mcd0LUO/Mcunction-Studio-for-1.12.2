/**
 * 1.12.2:
 *   /effect <player> <effect> [seconds] [amplifier] [hideParticles]
 *   /effect <player> clear
 */
import { command, argument, optional, literal } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestEffects } from '../suggests';

export const effectCmd: RootNode = command('effect')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                literal('clear'),
                argument('<effect>', suggestEffects())
                    .then(
                        optional('[seconds]').then(
                            optional('[amplifier]').then(
                                optional('[hideParticles]')
                            )
                        )
                    )
            )
    );
