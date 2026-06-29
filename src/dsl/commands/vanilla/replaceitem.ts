/** /replaceitem entity|block ... */
import { command, literal, argument, optional } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestItems } from '../suggests';

const entityPath = literal('entity')
    .then(
        argument('<targets>', suggestSelectors())
            .then(argument('<slot>')
                .then(argument('<item>', suggestItems())
                    .then(optional('[count]')
                        .then(optional('[data]')
                            .then(optional('[dataTag]'))
                        )
                    )
                )
            )
    );

const blockPath = literal('block')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<slot>')
                        .then(argument('<item>', suggestItems())
                            .then(optional('[count]')
                                .then(optional('[data]')
                                    .then(optional('[dataTag]'))
                                )
                            )
                        )
                    )
                )
            )
    );

export const replaceitemCmd = command('replaceitem')
    .then(entityPath, blockPath);
