/** /weather <type> [duration] */
import { command, argument, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestWeatherTypes } from '../suggests';

export const weatherCmd: RootNode = command('weather')
    .then(
        argument('<type>', suggestWeatherTypes())
            .then(optional('[duration]'))
    );
