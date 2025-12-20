import * as vscode from "vscode";

interface CompletionItemData {
    label: string;
    desc: string;
    kind: vscode.CompletionItemKind;
}

interface KeyRule {
    level: number[];
    parentKeys?: string[];
    exclusiveKeys?: string[];
}

interface MCCompletions {
    [key: string]: CompletionItemData[];
}

export class JsonMsgParser {
    public static readonly instance: JsonMsgParser = new JsonMsgParser();

    // 补全配置（不变）
    private readonly MC_COMPLETIONS: MCCompletions = {
        color: [
            { label: 'red', desc: '红色', kind: vscode.CompletionItemKind.Color },
            { label: 'blue', desc: '蓝色', kind: vscode.CompletionItemKind.Color },
            { label: 'green', desc: '绿色', kind: vscode.CompletionItemKind.Color },
            { label: 'yellow', desc: '黄色', kind: vscode.CompletionItemKind.Color },
            { label: 'white', desc: '白色', kind: vscode.CompletionItemKind.Color },
            { label: 'black', desc: '黑色', kind: vscode.CompletionItemKind.Color },
            { label: 'gray', desc: '灰色', kind: vscode.CompletionItemKind.Color },
            { label: 'purple', desc: '紫色', kind: vscode.CompletionItemKind.Color },
            { label: 'gold', desc: '金色', kind: vscode.CompletionItemKind.Color },
            { label: 'aqua', desc: '水绿色', kind: vscode.CompletionItemKind.Color },
            { label: 'lime', desc: '亮绿', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_aqua', desc: '暗水绿色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_green', desc: '暗绿色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_blue', desc: '暗蓝色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_gray', desc: '暗灰色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_purple', desc: '暗紫色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_gold', desc: '暗金色', kind: vscode.CompletionItemKind.Color },
            { label: 'dark_red', desc: '暗红色', kind: vscode.CompletionItemKind.Color },
        ],
        selector: [
            { label: '@s', desc: '目标选择器：自身', kind: vscode.CompletionItemKind.Variable },
            { label: '@a', desc: '目标选择器：所有玩家', kind: vscode.CompletionItemKind.Variable },
            { label: '@p', desc: '目标选择器：最近玩家', kind: vscode.CompletionItemKind.Variable },
            { label: '@e', desc: '目标选择器：所有实体', kind: vscode.CompletionItemKind.Variable }
        ],
        objective: [
            { label: '0.1s', desc: '计分板目标：0.1秒计时', kind: vscode.CompletionItemKind.Value },
            { label: '1s', desc: '计分板目标：1秒计时', kind: vscode.CompletionItemKind.Value },
            { label: 'health', desc: '计分板目标：生命值', kind: vscode.CompletionItemKind.Value }
        ],
        name: [
            { label: '@s', desc: '目标选择器：执行者自身', kind: vscode.CompletionItemKind.Variable },
            { label: '@a', desc: '目标选择器：所有玩家', kind: vscode.CompletionItemKind.Variable },
            { label: '@p', desc: '目标选择器：最近玩家', kind: vscode.CompletionItemKind.Variable },
            { label: '@e', desc: '目标选择器：所有实体', kind: vscode.CompletionItemKind.Variable }
        ],
        score: []
    };

    // 层级规则（不变）
    private readonly KEY_RULES: { [key: string]: KeyRule } = {
        color: { level: [1] },
        score: {
            level: [1],
            exclusiveKeys: ['selector']
        },
        selector: {
            level: [1],
            exclusiveKeys: ['score']
        },
        objective: { level: [2], parentKeys: ['score'] },
        name: { level: [2], parentKeys: ['score'] }
    };

    private readonly MC_KEYS = Object.keys(this.MC_COMPLETIONS);
    // 预定义一级Key列表（空对象时优先显示）
    private readonly FIRST_LEVEL_KEYS = ['color', 'score', 'selector'];

    /**
     * 入口：适配空{}补全所有一级Key
     */
    public completion(text: string, full: string): vscode.CompletionItem[] | undefined {
        // 提取当前数组项/对象文本
        const targetText = this.extractCurrentArrayItem(text);
        if (!targetText) {return undefined;}

        // 新增：判定是否为空对象（核心）
        const isEmptyObject = this.isEmptyObject(targetText);
        console.log('是否为空对象：', isEmptyObject, '目标文本：', targetText);

        // 获取已存在Key（空对象返回空数组）
        const existingKeys = isEmptyObject ? [] : this.getExistingKeys(targetText);
        console.log('当前对象已存在Key：', existingKeys);

        const context = this.getEditingContext(targetText, full);
        const prefix = context.prefix || '';

        // 场景1：编辑key → 空对象显示所有一级Key，非空对象按规则过滤
        if (context.isKey) {
            let validKeys: string[] = [];

            // 空对象：显示所有一级Key（color/score/selector）
            if (isEmptyObject && prefix === '') {
                validKeys = this.FIRST_LEVEL_KEYS;
            }
            // 非空对象/有前缀：按原规则过滤
            else {
                validKeys = this.MC_KEYS
                    .filter(key => this.matchRule(key, context.level, context.parentKey))
                    .filter(key => !existingKeys.includes(key))
                    .filter(key => this.checkExclusive(key, targetText))
                    .filter(key => key.startsWith(prefix));
            }

            console.log('有效补全Key：', validKeys);
            return validKeys.map(key =>
                this.createKeyCompletionItem(key, context, prefix)
            );
        }

        // 场景2：编辑value（空对象无value编辑场景，按原规则）
        const valueKey = this.getValueKey(targetText);
        if (valueKey && this.matchRule(valueKey, context.level, context.parentKey)
            && this.checkExclusive(valueKey, targetText)
            && !existingKeys.includes(valueKey)) {
            const validValues = this.MC_COMPLETIONS[valueKey]
                .filter(item => item.label.startsWith(prefix));
            return validValues.map(item =>
                this.createValueCompletionItem(item, context, prefix)
            );
        }

        return [];
    }

    /**
     * 新增：判定是否为空对象
     * 匹配场景："{", "{ ", "[{", "[{ ", ",{", ",{ " 等空对象开头
     */
    private isEmptyObject(text: string): boolean {
        const cleanText = text.replace(/\s/g, '');
        // 空对象判定：仅包含{，无其他字符（除了空格）
        return cleanText === '{' ||
            cleanText.endsWith('{') && cleanText.length === 1;
    }

    /**
     * 提取已存在的一级Key（不变）
     */
    private getExistingKeys(text: string): string[] {
        const existingKeys: string[] = [];
        const cleanText = text.replace(/\s/g, '').replace(/\\"/g, '');
        const firstLevelKeyRegex = /"(color|score|selector)":/g;
        let match;

        while ((match = firstLevelKeyRegex.exec(cleanText)) !== null) {
            const key = match[1];
            if (!existingKeys.includes(key)) {
                existingKeys.push(key);
            }
        }

        return existingKeys;
    }

    /**
     * 互斥规则校验（不变）
     */
    private checkExclusive(key: string, text: string): boolean {
        const rule = this.KEY_RULES[key];
        if (!rule?.exclusiveKeys || rule.exclusiveKeys.length === 0) {return true;}

        const textWithoutSpace = text.replace(/\s/g, '');
        return !rule.exclusiveKeys.some(exKey =>
            textWithoutSpace.includes(`"${exKey}":`)
        );
    }

    /**
     * 提取当前数组项的对象文本（不变）
     */
    private extractCurrentArrayItem(text: string): string | null {
        if (text.startsWith("{") && !text.startsWith("[")) {
            return text;
        }

        if (text.startsWith("[")) {
            let lastArrayDelimiterPos = -1;
            for (let i = text.length - 1; i >= 0; i--) {
                const char = text[i];
                if (char === '{' && (i === 0 || text[i - 1] === '[' || text[i - 1] === ',')) {
                    lastArrayDelimiterPos = i;
                    break;
                }
            }
            if (lastArrayDelimiterPos > -1) {
                return text.substring(lastArrayDelimiterPos);
            }
        }

        return text.startsWith("{") ? text : null;
    }

    /**
     * 编辑上下文（不变）
     */
    private getEditingContext(text: string, full: string): {
        level: number;
        parentKey: string | null;
        isKey: boolean;
        prefix: string;
        keyHasColon: boolean;
        valueHasQuote: boolean;
        lineIsComplete: boolean;
    } {
        let level = 1;
        let braceCount = 0;
        let lastQuotePos = -1;
        let nearestDelimiter = '';
        let parentKey: string | null = null;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '{') {braceCount++;}
            if (char === '}') {braceCount--;}
            if (char === '[' || char === ']') {continue;}
        }
        const totalBraceCount = Math.max(1, braceCount);

        for (let i = text.length - 1; i >= 0; i--) {
            const char = text[i];
            if (char === '"' && (i === 0 || text[i - 1] !== '\\')) {
                lastQuotePos = i;
                level = totalBraceCount;
                break;
            }
        }

        if (lastQuotePos > -1) {
            for (let i = lastQuotePos - 1; i >= 0; i--) {
                const char = text[i].trim();
                if (char === '' || char === '"') {continue;}
                if (char === '{' || char === ',' || char === ':') {
                    nearestDelimiter = char;
                    break;
                }
            }
        }

        if (level === 2) {
            const textWithoutSpace = text.replace(/\s/g, '');
            parentKey = textWithoutSpace.includes('"score":{') ? 'score' : null;
        }

        const prefix = lastQuotePos > -1 ? text.substring(lastQuotePos + 1).trim() : '';
        const keyHasColon = lastQuotePos > -1
            ? text.substring(lastQuotePos).includes(':')
            : false;
        const valueHasQuote = (text.match(/"/g) || []).length % 2 === 1;
        const fullWithoutSpace = full.replace(/\s/g, '');
        const braceCountFull = (fullWithoutSpace.match(/{/g) || []).length - (fullWithoutSpace.match(/}/g) || []).length;
        const lineIsComplete = braceCountFull === 0 && fullWithoutSpace.includes('}]');

        return {
            level,
            parentKey,
            isKey: nearestDelimiter === '{' || nearestDelimiter === ',',
            prefix,
            keyHasColon,
            valueHasQuote,
            lineIsComplete
        };
    }

    /**
     * 规则匹配（不变）
     */
    private matchRule(key: string, level: number, parentKey: string | null): boolean {
        const rule = this.KEY_RULES[key];
        if (!rule) {return false;}
        if (!rule.level.includes(level)) {return false;}
        if (rule.parentKeys) {
            return parentKey ? rule.parentKeys.includes(parentKey) : false;
        }
        return true;
    }

    /**
     * Key补全项（不变）
     */
    private createKeyCompletionItem(
        key: string,
        context: ReturnType<typeof this.getEditingContext>,
        prefix: string
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
        item.detail = this.getKeyDesc(key);
        item.sortText = `000${key}`;

        let insertText = key;
        if (prefix && key.startsWith(prefix) && prefix !== key) {
            insertText = key.substring(prefix.length);
        }

        if (!context.lineIsComplete && !context.keyHasColon) {
            insertText += '":"';
        }

        item.insertText = new vscode.SnippetString(insertText);
        item.commitCharacters = ['"'];
        return item;
    }

    /**
     * Value补全项（不变）
     */
    private createValueCompletionItem(
        data: CompletionItemData,
        context: ReturnType<typeof this.getEditingContext>,
        prefix: string
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(data.label, data.kind);
        item.detail = data.desc;
        item.sortText = `000${data.label}`;

        let insertText = data.label;
        if (prefix && data.label.startsWith(prefix) && prefix !== data.label) {
            insertText = data.label.substring(prefix.length);
        }

        if (!context.lineIsComplete && !context.valueHasQuote && !data.label.startsWith('"')) {
            insertText = `"${data.label}"`;
        } else if (context.valueHasQuote) {
            insertText = data.label.substring(prefix.length);
        }

        item.insertText = new vscode.SnippetString(insertText);
        item.commitCharacters = ['"', ',', '}'];
        return item;
    }

    /**
     * 获取Value所属Key（不变）
     */
    private getValueKey(text: string): string | null {
        let inQuote = true;
        let colonPos = -1;

        const textWithoutSpace = text.replace(/\s/g, '');
        for (let i = textWithoutSpace.length - 1; i >= 0; i--) {
            const char = textWithoutSpace[i];
            if (char === '"' && (i === 0 || textWithoutSpace[i - 1] !== '\\')) {
                inQuote = !inQuote;
                continue;
            }
            if (char === ':' && !inQuote) {
                colonPos = text.lastIndexOf(':');
                break;
            }
        }

        if (colonPos === -1) {return null;}

        let keyStart = -1, keyEnd = -1;
        for (let i = colonPos - 1; i >= 0; i--) {
            const char = text[i];
            if (char === '"' && (i === 0 || text[i - 1] !== '\\')) {
                if (keyEnd === -1) {keyEnd = i;}
                else {
                    keyStart = i;
                    break;
                }
            }
        }

        return keyStart !== -1 && keyEnd !== -1
            ? text.substring(keyStart + 1, keyEnd).trim()
            : null;
    }

    /**
     * Key描述（不变）
     */
    private getKeyDesc(key: string): string {
        switch (key) {
            case 'color': return '我的世界JSON键名：文本颜色（仅第一级）';
            case 'score': return '我的世界JSON键名：计分板配置（仅第一级，与selector互斥）';
            case 'selector': return '我的世界JSON键名：目标选择器（仅第一级，与score互斥）';
            case 'objective': return '我的世界JSON键名：计分板目标（仅score下）';
            case 'name': return '我的世界JSON键名：目标选择器（仅score下）';
            default: return `我的世界JSON键名：${key}`;
        }
    }
}