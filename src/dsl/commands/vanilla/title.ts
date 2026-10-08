/**
 * /title <target> clear|reset|title|subtitle|actionbar|times ...
 * 1.12.2
 *
 * 已核对 wiki（Commands/title，2018-05-09 修订）原文，Java 版六种变体：
 *   title <player> clear
 *   title <player> reset
 *   title <player> title     <raw json title …>
 *   title <player> subtitle  <raw json title …>
 *   title <player> actionbar <raw json title …>
 *   title <player> times     <fadeIn> <stay> <fadeOut>
 *
 * 三个 raw json 参数同样是**贪婪**的（wiki 写作 <raw json title …>）：
 * `title @s title {"text":"a b c"}` 里的 JSON 内部含空格，
 * 诊断分词时会被引号保护，但多词裸文本亦属合法，故按贪婪处理更稳。
 */
import { command, argument, literal, greedy } from '../../builder';
import { suggestSelectors } from '../suggests';

export const titleCmd = command('title')
    .then(
        argument('<target>', suggestSelectors())
            .then(
                literal('clear'),
                literal('reset'),
                literal('title').then(greedy('<raw json title>')),
                literal('subtitle').then(greedy('<raw json title>')),
                literal('actionbar').then(greedy('<raw json title>')),
                literal('times').then(
                    argument('<fadeIn>').then(
                        argument('<stay>').then(
                            argument('<fadeOut>'),
                        ),
                    ),
                ),
            ),
    );