/**
 * /execute —— 1.12.2 语法
 *
 * 已核对 wiki（Commands/execute，2018-05-03 修订：1.12.2 已发布、1.13 未发布）原文：
 *
 *   execute <entity> <x> <y> <z> <command …>
 *   execute <entity> <x> <y> <z> detect <x2> <y2> <z2> <block> <dataValue|state> <command …>
 *
 * ⚠️ 三个必须钉住的点（都曾写错）：
 *
 * 1. **`detect` 是 execute 的子语法，不是独立命令。**
 *    Java 1.12.2 没有 `/detect`。wiki 上 Commands/detect 页描述的是
 *    Education Edition 的 Agent 命令 `detect <direction>`（forward/back/left/right/up/down），
 *    与 Java 版毫无关系。早期版本把它注册成了根命令
 *    `/detect <x> <y> <z> <block> <data> <subcommand>` —— 语法和身份都是错的。
 *
 * 2. **没有 1.13 的 `run` 关键字。** 坐标之后直接就是命令本身。
 *
 * 3. 坐标是 `<x> <y> <z>` 一组，detect 形式再加一组 `<x2> <y2> <z2>`。
 */
import { command, argument, literal, forwardRoot } from '../../builder';
import { suggestSelectors, suggestCoordinates, suggestBlocks } from '../suggests';

export const executeCmd = command('execute')
    .then(
        argument('<entity>', suggestSelectors())
            .then(
                argument('<x>', suggestCoordinates())
                    .then(
                        argument('<y>', suggestCoordinates())
                            .then(
                                argument('<z>', suggestCoordinates())
                                    .then(
                                        // ① 直接接命令（1.12.2 无 run）
                                        forwardRoot(),
                                        // ② 条件执行：先检测方块，再执行命令
                                        literal('detect').then(
                                            argument('<x2>', suggestCoordinates())
                                                .then(
                                                    argument('<y2>', suggestCoordinates())
                                                        .then(
                                                            argument('<z2>', suggestCoordinates())
                                                                .then(
                                                                    argument('<block>', suggestBlocks())
                                                                        .then(
                                                                            argument('<dataValue>')
                                                                                .then(forwardRoot())
                                                                        )
                                                                )
                                                        )
                                                )
                                        )
                                    )
                            )
                    )
            )
    );
