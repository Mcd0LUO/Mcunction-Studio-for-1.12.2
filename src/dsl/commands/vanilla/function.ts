/**
 * /function <name> [if|unless <selector>]
 */
import { command, literal, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestFunctions, suggestSelectors } from '../suggests';

export const functionCmd: RootNode = command('function')
    .then(
        argument('<name>', suggestFunctions())
            .then(
                literal('if').then(argument('<selector>', suggestSelectors())),
                literal('unless').then(argument('<selector>', suggestSelectors()))
            )
    );
