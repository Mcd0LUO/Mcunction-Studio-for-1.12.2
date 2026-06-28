import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from 'vscode';
import { BaseCompletionProvider } from "../../Base";

export class WorldborderCompletionProvider extends BaseCompletionProvider {


    public provideCommandCompletions(
        document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]
    ): vscode.CompletionItem[] {
        switch (commands.length) {
            case 2:
                // 提供worldborder的子命令补全
                return [
                    this.ctx.item('add', '增加或减少世界边界的大小', 'add ', true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('set', '设置世界边界的大小', 'set ', true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('center', '设置世界边界的中心点', 'center ', true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('damage', '设置世界边界伤害', 'damage ', true, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('get', '获取当前世界边界的大小', 'get ', false, vscode.CompletionItemKind.Keyword),
                    this.ctx.item('warning', '设置世界边界警告', 'warning ', true, vscode.CompletionItemKind.Keyword)
                ];
            
            case 3:
                // 根据不同的子命令提供不同的补全
                switch (commands[1]) {
                    case 'add':
                    case 'set':
                        // add/set命令需要一个数值参数
                        return [
                            this.ctx.item('<size>', '边界大小（方块数）', '', true, vscode.CompletionItemKind.Value)
                        ];
                    
                    case 'center':
                        // center命令需要x和z坐标
                        return this.ctx.coordinates();
                        
                    case 'damage':
                        // damage命令有amount和buffer两个子选项
                        return [
                            this.ctx.item('amount', '设置每方块伤害值', 'amount ', true, vscode.CompletionItemKind.Keyword),
                            this.ctx.item('buffer', '设置伤害缓冲距离', 'buffer ', true, vscode.CompletionItemKind.Keyword)
                        ];
                        
                    case 'warning':
                        // warning命令有distance和time两个子选项
                        return [
                            this.ctx.item('distance', '设置警告距离', 'distance ', true, vscode.CompletionItemKind.Keyword),
                            this.ctx.item('time', '设置警告时间', 'time ', true, vscode.CompletionItemKind.Keyword)
                        ];
                }
                break;
                
            case 4:
                // 根据不同子命令提供更多参数
                switch (commands[1]) {
                    case 'add':
                    case 'set':
                        // add/set命令的第二个参数是时间（可选）
                        return [
                            this.ctx.item('<time>', '变化所需时间（秒）', '', true, vscode.CompletionItemKind.Value)
                        ];
                        
                    case 'damage':
                        if (commands[2] === 'amount') {
                            return [
                                this.ctx.item('<damage>', '每方块伤害值 初始值:0.2', '', true, vscode.CompletionItemKind.Value)
                            ];
                        } else if (commands[2] === 'buffer') {
                            return [
                                this.ctx.item('<distance>', '缓冲距离', '', true, vscode.CompletionItemKind.Value)
                            ];
                        }
                        break;
                    case 'center':
                        return this.ctx.coordinates();
                        
                    case 'warning':
                        if (commands[2] === 'distance') {
                            return [
                                this.ctx.item('<distance>', '警告距离 初始值:5b', '', true, vscode.CompletionItemKind.Value)
                            ];
                        } else if (commands[2] === 'time') {
                            return [
                                this.ctx.item('<time>', '警告时间（秒） 初始值:15s', '', true, vscode.CompletionItemKind.Value)
                            ];
                        }
                        break;
                }
                break;
        }

        return [];
    }
}