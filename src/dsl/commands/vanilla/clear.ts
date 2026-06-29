/** /clear [target] [item] */
import { command, argument, optional } from '../../builder';
import { suggestSelectors, suggestItems } from '../suggests';

export const clearCmd = command('clear')
    .then(
        optional('[target]', suggestSelectors())
            .then(argument('[item]', suggestItems()))
    );
