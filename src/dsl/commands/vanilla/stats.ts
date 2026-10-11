/**
 * /stats —— wiki（Commands/stats，2018-05 修订）Java Edition 原文：
 *   stats block  <x> <y> <z> clear <stat>
 *   stats block  <x> <y> <z> set <stat> <selector> <objective>
 *   stats entity <selector2> clear <stat>
 *   stats entity <selector2> set <stat> <selector> <objective>
 *
 * ⚠️ `clear` 分支**也要接 `<stat>`** —— 此前只写了 literal('clear')，
 *    于是 `stats block 1 2 3 clear AffectedBlocks` 被误判多余参数。
 */
import { command, literal, argument } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestScoreboards } from '../suggests';

/** clear <stat> | set <stat> <selector> <objective> */
function tail() {
    return [
        literal('clear').then(argument('<stat>')),
        literal('set')
            .then(argument('<stat>')
                .then(argument('<selector>', suggestSelectors())
                    .then(argument('<objective>', suggestScoreboards()))
                )
            ),
    ];
}

const entityStats = literal('entity')
    .then(
        argument('<selector2>', suggestSelectors())
            .then(...tail())
    );

const blockStats = literal('block')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(...tail())
                )
            )
    );

export const statsCmd = command('stats')
    .then(entityStats, blockStats);
