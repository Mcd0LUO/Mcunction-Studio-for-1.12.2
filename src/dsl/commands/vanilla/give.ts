/**
 * /give <player> <item> [amount] [data] [dataTag]
 *
 * wiki（Commands/give，2018-05 修订）Java Edition 原文：
 *   give <player> <item> [amount] [data] [dataTag]
 * （`give <player> <item> [<count>]` 标了 upcoming ver=1.13，属新版语法，不建模）
 */
import { command, argument, optional, greedy } from '../../builder';
import { suggestSelectors, suggestItems } from '../suggests';

export const giveCmd = command('give')
    .then(
        argument('<player>', suggestSelectors())
            .then(
                argument('<item>', suggestItems())
                    .then(
                        optional('[amount]').then(
                            optional('[data]').then(
                                greedy('[dataTag]')
                            )
                        )
                    )
            )
    );
