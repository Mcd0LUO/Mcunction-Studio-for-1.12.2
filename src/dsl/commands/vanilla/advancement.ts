/**
 * /advancement grant|revoke|test …
 *
 * wiki（Commands/advancement，2018-05 修订）Java Edition 原文：
 *   advancement <grant|revoke> <player> only <advancement> [criterion]
 *   advancement <grant|revoke> <player> <until|from|through> <advancement>
 *   advancement <grant|revoke> <player> everything
 *   advancement test <player> <advancement> [criterion]
 *
 * ⚠️ 三处曾写错：
 *   · `until` 漏了（只写了 from / through）
 *   · `only` 与 `test` 尾巴的 `[criterion]` 漏了
 */
import { command, literal, argument, optional } from '../../builder';
import { suggestSelectors, suggestAdvancements } from '../suggests';

/** grant / revoke 共用同一组分支 */
function grantOrRevoke() {
    return argument('<player>', suggestSelectors())
        .then(
            literal('only').then(
                argument('<advancement>', suggestAdvancements())
                    .then(optional('[criterion]')),
            ),
            literal('until').then(argument('<advancement>', suggestAdvancements())),
            literal('from').then(argument('<advancement>', suggestAdvancements())),
            literal('through').then(argument('<advancement>', suggestAdvancements())),
            literal('everything'),
        );
}

export const advancementCmd = command('advancement')
    .then(
        literal('grant').then(grantOrRevoke()),
        literal('revoke').then(grantOrRevoke()),
        literal('test')
            .then(
                argument('<player>', suggestSelectors())
                    .then(
                        argument('<advancement>', suggestAdvancements())
                            .then(optional('[criterion]')),
                    ),
            )
    );
