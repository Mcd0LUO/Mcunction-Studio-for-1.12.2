/**
 * Minecraft颜色代码类型
 */
export type ColorCode = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

/**
 * Minecraft样式代码枚举
 * l:粗体  m:删除线  n:下划线  o:斜体  r:重置  k:随机字符
 */
export type StyleCode = 'l' | 'm' | 'n' | 'o' | 'r' | 'k';

/**
 * 格式代码联合类型，包含颜色和样式代码
 */
export type FormatCode = ColorCode | StyleCode;

/**
 * 混淆文本符号，用于替代混淆格式代码(k)的内容
 */
export const OBFUSCATED_SYMBOL = '■';

/**
 * 换行符常量
 */
export const LINE_BREAK = '\n';

export class JsonMessageUtils {
    static instance: JsonMessageUtils;

    static getInstance() {
        if (!JsonMessageUtils.instance) {
            JsonMessageUtils.instance = new JsonMessageUtils();
        }
        return JsonMessageUtils.instance;
    }

    /**
     * 标准化组件数据
     * 将各种格式的JSON组件转换为统一的内部格式
     * @param components 原始组件数组
     * @returns 标准化后的组件数组
     */
    public normalizeComponents(components: any[]): Array<{ text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean }> {
        return components.map(component => {
            // 如果组件有text属性，优先使用text（忽略translate）
            if (typeof component === 'object' && component.text) {
                return this.processBasicComponent(component);
            }

            // 处理translate翻译组件（无text时）
            if (typeof component === 'object' && component.translate) {
                return this.processTranslateComponent(component);
            }

            // 处理选择器组件（无text和translate时）
            if (typeof component === 'object' && component.selector) {
                return this.processSelectorComponent(component);
            }

            // 处理计分板组件（无text和translate时）
            if (typeof component === 'object' && component.score) {
                return this.processScoreComponent(component);
            }

            // 处理字符串组件
            if (typeof component === 'string') {
                return {
                    text: component,
                    bold: false,
                    italic: false,
                    underlined: false,
                    strikethrough: false
                };
            }

            // 处理其他类型组件
            return {
                text: String(component),
                bold: false,
                italic: false,
                underlined: false,
                strikethrough: false
            };
        });
    }

    /**
     * 处理基础文本组件（含text属性）
     * @param component 原始组件
     * @returns 标准化组件
     */
    private processBasicComponent(component: any): { text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean } {
        return {
            text: component.text || '',
            color: component.color,
            bold: this.parseBooleanProperty(component.bold),
            italic: this.parseBooleanProperty(component.italic),
            underlined: this.parseBooleanProperty(component.underlined),
            strikethrough: this.parseBooleanProperty(component.strikethrough)
        };
    }

    /**
     * 处理翻译组件（含translate/with属性）
     * @param component 原始组件
     * @returns 标准化组件
     */
    private processTranslateComponent(component: any): { text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean } {
        // 获取翻译标识符
        let translateText = component.translate || '';
        // 获取参数列表（确保是数组）
        const withParams = Array.isArray(component.with) ? component.with : [];

        // 解析占位符并替换为实际文本
        const resolvedText = this.parsePlaceholders(translateText, withParams);

        return {
            text: resolvedText,
            color: component.color,
            bold: this.parseBooleanProperty(component.bold),
            italic: this.parseBooleanProperty(component.italic),
            underlined: this.parseBooleanProperty(component.underlined),
            strikethrough: this.parseBooleanProperty(component.strikethrough)
        };
    }

    /**
     * 处理选择器组件（含selector属性）
     * @param component 原始组件
     * @returns 标准化组件
     */
    private processSelectorComponent(component: any): { text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean } {
        return {
            text: component.selector || '',
            color: component.color,
            bold: this.parseBooleanProperty(component.bold),
            italic: this.parseBooleanProperty(component.italic),
            underlined: this.parseBooleanProperty(component.underlined),
            strikethrough: this.parseBooleanProperty(component.strikethrough)
        };
    }

    /**
     * 处理计分板组件（含score属性）
     * @param component 原始组件
     * @returns 标准化组件
     */
    private processScoreComponent(component: any): { text: string, color?: string, bold?: boolean, italic?: boolean, underlined?: boolean, strikethrough?: boolean } {
        const score = component.score || {};
        const scoreText = score.name ? `${score.name}:${score.objective}` : score.objective || '';

        return {
            text: scoreText,
            color: component.color,
            bold: this.parseBooleanProperty(component.bold),
            italic: this.parseBooleanProperty(component.italic),
            underlined: this.parseBooleanProperty(component.underlined),
            strikethrough: this.parseBooleanProperty(component.strikethrough)
        };
    }

    /**
     * 解析翻译文本中的占位符并替换
     * 支持两种占位符格式：
     * - %s：按顺序替换（对应with数组的第n个元素）
     * - %n$s：指定索引替换（n为数字，对应with数组的第n-1个元素）
     * @param translateText 翻译文本（含占位符）
     * @param withParams 参数列表
     * @returns 替换后的文本
     */
    private parsePlaceholders(translateText: string, withParams: any[]): string {
        let result = translateText;
        let sequentialIndex = 0; // 用于%s的顺序替换索引

        // 先处理指定索引的占位符（%n$s）
        const numberedPlaceholderRegex = /%(\d+)\$s/g;
        result = result.replace(numberedPlaceholderRegex, (match, indexStr) => {
            const index = parseInt(indexStr, 10) - 1; // 转换为数组索引（从0开始）
            return this.resolveComponentText(withParams[index]);
        });

        // 再处理顺序占位符（%s）
        const sequentialPlaceholderRegex = /%s/g;
        result = result.replace(sequentialPlaceholderRegex, () => {
            const value = this.resolveComponentText(withParams[sequentialIndex]);
            sequentialIndex++;
            return value;
        });

        return result;
    }

    /**
     * 递归解析组件为文本
     * 处理with数组中的各类元素（字符串、对象、嵌套组件等）
     * @param component 待解析的组件
     * @returns 解析后的文本
     */
    private resolveComponentText(component: any): string {
        // 空值处理
        if (component === null || component === undefined) {
            return '';
        }

        // 基础类型直接转换为字符串
        if (typeof component !== 'object') {
            return String(component);
        }

        // 处理嵌套的translate组件
        if (component.translate) {
            const withParams = Array.isArray(component.with) ? component.with : [];
            return this.parsePlaceholders(component.translate, withParams);
        }

        // 处理selector组件
        if (component.selector) {
            return component.selector;
        }

        // 处理score组件
        if (component.score) {
            const score = component.score;
            return score.name ? `${score.name}:${score.objective}` : score.objective || '';
        }

        // 处理text组件
        if (component.text) {
            return component.text;
        }

        // 其他对象类型（如数组）转换为字符串
        return JSON.stringify(component);
    }

    /**
     * 解析布尔类型属性
     * @param value 原始值
     * @returns 标准化的布尔值
     */
    private parseBooleanProperty(value: any): boolean {
        if (typeof value === 'boolean') { return value; }
        if (typeof value === 'string') { return value.toLowerCase() === 'true'; }
        return false;
    }
}