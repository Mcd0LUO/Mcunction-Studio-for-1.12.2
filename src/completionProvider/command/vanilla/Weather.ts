import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

/**
 * Weather命令补全提供者
 * 负责为Minecraft 1.12.2版本的/weather命令提供智能补全功能
 * 
 * 命令语法：
 * /weather clear [duration]
 * /weather rain [duration]
 * /weather thunder [duration]
 * 
 * 参数说明：
 * - clear: 晴天
 * - rain: 雨天
 * - thunder: 雷雨天
 * - duration: 持续时间（可选，默认为300秒）
 */
export class WeatherCompletionProvider extends BaseCompletionProvider {


    /**
     * 提供weather命令的补全项
     * @param commands 已解析的命令片段数组
     * @returns 补全项数组
     */
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        switch (commands.length) {
            case 2:
                // 第二个参数是天气类型
                return [
                    this.ctx.item(
                        'clear', 
                        '晴天', 
                        'clear' , 
                        true, 
                        vscode.CompletionItemKind.Keyword
                    ),
                    this.ctx.item(
                        'rain', 
                        '雨天', 
                        'rain' , 
                        true, 
                        vscode.CompletionItemKind.Keyword
                    ),
                    this.ctx.item(
                        'thunder', 
                        '雷雨天', 
                        'thunder' , 
                        true, 
                        vscode.CompletionItemKind.Keyword
                    )
                ];
            
            case 3:
                // 第三个参数是持续时间（可选）
                return [
                    this.ctx.item(
                        '<duration>', 
                        '持续时间（秒）', 
                        '', 
                        true, 
                        vscode.CompletionItemKind.Value
                    )
                ];
                
            default:
                return [];
        }
    }
}