import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { ParticleNames } from '../../utils/EnumLib';
import { BaseCompletionProvider } from "../Base";

export class ParticleCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'particle';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        let result: vscode.CompletionItem[] = [];
        switch (commands.length) {
            case 2:
                for (const particle of ParticleNames.all) {
                    result.push(this.createCompletionItem(particle.name, particle.desc, particle.name , true, vscode.CompletionItemKind.Class));
                }
                break;
            case 3:
            case 4:
            case 5:
                return this.provideCoordinateCompletions(true);
            case 6:
            case 7:
            case 8:
                result.push(this.createCompletionItem("<value>","偏移量x | y | z", "", true,vscode.CompletionItemKind.Value));
                break;
            case 9:
                result.push(this.createCompletionItem("<value>","粒子速度", "", true,vscode.CompletionItemKind.Value));
                break;
            case 10:
                result.push(this.createCompletionItem("<value>","粒子数量", "", true,vscode.CompletionItemKind.Value));
                break;
            case 11:
                result.push(this.createCompletionItem("normal","普通", "normal ", true,vscode.CompletionItemKind.Keyword));
                result.push(this.createCompletionItem("force","强制", "force ", true,vscode.CompletionItemKind.Keyword));
                break;
            case 12:
                return this.provideSelectorCompletions(commands[11]);
            case 13:
                result.push(this.createCompletionItem("<value>","参数","",));
        }

        return result;

    }
}