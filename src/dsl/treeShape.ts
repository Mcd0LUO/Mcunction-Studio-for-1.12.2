/**
 * 命令树结构快照 — 用于基准测试与 diff。
 * 只保留语法形状（kind / name / optional / children），忽略 suggest 实现。
 */
import { CommandNode, RootNode, LiteralNode, ArgumentNode, JumpNode } from './nodes';

/** 可 JSON 序列化的树节点 */
export interface TreeShape {
    kind: string;
    name?: string;
    optional?: boolean;
    levels?: number;
    children: TreeShape[];
}

/** 将任意 CommandNode 转为结构快照 */
export function toTreeShape(node: CommandNode): TreeShape {
    const shape: TreeShape = {
        kind: node.kind,
        children: node.children.map(toTreeShape),
    };

    switch (node.kind) {
        case 'root':
            shape.name = (node as RootNode).commandName;
            break;
        case 'literal':
            shape.name = (node as LiteralNode).literal;
            break;
        case 'argument':
            shape.name = (node as ArgumentNode).argName;
            if (node.optional) {
                shape.optional = true;
            }
            break;
        case 'jump':
            shape.levels = (node as JumpNode).levels;
            break;
        case 'forward_root':
            break;
        default:
            break;
    }

    return shape;
}

/** 稳定 JSON（便于快照对比） */
export function shapeToJson(shape: TreeShape, space = 2): string {
    return JSON.stringify(shape, null, space);
}

export interface ShapeDiff {
    path: string;
    kind: 'missing' | 'extra' | 'mismatch';
    expected?: unknown;
    actual?: unknown;
    message: string;
}

/**
 * 深度对比两棵 TreeShape。
 * children 按「签名」对齐：literal/argument 用 name，其余用 kind+index。
 */
export function diffTreeShape(
    expected: TreeShape,
    actual: TreeShape,
    path: string = '$',
): ShapeDiff[] {
    const diffs: ShapeDiff[] = [];

    if (expected.kind !== actual.kind) {
        diffs.push({
            path,
            kind: 'mismatch',
            expected: expected.kind,
            actual: actual.kind,
            message: `kind: expected "${expected.kind}", got "${actual.kind}"`,
        });
        return diffs;
    }

    if ((expected.name ?? null) !== (actual.name ?? null)) {
        diffs.push({
            path,
            kind: 'mismatch',
            expected: expected.name,
            actual: actual.name,
            message: `name: expected ${JSON.stringify(expected.name)}, got ${JSON.stringify(actual.name)}`,
        });
    }

    const expOpt = !!expected.optional;
    const actOpt = !!actual.optional;
    if (expOpt !== actOpt) {
        diffs.push({
            path,
            kind: 'mismatch',
            expected: expOpt,
            actual: actOpt,
            message: `optional: expected ${expOpt}, got ${actOpt}`,
        });
    }

    if (expected.kind === 'jump') {
        const el = expected.levels ?? 1;
        const al = actual.levels ?? 1;
        if (el !== al) {
            diffs.push({
                path,
                kind: 'mismatch',
                expected: el,
                actual: al,
                message: `levels: expected ${el}, got ${al}`,
            });
        }
    }

    const expChildren = expected.children ?? [];
    const actChildren = actual.children ?? [];
    const usedActual = new Set<number>();

    for (let i = 0; i < expChildren.length; i++) {
        const exp = expChildren[i];
        const matchIdx = findChildIndex(actChildren, exp, usedActual);
        const childPath = `${path}/${childKey(exp, i)}`;

        if (matchIdx === -1) {
            diffs.push({
                path: childPath,
                kind: 'missing',
                expected: summarize(exp),
                message: `missing child ${childKey(exp, i)}`,
            });
            continue;
        }
        usedActual.add(matchIdx);
        diffs.push(...diffTreeShape(exp, actChildren[matchIdx], childPath));
    }

    for (let j = 0; j < actChildren.length; j++) {
        if (usedActual.has(j)) {
            continue;
        }
        const act = actChildren[j];
        diffs.push({
            path: `${path}/${childKey(act, j)}`,
            kind: 'extra',
            actual: summarize(act),
            message: `extra child ${childKey(act, j)}`,
        });
    }

    return diffs;
}

function childKey(node: TreeShape, index: number): string {
    if (node.name) {
        return `${node.kind}:${node.name}`;
    }
    return `${node.kind}#${index}`;
}

function childSignature(node: TreeShape): string {
    if (node.kind === 'literal' || node.kind === 'argument' || node.kind === 'root') {
        return `${node.kind}:${node.name ?? ''}`;
    }
    if (node.kind === 'jump') {
        return `jump:${node.levels ?? 1}`;
    }
    return node.kind;
}

function findChildIndex(
    children: TreeShape[],
    target: TreeShape,
    used: Set<number>,
): number {
    const sig = childSignature(target);
    for (let i = 0; i < children.length; i++) {
        if (used.has(i)) {
            continue;
        }
        if (childSignature(children[i]) === sig) {
            return i;
        }
    }
    return -1;
}

function summarize(node: TreeShape): string {
    const opt = node.optional ? '?' : '';
    const name = node.name ? ` ${node.name}` : '';
    return `${node.kind}${name}${opt} (${node.children?.length ?? 0} children)`;
}

/** 格式化 diff 列表为可读报告 */
export function formatShapeDiffs(commandName: string, diffs: ShapeDiff[]): string {
    if (diffs.length === 0) {
        return `[OK] ${commandName}`;
    }
    const lines = [`[DIFF] ${commandName} (${diffs.length} issue(s))`];
    for (const d of diffs) {
        lines.push(`  - [${d.kind}] ${d.path}: ${d.message}`);
    }
    return lines.join('\n');
}
