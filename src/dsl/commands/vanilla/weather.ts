/**
 * 1.12.2:
 *   /weather <clear|rain|thunder> [duration]
 *
 * 注意：这里用 literal 而非 argument+suggest。
 * 若写成 argument('<type>', suggestWeatherTypes())，输入 `weather clear` 时
 * token 匹配不到任何 literal → 被 argument 兜底消费 → suggest 再跑一遍同一个
 * 函数 → 用户输入了 clear 仍被提示 clear，且无法下钻到 [duration]。
 */
import { command, literal, optional } from '../../builder';
import { RootNode } from '../../nodes';

export const weatherCmd: RootNode = command('weather')
    .then(
        literal('clear').then(optional('[duration]')),
        literal('rain').then(optional('[duration]')),
        literal('thunder').then(optional('[duration]'))
    );
