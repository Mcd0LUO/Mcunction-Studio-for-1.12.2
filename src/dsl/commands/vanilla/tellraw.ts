/** /tellraw <target> <json> — JSON 补全委托 JsonMsgParser */
import { command, argument } from '../../builder';
import { suggestSelectors } from '../suggests';

export const tellrawCmd = command('tellraw')
    .then(
        argument('<target>', suggestSelectors())
            .then(argument('<json>'))
    );
