/** /worldborder add|set|center|damage|get|warning ... */
import { command, literal, argument, optional } from '../../builder';
import { suggestCoordinates } from '../suggests';

export const worldborderCmd = command('worldborder')
    .then(
        literal('add')
            .then(argument('<size>')
                .then(optional('[time]'))
            ),
        literal('set')
            .then(argument('<size>')
                .then(optional('[time]'))
            ),
        literal('center')
            .then(argument('<x>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates()))
            ),
        literal('damage')
            .then(
                literal('amount').then(argument('<damage>')),
                literal('buffer').then(argument('<distance>'))
            ),
        literal('get'),
        literal('warning')
            .then(
                literal('distance').then(argument('<distance>')),
                literal('time').then(argument('<time>'))
            )
    );
