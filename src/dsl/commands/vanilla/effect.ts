/**
 * /effect <target> <effect> [duration] [amplifier] [hideParticles]
 */
import { command, argument, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors, suggestEffects } from '../suggests';

export const effectCmd: RootNode = command('effect')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<effect>', suggestEffects())
                    .then(
                        optional('[duration]').then(
                            optional('[amplifier]').then(
                                optional('[hideParticles]')
                            )
                        )
                    )
            )
    );
