import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';
import { NBTUtils } from "../../../utils/nbt/NBTUtils";



export class EntitydataCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'entitydata';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

    switch (commands.length) {
            case 2:
                return this.provideSelectorCompletions(commands[1]);
            case 3:
                if (commands[2].startsWith("{")) {
                    return NBTUtils.provideEntityNBTCompletions(this.createCompletionItem);
                }
}


        return [];
    }
}