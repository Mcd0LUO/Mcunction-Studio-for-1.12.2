import * as vscode from 'vscode';
import { CommandUtils } from '../utils/CommandUtils';
import { DataLoader } from './DataLoader';
import { CommandInfo, CommandType, McFunctionDefinitionProvider } from './McFunctionDefinitionProvider';
import { MinecraftUtils } from '../utils/MinecraftUtils';

export class McFunctionHoverProvider implements vscode.HoverProvider {

    private readonly performance: string[] = ["bad", "ok", "good", "excellent"];

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        if (!DataLoader.getInstance().getConfig().HoverProvider.SelecterDiagnostics) { return null; }
        // 诊断
        const lineText = document.lineAt(position.line).text;
        const hover = this.provideSelecterDiagnostics(document, position, token, lineText);
        if (hover) {
            return hover;
        }
        const commandInfo = McFunctionDefinitionProvider.instance.parseCommandInfo(lineText, position);
        if (!commandInfo) {
            return null;
        }
        switch (commandInfo.type) {
            case CommandType.Scoreboard:
                return this.provideScoreboardInfo(document, position, token, commandInfo);
            case CommandType.Team:
                return this.provideTeamInfo(document, position, token, commandInfo);
            case CommandType.Function:
                return this.provideFunctionInfo(document, position, token, commandInfo);
        }
        return null;
    }
    provideFunctionInfo(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, commandInfo: CommandInfo): vscode.ProviderResult<vscode.Hover> {
        const markdown = new vscode.MarkdownString();
        const funcData = DataLoader.getInstance().getFunctionData().get(commandInfo.resource);
        if (funcData) {
            const entries = Array.from(funcData.ref.entries()).map(([uri, lines]) => `- [${uri}](${MinecraftUtils.buildFunctionUri(uri)})\n`).join('');
            markdown.appendMarkdown(`### ${commandInfo.resource}\n引用:\n${entries}`) ;
        }
        return new vscode.Hover(markdown);
        
    }
    provideTeamInfo(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, commandInfo: CommandInfo): vscode.ProviderResult<vscode.Hover> {
        return null;
    }
    private provideSelecterDiagnostics(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        lineText: string
    ): vscode.Hover | null {
        const selector = CommandUtils.getCursorFullSelector(lineText, position.character);
        if (!selector) { return null; }
        // 初始化诊断状态
        const diagnostics = {
            selfOnly: selector[1] === 's',
            typeLimit: false,
            chunkLimit: false,
            countLimit: false
        };

        // 解析选择器参数（非@s简单选择器时）
        if (!diagnostics.selfOnly) {
            const args = CommandUtils.getSelectorMap(selector.slice(2, selector.length - 1));
            if (!args) { return null; }

            diagnostics.typeLimit = !!args.get('type');
            diagnostics.chunkLimit = !!args.get('r');
            diagnostics.countLimit = !!args.get('c');
        }
        if (selector[1] === 'a' || selector[1] === 'p') {
            diagnostics.typeLimit = true;
        }

        // 获取性能评级（仅自身优先最高级）
        const performanceLevel = this.getPerformanceLevel(diagnostics);

        // 构建美化的 Markdown 内容
        const hoverContent = this.buildHoverMarkdown(diagnostics, performanceLevel);
        return null;
    }

    private provideScoreboardInfo(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, info: CommandInfo): vscode.Hover | null {
        const markdown = new vscode.MarkdownString();
        // 获取记分板相关
        const scoreboardData = DataLoader.getInstance().getScoreboardsData().get(info.resource);
        if (scoreboardData) {
            markdown.appendMarkdown(`### ${info.resource}  
    - 描述：${scoreboardData.desc}  
    - 类型：${scoreboardData.type}  
    - 定义: ${MinecraftUtils.buildFunctionCall(scoreboardData.def[0])}
            `);
        }
        markdown.isTrusted = true;
        return new vscode.Hover(markdown);
    }

    /**
     * 映射性能等级（仅自身为最高级）
     */
    private getPerformanceLevel(diagnostics: any): string {
        if (diagnostics.selfOnly) {
            return '🏆 完全限制（最佳性能，仅自身）';
        }

        const score = [diagnostics.typeLimit, diagnostics.chunkLimit, diagnostics.countLimit].filter(Boolean).length;
        const levels = [
            { score: 0, label: '⚠️ 微限制（性能风险）' },
            { score: 1, label: '⚪️ 低限制（一般性能）' },
            { score: 2, label: '🟡 中限制（良好性能）' },
            { score: 3, label: '🟢 高限制（优秀性能）' }
        ];
        return levels[Math.min(score, levels.length - 1)].label;
    }

    /**
     * 构建结构化的 Markdown hover 内容（仅自身仅在符合时显示）
     */
    private buildHoverMarkdown(diagnostics: any, performanceLevel: string): string {
        const statusIcon = (status: boolean) => status ? '✅' : '❌';
        let diagnosticItems = [];

        // 仅自身限制：仅在符合时显示
        if (diagnostics.selfOnly) {
            diagnosticItems.push('',`- 🏆 仅自身限制`);
        } else {
            // 其他限制项正常显示
            diagnosticItems.push(
                '',
                `- 实体类型限制（type=） ${statusIcon(diagnostics.typeLimit)} `,
                `- 区块范围限制（r=）${statusIcon(diagnostics.chunkLimit)} `,
                `- 数量上限限制（c=）${statusIcon(diagnostics.countLimit)} `
            );
        }

        return `### 选择器性能诊断  
    ${diagnosticItems.join('\n')}  
    
    **性能评级**：${performanceLevel}`;
    }
}

// 注册
export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('mcfunction', new McFunctionHoverProvider()));
}
