import { TextDocument, Position, CancellationToken, CompletionContext, CompletionItem } from "vscode";
import { BaseCompletionProvider } from '../Base';



export class StopsoundCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword: string = 'playsound';
    protected provideCommandCompletions(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, commands: string[]): CompletionItem[] | Promise<CompletionItem[]> {

        if (commands.length === 2) {
            return this.provideSelectorCompletions(commands[1]);
        }
        if (commands.length === 3) {
            return [
                // ambient, block, hostile, master, music, neutral, player, record, voice, weather
                this.createCompletionItem('music', '音乐音量', 'music'),
                this.createCompletionItem('record', '录音音量', 'record'),
                this.createCompletionItem('weather', '天气音量', 'weather'),
                this.createCompletionItem('block', '方块音量', 'block'),
                this.createCompletionItem('hostile', '敌对音量', 'hostile'),
                this.createCompletionItem('neutral', '中立音量', 'neutral'),
                this.createCompletionItem('player', '玩家音量', 'player'),
                this.createCompletionItem('ambient', '环境音量', 'ambient'),
                this.createCompletionItem('voice', '语音音量', 'voice'),
                this.createCompletionItem('master', '主音量', 'master'),

            ];
        }
        if (commands.length === 4) {
            return this.provideSoundsCompletions();
        }


        return [];
    }
}