import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, Position, TextDocument } from "vscode";
import { MacroRegistry } from "../../macro/MacroRegistry";
import { BaseCompletionProvider } from "../Base";
import { MinecraftCompletionProvider } from "../Minecraft";
import * as vscode from 'vscode';
import { MacroApply } from "../../macro/MacroaApply";

export class MacroCompletionProvider {
    protected commandKeyword: string = '$';

    private static instance: MacroCompletionProvider;
    private completionCreator: CallableFunction = MinecraftCompletionProvider.instance.createCompletionItem;

    public static getInstance(): MacroCompletionProvider {
        if (!MacroCompletionProvider.instance) {
            MacroCompletionProvider.instance = new MacroCompletionProvider();
        }
        return MacroCompletionProvider.instance;
    }

    public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext, text: string): Promise<CompletionItem[]> {
        const args: string[] = [];

        return [];
    }


    /**
     * 极简版：传入自定义正则 + 原生API获取精准Range
     * @param document 文本文档
     * @param position 光标位置
     * @param customRegex 自定义正则（默认：匹配非(、,、，、空格、)、）的单个参数）
     * @returns vscode.Range | undefined 精准Range（空参数返回光标位置的空Range）
     */
    private getExactParamRange(
        document: vscode.TextDocument,
        position: vscode.Position,
        // 默认正则：匹配「非(、,、，、空格、)、）」的单个参数（\b保证单词边界）
        customRegex: RegExp = /\b[^(,，\s)\）]+\b/
    ): vscode.Range | undefined {
        // 1. 规范位置对象（你的核心写法）
        const adjustedPosition = position.with(position.line, position.character);

        // 2. 仅调用VS Code原生API：直接传入自定义正则
        let paramRange = document.getWordRangeAtPosition(adjustedPosition, customRegex);

        // 3. 空参数场景：返回光标位置的空Range（补全时替换空位置）
        if (!paramRange) {
            paramRange = new vscode.Range(adjustedPosition, adjustedPosition);
        }

        return paramRange;
    }
}
