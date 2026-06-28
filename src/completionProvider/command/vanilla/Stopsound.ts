import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import * as vscode from "vscode";
import { BaseCompletionProvider } from '../../Base';
import { SoundNames } from '../../../utils/EnumLib';



export class StopsoundCompletionProvider extends BaseCompletionProvider {
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        if (commands.length === 2) {
            return this.ctx.selectors(commands[1]);
        }
        if (commands.length === 3) {
            return [
                // ambient, block, hostile, master, music, neutral, player, record, voice, weather
                this.ctx.item('music', '音乐音量', 'music'),
                this.ctx.item('record', '录音音量', 'record'),
                this.ctx.item('weather', '天气音量', 'weather'),
                this.ctx.item('block', '方块音量', 'block'),
                this.ctx.item('hostile', '敌对音量', 'hostile'),
                this.ctx.item('neutral', '中立音量', 'neutral'),
                this.ctx.item('player', '玩家音量', 'player'),
                this.ctx.item('ambient', '环境音量', 'ambient'),
                this.ctx.item('voice', '语音音量', 'voice'),
                this.ctx.item('master', '主音量', 'master'),

            ];
        }
        if (commands.length === 4) {
            return SoundNames.all.map(sound => this.ctx.item(
                sound.name, sound.desc, sound.name, false, vscode.CompletionItemKind.Reference
            ));
        }


        return [];
    }
}