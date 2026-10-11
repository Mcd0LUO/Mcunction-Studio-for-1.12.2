/**
 * /setblock <x> <y> <z> <block> [dataValue|state] [oldBlockHandling] [dataTag]
 *
 * wiki（Commands/setblock，2018-05 修订）Java Edition 原文：
 *   setblock <x> <y> <z> <block> [dataValue|state] [oldBlockHandling] [dataTag]
 *
 * ⚠️ 三个尾巴参数**互相独立**，都可以单独省略。引擎不会跳过 optional，
 *    因此不能只把 [dataTag] 挂在最后 —— 必须同时挂到每个 oldBlockHandling
 *    字面量上，否则 `setblock 1 2 3 stone 0 destroy {a:1}` 会被误判多余参数。
 *    同理 `setblock 1 2 3 stone 0 {a:1}`（跳过 oldBlockHandling）也需要
 *    一个与字面量并列的 greedy。
 *
 * 注：`outline` 是 1.13+ 的 oldBlockHandling 取值，1.12.2 只有 destroy/keep/replace。
 */
import { command, argument, literal, optional, greedy } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const setblockCmd = command('setblock')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<block>', suggestBlocks())
                        .then(optional('[dataValue]')
                            .then(
                                literal('destroy').then(greedy('[dataTag]')),
                                literal('keep').then(greedy('[dataTag]')),
                                literal('replace').then(greedy('[dataTag]')),
                                // 跳过 oldBlockHandling 直接写 dataTag
                                greedy('[dataTag]')
                            )
                        )
                    )
                )
            )
    );
