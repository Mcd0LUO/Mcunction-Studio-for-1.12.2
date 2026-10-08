/**
 * /kill [player|entity]
 *
 * 已核对 wiki（Commands/kill，2018-05-09 修订）原文：
 *   kill [player|entity]     ← 方括号 = **可选**
 * 且明确注明 "If not specified, defaults to the command's user"
 * 与 "(optional until 1.13)"，即 1.13 起才改为必填。
 *
 * ⚠️ 早先写成必填 argument('<target>')，对 1.12.2 而言会把合法的
 *    命令方块 `kill`（无参）判成缺参数。用 optional() 表达，
 *    并在注释里钉住"仅 1.12.2 可省略"这一版本差异，避免后人"修正"回去。
 */
import { command, optional } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestSelectors } from '../suggests';

export const killCmd: RootNode = command('kill')
    .then(optional('[player|entity]', suggestSelectors()));