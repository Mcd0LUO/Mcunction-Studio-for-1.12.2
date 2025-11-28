import { TextDocument, Position, CompletionItem, CancellationToken, CompletionContext } from "vscode";
import { BaseCompletionProvider } from "./Base";

export class MinecraftCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = "null";
    public async provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): Promise<CompletionItem[]> {
        return [];
    }

    public static instance: MinecraftCompletionProvider = new MinecraftCompletionProvider();


}