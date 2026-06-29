/** /area create|remove|tp|bind|unbind|list ... */
import { command, literal, argument, optional } from '../../builder';
import { suggestCoordinates, suggestFunctions } from '../suggests';

export const areaCmd = command('area')
    .then(
        literal('create')
            .then(argument('<x1>', suggestCoordinates())
                .then(argument('<y1>', suggestCoordinates())
                    .then(argument('<z1>', suggestCoordinates())
                        .then(argument('<x2>', suggestCoordinates())
                            .then(argument('<y2>', suggestCoordinates())
                                .then(argument('<z2>', suggestCoordinates())
                                    .then(argument('<name>'))
                                )
                            )
                        )
                    )
                )
            ),
        literal('remove').then(argument('<name>')),
        literal('tp').then(argument('<name>')),
        literal('bind')
            .then(argument('<name>')
                .then(
                    literal('enter').then(
                        literal('title').then(argument('<value>')),
                        literal('subtitle').then(argument('<value>')),
                        literal('chat').then(argument('<value>')),
                        literal('function').then(argument('<function>', suggestFunctions()))
                    ),
                    literal('leave').then(
                        literal('title').then(argument('<value>')),
                        literal('subtitle').then(argument('<value>')),
                        literal('chat').then(argument('<value>')),
                        literal('function').then(argument('<function>', suggestFunctions()))
                    )
                )
            ),
        literal('unbind')
            .then(argument('<name>')
                .then(
                    optional('[event]'),
                    optional('[type]')
                )
            ),
        literal('list')
    );
