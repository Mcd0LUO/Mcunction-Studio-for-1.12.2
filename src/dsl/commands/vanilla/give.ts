/** /give <target> <item> [count] [data] */
import { command, argument, optional } from '../../builder';
import { suggestSelectors, suggestItems } from '../suggests';

export const giveCmd = command('give')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<item>', suggestItems())
                    .then(
                        optional('[count]').then(
                            optional('[data]')
                        )
                    )
            )
    );
