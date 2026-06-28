import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';

export class EffectCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {
        
        
        if (commands.length === 2) {
            return this.ctx.selectors(commands[1]);
        }
        if (commands.length === 3) {
            return [
                this.ctx.item("absorption", "伤害吸收", "absorption ", true, vscode.CompletionItemKind.Class),
                this.ctx.item('blindness', '失明', 'blindness ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('fire_resistance', '火焰抗性', 'fire_resistance ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('glowing', '发光', 'glowing ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('haste', '急迫', 'haste ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('health_boost', '生命提升', 'health_boost ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('hunger', '饥饿', 'hunger ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('instant_damage', '瞬间伤害', 'instant_damage ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('instant_health', '瞬间伤害', 'instant_health ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('invisibility', '隐形', 'invisibility ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('jump_boost', '跳跃提升', 'jump_boost ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('levitation', '飘浮', 'levitation ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('luck', '幸运', 'luck ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('mining_fatigue', '挖掘疲劳', 'mining_fatigue ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('nausea', '反胃', 'nausea ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('night_vision', '夜视', 'night_vision ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('poison', '中毒', 'poison ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('regeneration', '生命恢复', 'regeneration ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('resistance', '抗性提升', 'resistance ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('saturation', '饱和度', 'saturation ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('slowness', '缓慢', 'slowness ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('speed', '速度提升', 'speed ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('strength', '力量提升', 'strength ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('unluck', '霉运', 'unluck ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('water_breathing', '水下呼吸', 'water_breathing ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('weakness', '虚弱', 'weakness ', true, vscode.CompletionItemKind.Class),
                this.ctx.item('wither', '凋零', "wither ",true, vscode.CompletionItemKind.Class)

            ];

        }
        if (commands.length === 4) {
            return [this.ctx.item("<value>", "持续时间", "", true, vscode.CompletionItemKind.Constant)];
        }
        if (commands.length === 5) {
            return [this.ctx.item("<value>", "效果等级[从0开始计数]", "", true, vscode.CompletionItemKind.Constant)];
        }


        return [];
    } 
}