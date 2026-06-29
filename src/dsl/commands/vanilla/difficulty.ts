/** /difficulty <level> */
import { command, argument } from '../../builder';
import { RootNode } from '../../nodes';
import { suggestDifficulties } from '../suggests';

export const difficultyCmd: RootNode = command('difficulty')
    .then(argument('<level>', suggestDifficulties()));
