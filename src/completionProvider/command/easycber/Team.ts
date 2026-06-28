import * as vscode from 'vscode';
import { BaseCompletionProvider } from '../../Base';

export class TeamCompletionProvider extends BaseCompletionProvider {
    protected commandKeyword = 'team';

    public async provideCommandCompletions(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext, commands: string[]): Promise<vscode.CompletionItem[]> {

        if (commands.length === 2) {
            return [
                this.createCompletionItem("add", "添加队伍", "add", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("remove", "删除队伍", "remove", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("join", "将实体加入队伍", "join", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("leave", "将实体移出队伍", "leave", true, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("clear", "清空队伍成员", "clear", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("list", "列出队伍", "list", false, vscode.CompletionItemKind.Keyword),
                this.createCompletionItem("option", "设置队伍选项", "option", true, vscode.CompletionItemKind.Keyword),
            ];
        }

        const subCmd = commands[1];

        // add <name> / remove <name> / join <name> / clear <name> / list [name]
        if (["add", "remove", "join", "clear", "list"].includes(subCmd) && commands.length === 3) {
            return this.provideTeamCompletions(this.getWordRange(document, position, commands[2].length));
        }

        // add <name> <"显示名">
        if (subCmd === "add" && commands.length === 4) {
            return [
                this.createCompletionItem('"<显示名>"', "队伍显示名称（支持颜色代码 &）", '"', true, vscode.CompletionItemKind.Value),
            ];
        }

        // join <name> <sel>
        if (subCmd === "join" && commands.length === 4) {
            return this.provideSelectorCompletions(commands[3]);
        }

        // leave <sel>
        if (subCmd === "leave" && commands.length === 3) {
            return this.provideSelectorCompletions(commands[2]);
        }

        // list [name] — handled above at length 3

        // ---- option <name> <key> [value] ----
        if (subCmd === "option") {
            return this.handleOption(document, position, commands);
        }

        return [];
    }

    private handleOption(document: vscode.TextDocument, position: vscode.Position, commands: string[]): vscode.CompletionItem[] {
        // option <name> <key>
        if (commands.length === 3) {
            return this.provideOptionKeys();
        }

        const optKey = commands[2];

        // option <name> <key> <value>
        if (commands.length === 4) {
            return this.provideOptionValue(optKey);
        }

        return [];
    }

    /**
     * 选项键（含别名）
     * color/colour/col, prefix, suffix,
     * friendlyfire/ff, seefriendly/sf,
     * nametag/nt, deathmsg/dm, collision
     */
    private provideOptionKeys(): vscode.CompletionItem[] {
        return [
            this.createCompletionItem("color", "队伍颜色", "color", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("colour", "队伍颜色（别名）", "colour", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("col", "队伍颜色（别名）", "col", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("prefix", "队伍前缀（支持 & 颜色代码）", "prefix", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("suffix", "队伍后缀（支持 & 颜色代码）", "suffix", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("friendlyfire", "友军伤害", "friendlyfire", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("ff", "友军伤害（别名）", "ff", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("seefriendly", "看到隐身队友", "seefriendly", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("sf", "看到隐身队友（别名）", "sf", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("nametag", "名称标签可见性", "nametag", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("nt", "名称标签可见性（别名）", "nt", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("deathmsg", "死亡消息可见性", "deathmsg", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("dm", "死亡消息可见性（别名）", "dm", true, vscode.CompletionItemKind.Property),
            this.createCompletionItem("collision", "碰撞规则", "collision", true, vscode.CompletionItemKind.Property),
        ];
    }

    /**
     * 根据选项键返回可用的值
     */
    private provideOptionValue(optKey: string): vscode.CompletionItem[] {
        // color / colour / col → 颜色列表
        if (["color", "colour", "col"].includes(optKey)) {
            return [
                this.createCompletionItem("red", "红色", "red", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("blue", "蓝色", "blue", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("green", "绿色", "green", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("yellow", "黄色", "yellow", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("white", "白色", "white", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("black", "黑色", "black", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("gray", "灰色", "gray", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_gray", "深灰色", "dark_gray", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("light_gray", "浅灰色", "light_gray", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("aqua", "青色", "aqua", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_aqua", "深青色", "dark_aqua", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_blue", "深蓝色", "dark_blue", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_green", "深绿色", "dark_green", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_purple", "深紫色", "dark_purple", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("dark_red", "深红色", "dark_red", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("gold", "金色", "gold", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("pink", "粉色", "pink", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("purple", "紫色", "purple", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("reset", "重置颜色", "reset", false, vscode.CompletionItemKind.Enum),
            ];
        }

        // prefix / suffix → 带引号的字符串
        if (["prefix", "suffix"].includes(optKey)) {
            return [
                this.createCompletionItem('"<值>"', '文本内容（支持 & 颜色代码，如 "&c[VIP] &f"）', '"', false, vscode.CompletionItemKind.Value),
            ];
        }

        // friendlyfire / ff / seefriendly / sf → true|false
        if (["friendlyfire", "ff", "seefriendly", "sf"].includes(optKey)) {
            return [
                this.createCompletionItem("true", "开启", "true", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("false", "关闭", "false", false, vscode.CompletionItemKind.Enum),
            ];
        }

        // nametag / nt / deathmsg / dm → always|hideForOtherTeams|hideForOwnTeam|never
        if (["nametag", "nt", "deathmsg", "dm"].includes(optKey)) {
            return [
                this.createCompletionItem("always", "总是可见", "always", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("hideForOtherTeams", "对其他队伍隐藏", "hideForOtherTeams", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("hideForOwnTeam", "对自身队伍隐藏", "hideForOwnTeam", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("never", "从不可见", "never", false, vscode.CompletionItemKind.Enum),
            ];
        }

        // collision → always|pushOtherTeams|pushOwnTeam|never
        if (optKey === "collision") {
            return [
                this.createCompletionItem("always", "总是碰撞", "always", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("pushOtherTeams", "碰撞其他队伍", "pushOtherTeams", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("pushOwnTeam", "碰撞自身队伍", "pushOwnTeam", false, vscode.CompletionItemKind.Enum),
                this.createCompletionItem("never", "从不碰撞", "never", false, vscode.CompletionItemKind.Enum),
            ];
        }

        return [];
    }
}
