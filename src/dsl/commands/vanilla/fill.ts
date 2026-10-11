/**
 * /fill <x1> <y1> <z1> <x2> <y2> <z2> <block> [dataValue|state] [oldBlockHandling] [dataTag]
 * /fill <x1> <y1> <z1> <x2> <y2> <z2> <block> <dataValue|state> replace [replaceTileName] [replaceDataValue]
 *
 * wiki（Commands/fill，2018-05 修订）Java Edition 原文即上面两行。
 * oldBlockHandling 取值经 Arguments 段核对为：
 *   destroy | hollow | keep | outline | replace
 * （`outline` **是** 1.12.2 的合法取值，不是 1.13 新增 —— 已核对原文）
 *
 * ⚠️ 此前缺两处：
 *   · `[dataTag]` 整个没有（`fill … stone 0 keep {a:1}` 会被误判多余参数）
 *   · replace 的过滤形式 `replace <replaceTileName> [replaceDataValue]` 没有
 *
 * [dataTag] 必须挂到每个 oldBlockHandling 字面量上，并另挂一个并列的 greedy ——
 * 引擎不会跳过 optional，否则省略 oldBlockHandling 时同样会误报。
 */
import { command, argument, literal, optional, greedy } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

/** 各 oldBlockHandling 分支的尾巴：[dataTag] */
const withTag = () => greedy('[dataTag]');

export const fillCmd = command('fill')
    .then(
        argument('<x1>', suggestCoordinates())
            .then(argument('<y1>', suggestCoordinates())
                .then(argument('<z1>', suggestCoordinates())
                    .then(argument('<x2>', suggestCoordinates())
                        .then(argument('<y2>', suggestCoordinates())
                            .then(argument('<z2>', suggestCoordinates())
                                .then(argument('<block>', suggestBlocks())
                                    .then(optional('[dataValue]')
                                        .then(
                                            literal('destroy').then(withTag()),
                                            literal('hollow').then(withTag()),
                                            literal('keep').then(withTag()),
                                            literal('outline').then(withTag()),
                                            // replace 既可以是 oldBlockHandling（后接 dataTag），
                                            // 也可以开启过滤形式（后接被替换的方块名与数据值）
                                            literal('replace').then(
                                                argument('[replaceTileName]', suggestBlocks())
                                                    .then(optional('[replaceDataValue]')),
                                                withTag(),
                                            ),
                                            // 省略 oldBlockHandling，直接写 dataTag
                                            withTag(),
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
    );
