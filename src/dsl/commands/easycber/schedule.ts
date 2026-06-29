/** /schedule function|repeat|random|clear ... */
import { command, literal, argument } from '../../builder';
import { suggestFunctions } from '../suggests';

export const scheduleCmd = command('schedule')
    .then(
        literal('function')
            .then(argument('<function>', suggestFunctions())
                .then(argument('<time>')
                    .then(
                        literal('append'),
                        literal('replace')
                    )
                )
            ),
        literal('repeat')
            .then(argument('<function>', suggestFunctions())
                .then(argument('<interval>')
                    .then(argument('[count]'))
                )
            ),
        literal('random')
            .then(argument('<function>', suggestFunctions())
                .then(argument('<min>')
                    .then(argument('<max>'))
                )
            ),
        literal('clear')
            .then(argument('[function]', suggestFunctions()))
    );
