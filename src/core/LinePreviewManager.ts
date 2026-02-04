import * as vscode from 'vscode';
import { JsonMessageUtils, ColorCode, StyleCode, FormatCode, LINE_BREAK, OBFUSCATED_SYMBOL } from '../utils/JsonMessageUtils';
import { DataLoader } from '../core/DataLoader';
import { CommandUtils } from '../utils/CommandUtils';
import { StringBuilder } from '../macro/StringBuilder';

/**
 * 防抖延迟时间（毫秒）
 */
const DEBOUNCE_DELAY = 100;

/**
 * 样式化文本片段接口
 */
interface StyledFragment {
    text: string;
    color?: string;
    bold: boolean;
    italic: boolean;
    underlined: boolean;
    strikethrough: boolean;
    isInner: boolean;
    line: number;
}

/**
 * 样式状态接口
 */
interface StyleState {
    color: string;
    bold: boolean;
    italic: boolean;
    underlined: boolean;
    strikethrough: boolean;
}

/**
 * 行预览管理器类
 */
export class LinePreviewManager implements vscode.Disposable {
    private decorations: Map<string, vscode.TextEditorDecorationType> = new Map();
    private disposables: vscode.Disposable[] = [];
    private debounceTimer: NodeJS.Timeout | null = null;

    /**
     * Minecraft格式代码映射表
     */
    private formatCodes = {
        color: {
            '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
            '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
            '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
            'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
        } as Record<ColorCode, string>,
        style: {
            'l': 'bold', 'm': 'strikethrough', 'n': 'underline',
            'o': 'italic', 'r': 'reset', 'k': 'obfuscated'
        } as Record<StyleCode, string>
    };

    /**
     * 全局默认样式（§r对应的样式）
     */
    private globalDefaultStyle: StyleState = {
        color: '#FFFFFF',
        bold: false,
        italic: false,
        underlined: false,
        strikethrough: false
    };

