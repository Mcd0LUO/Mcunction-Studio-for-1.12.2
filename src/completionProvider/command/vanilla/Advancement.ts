import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { DataLoader } from "../../../core/DataLoader";
import { BaseCompletionProvider } from "../../Base";

export class AdvancementCompletionProvider extends BaseCompletionProvider {
    public provideCommandCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
        commands: string[]
    ): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.ctx.item('grant', '授予', 'grant '),
                this.ctx.item('revoke', '撤销', 'revoke '),
                this.ctx.item('test', '检测', 'test '),
            ];
        }
        if (commands.length === 3) {
            return this.ctx.selectors(commands[2]);
        }
        if (commands.length === 4) {
            if (["grant","revoke"].includes(commands[1])) {
                return [
                    this.ctx.item('only',"仅",'only ',true),
                    this.ctx.item('from',"DFS递归移除本目录以及下游目录进度",'from ',true),
                    this.ctx.item('through',"递归移除本目录所处所有上下游目录进度",'through ',true),
                    this.ctx.item('everything',"移除所有进度",'everything ',true),
                ];
            }
            if (commands[1] === "test") {
                return this.createAdvancementCompletion(commands[3],document,position);
            }
        }
        if (commands.length === 5 && ['grant', 'revoke'].includes(commands[1])) {
            return this.createAdvancementCompletion(commands[4],document,position);
        }
        if (commands.length === 5 && "test" === commands[1]) {
            return [];
        }

        return [];
    } 

    private createAdvancementCompletion(word:string ,document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        //获取进度路径首在本文件的pos
        let pos = position.with(position.line, position.character - word.length);
        //获取进度路径的范围
        const wordRange = document.getWordRangeAtPosition(pos);
        // console.log(this.functionPaths);
        return DataLoader.getInstance().getAdvancementResNames().map(path => {
            const item = this.ctx.item(path, '进度路径', path , false, vscode.CompletionItemKind.Function);
            //修改覆盖
            if (wordRange) {
            item.range = wordRange;
            }
            return item;
            }
        );
        
    }

}