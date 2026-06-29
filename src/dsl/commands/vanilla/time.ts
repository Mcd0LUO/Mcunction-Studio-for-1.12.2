/** /time set|add|query [...] */
import { command, literal, argument } from '../../builder';

export const timeCmd = command('time')
    .then(
        literal('set').then(
            argument('<value>')
        ),
        literal('add').then(
            argument('<value>')
        ),
        literal('query').then(
            argument('<query>')
        )
    );
