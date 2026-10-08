/**
 * /say <message …>
 *
 * 已核对 wiki（Commands/say，2018-05-09 修订，1.12.2 发布前）原文：
 *   say <message …>
 * 末尾的省略号表示**贪婪参数**——消息吃掉其后所有以空格分隔的词，
 * 因此 `say hello world` 是完全合法的。
 *
 * ⚠️ 早先这里是空节点 `command('say')`，导致引擎把消息里的每个词都当作
 *    「未消费的 token」：补全时 `say |` 没有任何提示，
 *    诊断层上线后更是会把所有正常的 say 命令判成语法错误。
 *    故改为显式的贪婪参数节点。
 */
import { command, greedy } from '../../builder';

export const sayCmd = command('say')
    .then(greedy('<message>'));