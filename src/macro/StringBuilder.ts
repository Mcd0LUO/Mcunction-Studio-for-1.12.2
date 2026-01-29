/**
 * 高性能字符串构建器（替代 + 拼接）
 * 特性：
 * 1. 基于数组缓存片段，避免频繁创建字符串
 * 2. 支持追加字符串/重复字符/清空
 * 3. 类型安全，适配 TS
 */
export class StringBuilder {
    private readonly segments: string[];

    constructor(initialContent: string = '') {
        this.segments = initialContent ? [initialContent] : [];
    }

    /** 追加字符串 */
    public append(str: string): this {
        this.segments.push(str);
        return this; // 链式调用
    }

    /** 追加重复的字符（如空格） */
    public appendRepeat(char: string, count: number): this {
        if (count <= 0 || char.length !== 1) {return this;}
        this.segments.push(char.repeat(count));
        return this;
    }

    /** 清空内容 */
    public clear(): void {
        this.segments.length = 0;
    }

    /** 转换为最终字符串 */
    public toString(): string {
        return this.segments.join('');
    }

    /** 获取当前缓存的片段数（调试用） */
    public getSegmentCount(): number {
        return this.segments.length;
    }
}