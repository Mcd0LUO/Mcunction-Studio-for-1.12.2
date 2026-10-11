/**
 * /scoreboard —— 1.12.2 完整语法
 *
 * 逐行对照 wiki（Scoreboard#Command reference，2018-05-26 修订：
 * 1.12.2 已发布、1.13 未发布）抄录，**不凭印象**：
 *
 *   objectives list
 *   objectives add <name> <criteria> [display name...]
 *   objectives remove <name>
 *   objectives setdisplay <slot> [objective]              ← objective 可选
 *
 *   players list [entity]
 *   players set    <entity> <objective> <score> [dataTag]  ← dataTag 是 NBT
 *   players add    <entity> <objective> <count> [dataTag]
 *   players remove <entity> <objective> <count> [dataTag]
 *   players reset  <entity> [objective]                    ← objective 可选
 *   players enable <entity> <trigger>
 *   players test   <entity> <objective> <min> [max]
 *   players operation <targetName> <targetObjective> <operation> <selector> <objective>
 *
 *   players tag <entity> add    <tagName> [dataTag]
 *   players tag <entity> remove <tagName> [dataTag]
 *   players tag <entity> list
 *
 *   teams list [teamname]
 *   teams add <name> [display name...]
 *   teams remove <name>
 *   teams empty  <name>
 *   teams join   <team> [entities...]                      ← entities 可选且变长
 *   teams leave  [entities...]
 *   teams option <team> color                  <value>
 *   teams option <team> friendlyfire           <true|false>
 *   teams option <team> seeFriendlyInvisibles  <true|false>
 *   teams option <team> nametagVisibility      <never|hideForOtherTeams|hideForOwnTeam|always>
 *   teams option <team> deathMessageVisibility <同上>
 *   teams option <team> collisionRule          <always|never|pushOwnTeam|pushOtherTeams>
 *
 * ⚠️ 四处曾写错/漏掉，全靠 wiki 原文才查出来：
 *   1. `[dataTag]`（NBT）尾巴：set / add / remove / tag add / tag remove 都有
 *   2. 显示名：`objectives add` 与 `teams add` 都接受 `[display name...]`（可多词）
 *   3. `players list` / `players test` / `teams list` 三个子命令整个漏了
 *   4. `teams option` 的选项名是 **friendlyfire**（全小写），此前写成 friendlyFire
 *
 * 变长参数一律用 greedy：既吃掉后续 token（否则多写的词会被诊断误判成"多余参数"，
 * 例如 `set @s obj 1 {a: 1}` 的 `{a:` 与 `1}`），
 * 又能在首个 token 上给候选（`[entities...]` 给选择器列表）。
 *
 * 枚举参数（operation、option 名、选项值）一律用 literal：
 * 用 argument+suggest 会导致输入后仍重复提示自身且无法下钻。
 */
import { command, literal, argument, optional, greedy } from '../../builder';
import { RootNode } from '../../nodes';
import {
    suggestScoreboards, suggestSelectors, suggestTags, suggestTeams, suggestCriteria,
    suggestTeamColors, suggestBoolean, suggestVisibility, suggestCollisionRule,
} from '../suggests';

/**
 * operation 的九个运算符分支。
 *
 * 每个运算符各自挂上 `<selector> <objective>` 尾巴 ——
 * 引擎匹配到 literal 后不会回退到兄弟节点，
 * 若只在父节点挂一次，输入 `+=` 就会停在空叶子上、后续补全为空。
 */
const OPERATION_BRANCHES = [
    '+=', '-=', '*=', '/=', '%=', '=', '<', '>', '><',
].map(op =>
    literal(op).then(
        argument('<selector>', suggestSelectors())
            .then(argument('<objective>', suggestScoreboards())),
    ),
);

export const scoreboardCmd: RootNode = command('scoreboard')
    .then(
        // ============================================================
        // objectives
        // ============================================================
        literal('objectives')
            .then(
                literal('list'),
                literal('add')
                    .then(
                        argument('<name>', suggestScoreboards())
                            .then(
                                argument('<criteria>', suggestCriteria())
                                    // [display name...] 可多词，故 greedy
                                    .then(greedy('[display name...]')),
                            ),
                    ),
                literal('remove')
                    .then(argument('<name>', suggestScoreboards())),
                literal('setdisplay')
                    .then(
                        argument('<slot>')
                            // [objective] 可选：省略即清空该显示位
                            .then(optional('[objective]', suggestScoreboards())),
                    ),
            ),

        // ============================================================
        // players
        // ============================================================
        literal('players')
            .then(
                literal('list').then(optional('[entity]', suggestSelectors())),

                literal('set')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<score>').then(greedy('[dataTag]'))),
                            ),
                    ),
                literal('add')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<count>').then(greedy('[dataTag]'))),
                            ),
                    ),
                literal('remove')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<count>').then(greedy('[dataTag]'))),
                            ),
                    ),

                literal('reset')
                    .then(
                        argument('<entity>', suggestSelectors())
                            // [objective] 可选：省略即清空该实体全部目标
                            .then(optional('[objective]', suggestScoreboards())),
                    ),

                literal('enable')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(argument('<trigger>', suggestScoreboards())),
                    ),

                literal('test')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(
                                argument('<objective>', suggestScoreboards())
                                    .then(argument('<min>').then(optional('[max]'))),
                            ),
                    ),

                literal('operation')
                    .then(
                        argument('<targetName>', suggestSelectors())
                            .then(
                                argument('<targetObjective>', suggestScoreboards())
                                    .then(...OPERATION_BRANCHES),
                            ),
                    ),

                literal('tag')
                    .then(
                        argument('<entity>', suggestSelectors())
                            .then(
                                literal('add')
                                    .then(argument('<tagName>', suggestTags()).then(greedy('[dataTag]'))),
                                literal('remove')
                                    .then(argument('<tagName>', suggestTags()).then(greedy('[dataTag]'))),
                                literal('list'),
                            ),
                    ),
            ),

        // ============================================================
        // teams
        // ============================================================
        literal('teams')
            .then(
                literal('list').then(optional('[teamname]', suggestTeams())),

                literal('add')
                    .then(
                        argument('<name>')
                            // [display name...] 可多词
                            .then(greedy('[display name...]')),
                    ),
                literal('remove').then(argument('<name>', suggestTeams())),
                literal('empty').then(argument('<name>', suggestTeams())),

                // join：<team> 必填，[entities...] 可选且变长
                literal('join')
                    .then(
                        argument('<team>', suggestTeams())
                            .then(greedy('[entities...]', suggestSelectors())),
                    ),
                // leave：[entities...] 整段可选（省略时由执行者自己离开队伍）
                literal('leave')
                    .then(greedy('[entities...]', suggestSelectors())),

                literal('option')
                    .then(
                        argument('<team>', suggestTeams())
                            .then(
                                literal('color').then(argument('<value>', suggestTeamColors())),
                                literal('friendlyfire').then(argument('<value>', suggestBoolean())),
                                literal('seeFriendlyInvisibles').then(argument('<value>', suggestBoolean())),
                                literal('nametagVisibility').then(argument('<value>', suggestVisibility())),
                                literal('deathMessageVisibility').then(argument('<value>', suggestVisibility())),
                                literal('collisionRule').then(argument('<value>', suggestCollisionRule())),
                            ),
                    ),
            ),
    );
