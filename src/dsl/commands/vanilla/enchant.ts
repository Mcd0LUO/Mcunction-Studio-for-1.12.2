/** /enchant <target> <enchantment> [level] */
import { command, argument, optional } from '../../builder';
import { suggestSelectors } from '../suggests';

export const enchantCmd = command('enchant')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                argument('<enchantment>')
                    .then(optional('[level]'))
            )
    );
