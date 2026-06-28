import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';
import { NbtAst } from '../../../utils/nbt/NbtAst';
import { NbtAstLiteralNode } from '../../../utils/nbt/NbtAstNode';
import { NbtTokenizer } from '../../../utils/nbt/NbtTokenizer';
import { NBTUtils } from '../../../utils/nbt/NBTUtils';

export class SummonCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[], full_text: string): CompletionItem[] | Promise<CompletionItem[]> {

        if (commands.length === 2) {
            return this.provideEntityTypeCompletions();
        }

        if (commands.length >= 3 && commands.length <= 5) {
            return this.provideCoordinateCompletions();
        }

        if (commands.length === 6) {
            return this.provideEntityNbt(commands[5]);
        }
        return [];
    }

    private provideEntityNbt(nbt: string): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {
        const ast = new NbtAst(nbt);
        const tokens = ast.getTokens();
        const lastKeyNode = ast.getLastKeyValue();
        if (!lastKeyNode) { return []; }
        if (lastKeyNode.key === 'Tags') {
            if (!lastKeyNode.value.children) { return []; }
            const tagsArrNode = lastKeyNode.value.children;
            const last_tag = tagsArrNode.at(-1) as NbtAstLiteralNode;
            if (last_tag.value === '""') {
                return this.provideTagCompletions();
            } else if (NbtTokenizer.isTokenInIdentifierRange(tokens, tokens.length - 1, lastKeyNode.start)) {
                return this.provideTagCompletions(undefined, true);
            }
        }
        return NBTUtils.provideEntityNBTCompletions(this.createCompletionItem);
    }
}