    constructor() {
        const debouncedUpdate = this.debounce(this.updatePreview.bind(this), DEBOUNCE_DELAY);
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(debouncedUpdate),
            vscode.workspace.onDidChangeTextDocument(debouncedUpdate)
        );
        this.updatePreview();
    }

    private debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
        return ((...args: any[]) => {
            if (this.debounceTimer) {clearTimeout(this.debounceTimer);}
            this.debounceTimer = setTimeout(() => {
                func(...args);
                this.debounceTimer = null;
            }, delay);
        }) as unknown as T;
    }

    private updatePreview() {
        if (!DataLoader.getInstance().getConfig().JsonPreview.LinePreview) {return;}
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        this.clearDecorations();
        const cursorLine = editor.selection.active.line;
        const activeCommand = CommandUtils.extraceActiveCommand(editor.document.lineAt(cursorLine).text);

        if (!this.isSupportedCommand(activeCommand[0])) {return;}

        let jsonPart = '';
        if (activeCommand[0] === 'tellraw' && activeCommand.length > 2) {jsonPart = activeCommand[2];}
        else if (activeCommand[0] === 'title' && activeCommand.length > 3) {jsonPart = activeCommand[3];}
        else {return;}

        if (!jsonPart) {
            this.showWarningDecoration(editor, cursorLine);
            return;
        }

        try {
            const textComponents = JSON.parse(jsonPart);
            const components = Array.isArray(textComponents) ? textComponents : [textComponents];
            const normalizedComponents = JsonMessageUtils.getInstance().normalizeComponents(components);
            const styledFragments = this.parseFormatCodes(normalizedComponents);
            this.applyComponentDecorations(editor, cursorLine, styledFragments);
        } catch (error) {
            this.showWarningDecoration(editor, cursorLine);
        }
    }

    private isSupportedCommand(command: string): boolean {
        return command === 'tellraw' || command === 'title';
    }

    /**
     * 核心修改：格式代码片段独立作用域
     * 规则：
     * 1. 每个组件有自己的「基础样式」（组件配置的bold/italic等）
     * 2. 遇到格式代码（§）时，重置样式为「组件基础样式」，再叠加当前格式代码
     * 3. 连续格式代码（如§o§b）可叠加样式，片段间不继承
     * 4. §r重置为「全局默认样式」（忽略组件基础样式）
     */
    private parseFormatCodes(components: Array<{ text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean }>): StyledFragment[] {
        const fragments: StyledFragment[] = [];

        components.forEach((component) => {
            // 1. 初始化「组件基础样式」（组件配置 + 颜色映射）
            const componentBaseStyle: StyleState = {
                color: component.color ? this.getMinecraftColor(component.color) : this.globalDefaultStyle.color,
                bold: component.bold ?? this.globalDefaultStyle.bold,
                italic: component.italic ?? this.globalDefaultStyle.italic,
                underlined: component.underlined ?? this.globalDefaultStyle.underlined,
                strikethrough: component.strikethrough ?? this.globalDefaultStyle.strikethrough
            };

            const text = component.text;
            const currentText = new StringBuilder(); // 当前片段文本
            let currentFragmentStyle: StyleState = { ...componentBaseStyle }; // 当前片段样式（默认继承组件基础样式）
            let applyObfuscation = false; // §k仅影响下一个字符
            let isFirstInner = true;
            let i = 0;

            while (i < text.length) {
                const char = text[i];

                // 处理换行符（可视化↵）
                if (char === LINE_BREAK.charAt(0)) {
                    currentText.append('↵');
                    i++;
                    continue;
                }

                // 处理格式代码（§开头）
                if (char === '§' && i + 1 < text.length) {
                    // 有累积文本时，先存入上一个片段
                    if (currentText.length() > 0) {
                        fragments.push({
                            ...currentFragmentStyle,
                            text: currentText.toString(),
                            isInner: !isFirstInner,
                            line: 0
                        });
                        currentText.clear();
                        isFirstInner = false;
                    }

                    // 2. 重置样式为「组件基础样式」（关键：片段间样式独立）
                    currentFragmentStyle = { ...componentBaseStyle };
                    applyObfuscation = false;

                    // 处理当前格式代码（支持连续格式代码叠加，如§o§b）
                    while (i < text.length && text[i] === '§' && i + 1 < text.length) {
                        const code = text[i + 1].toLowerCase() as FormatCode;
                        i += 2; // 跳过§和代码字符

                        // 处理颜色代码（仅改颜色，不影响其他样式）
                        if (this.isColorCode(code)) {
                            currentFragmentStyle.color = this.formatCodes.color[code];
                        }
                        // 处理样式代码
                        else if (this.isStyleCode(code)) {
                            switch (this.formatCodes.style[code]) {
                                case 'bold':
                                    currentFragmentStyle.bold = true;
                                    break;
                                case 'strikethrough':
                                    currentFragmentStyle.strikethrough = true;
                                    break;
                                case 'underline':
                                    currentFragmentStyle.underlined = true;
                                    break;
                                case 'italic':
                                    currentFragmentStyle.italic = true;
                                    break;
                                case 'obfuscated':
                                    applyObfuscation = true; // 仅影响下一个字符
                                    break;
                                case 'reset':
                                    // §r重置为全局默认样式（忽略组件基础样式）
                                    currentFragmentStyle = { ...this.globalDefaultStyle };
                                    break;
                            }
                        }
                    }
                }
                // 处理普通字符
                else {
                    const charToAdd = applyObfuscation
                        ? OBFUSCATED_SYMBOL
                        : (char === ' ' ? '\u00A0' : char); // 空格替换为非换行空格

                    currentText.append(charToAdd);
                    applyObfuscation = false; // §k仅生效一次
                    i++;
                }
            }

            // 加入最后一个文本片段
            if (currentText.length() > 0) {
                fragments.push({
                    ...currentFragmentStyle,
                    text: currentText.toString(),
                    isInner: !isFirstInner,
                    line: 0
                });
            }
        });

        return fragments;
    }

    private applyComponentDecorations(
        editor: vscode.TextEditor,
        originalLine: number,
        fragments: StyledFragment[]
    ) {
        const originalLineObj = editor.document.lineAt(originalLine);
        const originalLineLength = originalLineObj.text.length;

        // 创建容器装饰（> 符号）
        const containerId = `container-${Date.now()}`;
        this.decorations.set(containerId, vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ` >`,
                color: '#AAAAAA',
                margin: '0 10px 0 15px',
                fontWeight: 'bold'
            }
        }));
        editor.setDecorations(this.decorations.get(containerId)!, [{
            range: new vscode.Range(originalLine, originalLineLength, originalLine, originalLineLength)
        }]);

        // 渲染所有片段（同一行）
        const targetLine = originalLine;
        const topMargin = '0';
        let inlineOffset = 0;

        fragments.forEach((fragment, index) => {
            if (!fragment.text) {return;}

            const id = `fragment-${Date.now()}-${targetLine}-${index}`;
            const textDecoration: string[] = [];
            if (fragment.underlined) {textDecoration.push('underline');}
            if (fragment.strikethrough) {textDecoration.push('line-through');}

            const horizontalMargin = fragment.isInner ? '0' : '0 3px 0 0';
            this.decorations.set(id, vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: fragment.text,
                    color: fragment.color,
                    fontWeight: fragment.bold ? 'bold' : 'normal',
                    fontStyle: fragment.italic ? 'italic' : 'normal',
                    textDecoration: textDecoration.join(' ') || 'none',
                    margin: `${topMargin} 0 0 ${horizontalMargin}`
                }
            }));

            editor.setDecorations(this.decorations.get(id)!, [{
                range: new vscode.Range(
                    targetLine,
                    originalLineLength + inlineOffset,
                    targetLine,
                    originalLineLength + inlineOffset
                )
            }]);

            inlineOffset += fragment.text.length + (fragment.isInner ? 0 : 1);
        });
    }

    private isColorCode(code: string): code is ColorCode {
        return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'].includes(code);
    }

    private isStyleCode(code: string): code is StyleCode {
        return ['l', 'm', 'n', 'o', 'r', 'k'].includes(code);
    }

    private getMinecraftColor(colorName: string): string {
        const colorMap: Record<string, string> = {
            'black': '#000000', 'dark_blue': '#0000AA', 'dark_green': '#00AA00',
            'dark_aqua': '#00AAAA', 'dark_red': '#AA0000', 'dark_purple': '#AA00AA',
            'gold': '#FFAA00', 'gray': '#AAAAAA', 'dark_gray': '#555555',
            'blue': '#5555FF', 'green': '#55FF55', 'aqua': '#55FFFF',
            'red': '#FF5555', 'light_purple': '#FF55FF', 'yellow': '#FFFF55',
            'white': '#FFFFFF'
        };
        return colorMap[colorName] || colorName;
    }

    private showWarningDecoration(editor: vscode.TextEditor, lineNumber: number) {
        const line = editor.document.lineAt(lineNumber);
        const lineLength = line.text.length;
        const warningId = `warning-${Date.now()}`;
        this.decorations.set(warningId, vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '⚠️ 无法解析',
                color: '#ff9800',
                margin: '0 0 0 15px',
                fontWeight: 'bold'
            }
        }));
        editor.setDecorations(this.decorations.get(warningId)!, [{
            range: new vscode.Range(lineNumber, lineLength, lineNumber, lineLength)
        }]);
    }

    private clearDecorations() {
        this.decorations.forEach(decoration => decoration.dispose());
        this.decorations.clear();
    }

    dispose() {
        if (this.debounceTimer) {clearTimeout(this.debounceTimer);}
        this.clearDecorations();
        this.disposables.forEach(d => d.dispose());
    }
}