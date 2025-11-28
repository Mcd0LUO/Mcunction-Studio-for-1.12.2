import * as vscode from 'vscode';

/**
 * 代码透镜提供器（示例：function命令的快捷操作）
 */
class McFunctionCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        // // 遍历所有行，识别function命令
        // for (let line = 0; line < document.lineCount; line++) {
        //     const lineText = document.lineAt(line).text;
        //     const functionMatch = lineText.match(/function\s+(\w+:\w+)/);

        //     if (functionMatch) {
        //         const funcPath = functionMatch[1];
        //         const range = new vscode.Range(line, 0, line, lineText.length);

        //         // 1. 运行函数的透镜
        //         const runLens = new vscode.CodeLens(range, {
        //             title: `▶️ 运行 ${funcPath}`,
        //             command: 'mcfunction.runFunction',
        //             arguments: [funcPath]
        //         });
        //         codeLenses.push(runLens);

        //         // 2. 查看引用的透镜
        //         const refLens = new vscode.CodeLens(range, {
        //             title: `🔍 查看引用`,
        //             command: 'mcfunction.findReferences',
        //             arguments: [funcPath]
        //         });
        //         // 自定义透镜位置（行尾）
        //         refLens.range = new vscode.Range(line, lineText.length, line, lineText.length);
        //         codeLenses.push(refLens);
        //     }
        // }

        return codeLenses;
    }
}

// 注册CodeLens + 注册透镜触发的命令
export function registerCodeLens() {
    // 注册CodeLens提供器
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'mcfunction', scheme: 'file' },
        new McFunctionCodeLensProvider()
    );

    // // 注册“运行函数”命令
    // const runFuncDisposable = vscode.commands.registerCommand('mcfunction.runFunction', (funcPath) => {
    //     vscode.window.showInformationMessage(`正在运行函数：${funcPath}`);
    //     // 这里可扩展实际运行逻辑（如调用Minecraft命令）
    // });

    // // 注册“查看引用”命令
    // const findRefDisposable = vscode.commands.registerCommand('mcfunction.findReferences', (funcPath) => {
    //     vscode.window.showInformationMessage(`查找 ${funcPath} 的引用...`);
    //     // 这里可扩展查找引用的逻辑
    // });

    return [codeLensDisposable];
}