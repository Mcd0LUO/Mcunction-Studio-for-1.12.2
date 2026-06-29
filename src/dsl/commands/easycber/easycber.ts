/** /easycber setting <key> [value...] */
import { command, literal, argument } from '../../builder';
import { suggestFunctions } from '../suggests';

export const easycberCmd = command('easycber')
    .then(
        literal('setting')
            .then(
                literal('command_feedback')
                    .then(
                        literal('true'),
                        literal('false')
                    ),
                literal('on_load')
                    .then(
                        literal('add').then(argument('<function>', suggestFunctions())),
                        literal('remove').then(argument('<function>', suggestFunctions())),
                        literal('list')
                    )
            )
    );
