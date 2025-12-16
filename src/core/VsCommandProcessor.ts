import * as vscode from 'vscode';
import { DataLoader } from './DataLoader';
import path from 'path';
import fs from 'fs';
import { MinecraftUtils } from '../utils/MinecraftUtils';
import { CommandUtils } from '../utils/CommandUtils';

export class VsCommandProcessor { 
    public static async createNewFunctionFile(uri: vscode.Uri) {
        // 检查是否打开了工作区
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('请先打开一个工作区文件夹');
            return;
        }

        const targetDir: string = uri.fsPath;

        // 显示输入框，获取用户输入的文件名
        const fileName: string | undefined = await vscode.window.showInputBox({
            placeHolder: '输入文件名（不需要后缀）',
            prompt: '创建新的MCFunction文件',
            validateInput: (value: string): string | null => {
                if (!value) {
                    return '文件名不能为空';
                }
                if (/[<>:"/\\|?*]/.test(value)) {
                    return '文件名包含无效字符';
                }
                if (fs.existsSync(path.join(targetDir, `${value}.mcfunction`))) {
                    return '文件已存在';
                }
                return null;
            }
        });

        if (!fileName) {
            return;
        }

        // 创建文件
        const filePath: string = path.join(targetDir, `${fileName}.mcfunction`);
        const fileUri: vscode.Uri = vscode.Uri.file(filePath);
        // 添加到函数池子
        DataLoader.getInstance().addFunctionRes(fileUri);

        try {
            // 写入空文件并打开
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
            const document: vscode.TextDocument = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        }
        catch (error) {
            vscode.window.showErrorMessage(`创建文件失败：${error}`);
        }
    }

    public static async fastScoreboardDebug(uri: vscode.Uri) {
        const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        if (activeEditor.document.languageId !== 'mcfunction') {
            return;
        }
        const document = activeEditor.document;
        const resName = MinecraftUtils.buildFunctionCall(uri);
        if (!resName) {
            return;
        }
        // 右键位置对应的选区
        const selection = activeEditor.selection;
        // 右键所在的行号
        const lineNumber = selection.active.line;
        // 遍历行获取函数上下文调用的所有记分板
        const scoreboards = new Set<string>();
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text.trimStart();
            if (!lineText.startsWith('scoreboard') && !lineText.startsWith('execute')) {continue;}
            const parts = CommandUtils.extraceActiveCommand(lineText);
            if (parts[1] !== 'players' || parts.length < 5) {continue;}
            if (['add', 'remove', 'set', 'reset',"operation"].includes(parts[2])) {
                scoreboards.add(parts[4]);
                if (parts[2] === 'operation') {
                    scoreboards.add(parts[7]);
                }
            }
        }
        const score_arr = Array.from(scoreboards);
        const groupByTwo = (arr: string[]) => {
            const groups: string[][] = [];
            for (let i = 0; i < arr.length; i += 2) {
                groups.push(arr.slice(i, i + 2));
            }
            return groups;
        };
        const scoreGroups = groupByTwo(score_arr);

        // 2. 生成translate文本（每行两个 %s，不足两个时显示剩余的）
        const translateLines = scoreGroups.map(group => {
            // 每组生成 "xxx %s  yyy %s" 或 "xxx %s"
            return group.map(score => `${score}: %s`).join('  ');
        });
        // 行之间用\n分隔
        const translateText = translateLines.join('\n');

        // 3. with数组
        const withArray = score_arr.map(score => ({
            score: { objective: score, name: "@s" },
            color: "red"
        }));

        // 4. 构建完整的JSON对象
        const tellrawContent = JSON.stringify({
            translate: translateText,
            with: withArray
        });

        // 5. 拼接最终的tellraw命令
        const finalCommand = `tellraw @a ${tellrawContent}`;

        await activeEditor.edit(editBuilder => {
            const insertPosition = new vscode.Position(lineNumber + 1, 0);
            editBuilder.insert(insertPosition, finalCommand + '\n');
        });

        
    }
}