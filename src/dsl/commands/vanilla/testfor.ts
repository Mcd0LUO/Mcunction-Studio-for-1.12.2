/** /testfor <player> [dataTag] */
import { command, argument, greedy } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors } from '../suggests';

export const testforCmd: RootNode = command('testfor')
    .then(
        argument('<player>', suggestSelectors())
            // wiki（Commands/testfor，2018-05 修订）：
            //   testfor <player> [dataTag]
            // dataTag 可含空格（{a: 1}），故用 greedy
            .then(greedy('[dataTag]')),
    );
