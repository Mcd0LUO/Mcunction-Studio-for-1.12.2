/**
 * /testforblock <x> <y> <z> <block> [dataValue|state] [dataTag]
 *
 * wiki（Commands/testforblock，2018-05 修订）原文：
 *   testforblock <x> <y> <z> <block> [dataValue|state] [dataTag]
 */
import { command, argument, optional, greedy } from '../../builder';
import { suggestCoordinates, suggestBlocks } from '../suggests';

export const testforblockCmd = command('testforblock')
    .then(
        argument('<x>', suggestCoordinates())
            .then(argument('<y>', suggestCoordinates())
                .then(argument('<z>', suggestCoordinates())
                    .then(argument('<block>', suggestBlocks())
                        .then(optional('[dataValue]')
                            .then(greedy('[dataTag]'))
                        )
                    )
                )
            )
    );
