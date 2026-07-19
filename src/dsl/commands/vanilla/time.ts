/** /time set|add|query [...] — 1.12.2 */
import { command, literal, argument } from '../../builder';

export const timeCmd = command('time')
    .then(
        literal('set').then(
            argument('<value>'),
            literal('day'),
            literal('night'),
            literal('noon'),
            literal('midnight'),
        ),
        literal('add').then(
            argument('<value>'),
        ),
        literal('query').then(
            literal('daytime'),
            literal('gametime'),
            literal('day'),
        ),
    );
