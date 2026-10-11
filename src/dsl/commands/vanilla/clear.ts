/**
 * /clear [player] [item] [data] [maxCount] [dataTag]
 *
 * wiki（Commands/clear，2018-05 修订）Java Edition 原文：
 *   clear [player] [item] [data] [maxCount] [dataTag]
 * **五个参数全部可选** —— `/clear` 不带参数即清空执行者全部背包。
 * （`clear [<targets>] [<item>] [<count>]` 标了 upcoming ver=1.13，不建模）
 */
import { command, optional, greedy } from '../../builder';
import { suggestSelectors, suggestItems } from '../suggests';

export const clearCmd = command('clear')
    .then(
        optional('[player]', suggestSelectors())
            .then(
                optional('[item]', suggestItems())
                    .then(
                        optional('[data]')
                            .then(
                                optional('[maxCount]')
                                    .then(greedy('[dataTag]'))
                            )
                    )
            )
    );
