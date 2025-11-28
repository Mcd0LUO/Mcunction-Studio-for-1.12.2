import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../Base';



export class BlockdataCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'blockdata';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

    switch (commands.length) {
            case 2:
            case 3:
            case 4:
                // 处理坐标参数的自动补全
                return this.provideCoordinateCompletions();
            case 5:
                // 处理数据标签参数的自动补全
            return [this.createCompletionItem("{}", "原始json文本","{${1:}}",false)];
}


        return [];
    }
}