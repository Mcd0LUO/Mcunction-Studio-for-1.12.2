import {
    ASTNode, MacroDefinition, MacroParam, MacroBody,
    CommandStatement, MacroInvocation, MacroInvocationArg,
    MacroParamRef, LineComment,
    BlockComment,
    DOCComment,
    Program
} from './MacroAst'; // 导入你的 AST 节点类型

/**
 * AST 可视化打印工具
 * 特性：
 * 1. 树形层级展示（├──/└──/│  ）
 * 2. 控制台颜色高亮不同节点类型
 * 3. 简化位置信息（行:列）
 * 4. 截断过长内容（如命令文本）
 * 5. 递归遍历所有嵌套节点
 */
export class ASTVisualizer {
    // 控制台颜色样式（ANSI 转义码）
    private static readonly STYLES = {
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        // 节点类型颜色
        MacroDefinition: '\x1b[34m', // 蓝色（核心节点）
        MacroParam: '\x1b[36m',      // 青色（参数）
        MacroBody: '\x1b[33m',       // 黄色（宏体）
        CommandStatement: '\x1b[32m',// 绿色（命令）
        MacroInvocation: '\x1b[35m', // 紫色（宏调用）
        MacroParamRef: '\x1b[91m',   // 浅红（参数引用）
        LineComment: '\x1b[90m',     // 灰色（注释）
        BlockComment: '\x1b[90m',     // 灰色（块注释）
        DOCComment: '\x1b[90m',       // 灰色（文档注释）
        default: '\x1b[37m'          // 白色（默认）
    };

    /**
     * 对外暴露的核心方法：打印 AST 节点
     * @param node AST 根节点（如 MacroDefinition）
     * @param title 打印标题（可选）
     */
    public static printAST(node: ASTNode | null, title = 'AST 结构可视化'): void {
        if (!node) {
            console.log(`${this.STYLES.bold}\n❌ AST 节点为空${this.STYLES.reset}`);
            return;
        }

        // 打印标题
        console.log(`${this.STYLES.bold}\n📊 ${title}${this.STYLES.reset}`);
        console.log('┌──────────────────────────────────────────────────');

        // 递归打印节点（根节点层级为 0）
        this.printNode(node, 0, [], true);

        console.log('└──────────────────────────────────────────────────\n');
    }

    /**
     * 递归打印单个节点（核心逻辑）
     * @param node 要打印的节点
     * @param level 层级（从 0 开始）
     * @param prefixes 前缀符号（控制树形展示）
     * @param isLast 是否是同级最后一个节点
     */
    private static printNode(
        node: ASTNode,
        level: number,
        prefixes: string[],
        isLast: boolean
    ): void {
        // 1. 基础配置
        const nodeType = node.type;
        const style = this.STYLES[nodeType as keyof typeof this.STYLES] || this.STYLES.default;
        const treeSymbol = isLast ? '└──' : '├──'; // 最后一个节点用 └──，否则用 ├──
        const indent = prefixes.join('') + treeSymbol;

        // 2. 简化位置信息（行:列）
        const pos = node.position;
        const posStr = `[${pos.start.line}:${pos.start.column}~${pos.end.line}:${pos.end.column}]`;

        // 3. 构建节点核心信息（不同节点类型展示不同属性）
        let nodeInfo = this.getNodeInfo(node);

        // 4. 打印当前节点（带颜色+缩进+位置）
        console.log(
            `${indent} ${style}${this.STYLES.bold}${nodeType}${this.STYLES.reset} ${posStr} → ${nodeInfo}`
        );

        // 5. 准备子节点的前缀（控制树形的 │  符号）
        const childPrefixes = [...prefixes];
        if (!isLast) {
            childPrefixes.push('│  '); // 非最后一个节点，子节点前缀加 │  
        } else {
            childPrefixes.push('   '); // 最后一个节点，子节点前缀加空格
        }

        // 6. 递归打印子节点
        const children = this.getNodeChildren(node);
        children.forEach((child, index) => {
            const isChildLast = index === children.length - 1;
            this.printNode(child, level + 1, childPrefixes, isChildLast);
        });
    }

    /**
     * 获取节点的核心信息（不同节点类型定制化展示）
     */
    private static getNodeInfo(node: ASTNode): string {
        switch (node.type) {
            case 'Program':
                const program = node as Program;
                const sourceInfo = program.source ? ` | 源文件: ${program.source}` : '';
                const bodyCount = program.body.length;
                // 统计 body 内不同类型的节点数（可选，增强可读性）
                const defCount = program.body.filter(n => n.type === 'MacroDefinition').length;
                const commentCount = program.body.filter(n => n.type === 'LineComment').length;
                const callCount = program.body.filter(n => n.type === 'MacroInvocation').length;

                return `顶级节点数: ${bodyCount}（宏定义: ${defCount} | 注释: ${commentCount} | 宏调用: ${callCount}）${sourceInfo}`;
            case 'MacroDefinition':
                const def = node as MacroDefinition;
                return `宏名: ${def.name} | 参数数: ${def.params.length} | 有注释: ${!!def.docComment}`;

            case 'MacroParam':
                const param = node as MacroParam;
                const defaultValue = param.defaultValue ? ` | 默认值: ${param.defaultValue}` : '';
                return `参数名: ${param.name} | 类型: ${param.paramType}${defaultValue}`;

            case 'MacroBody':
                const body = node as MacroBody;
                return `语句数: ${body.statements.length}`;

            case 'CommandStatement':
                const cmd = node as CommandStatement;
                // 截断过长的命令内容（最多显示 50 个字符）
                const content = cmd.content.length > 50
                    ? `${cmd.content.slice(0, 50)}...`
                    : cmd.content;
                return `命令: "${content}" | 宏引用数: ${cmd.macroRefs.length}`;

            case 'MacroInvocation': // MacroInvocation 的 type 是 'MacroInvocation'
                const call = node as MacroInvocation;
                return `宏名: ${call.fullName} | 参数数: ${call.args.length}`;

            case 'MacroInvocationArg':
                const arg = node as MacroInvocationArg;
                const valueStr = typeof arg.value === 'string'
                    ? arg.value
                    : `[${arg.valueType}] ${(arg.value as MacroParamRef).paramName}`;
                return `参数类型: ${arg.valueType} | 值: ${valueStr}`;

            case 'MacroParamRef':
                const ref = node as MacroParamRef;
                return `引用参数: ${ref.paramName}`;

            case 'LineComment':
                const comment = node as LineComment;
                return `行注释: ${comment.value}`;
            case 'BlockComment':
                const blockComment = node as BlockComment;
                return `块注释: ${blockComment.value.replaceAll('\n', '') }`;
            case 'DOCComment':
                const docComment = node as DOCComment;
                return `文档注释: ${docComment.value.replaceAll('\n', '')}`;
                
            default:
                return `未知节点类型: ${node.type}`;
        }
    }

    /**
     * 获取节点的子节点列表（不同节点类型返回不同子节点）
     */
    private static getNodeChildren(node: ASTNode): ASTNode[] {
        const children: ASTNode[] = [];
        switch (node.type) {
            case 'Program':
                return (node as Program).body;
            case 'MacroDefinition':
                const def = node as MacroDefinition;
                children.push(...def.params); // 参数列表
                children.push(def.body);      // 宏体
                break;

            case 'MacroBody':
                const body = node as MacroBody;
                children.push(...body.statements); // 宏体内的语句
                break;

            case 'MacroInvocation': // MacroInvocation
                const call = node as MacroInvocation;
                children.push(...call.args); // 宏调用参数
                break;

            case 'CommandStatement':
                const cmd = node as CommandStatement;
                children.push(...cmd.macroRefs); // 命令内的宏引用
                break;

            // 无自节点的类型
            case 'MacroParam':
            case 'MacroParamRef':
            case 'LineComment':
            case 'MacroInvocationArg':
                break;

            default:
                break;
        }

        // 防止循环引用（AST 一般不会有，做防护）
        return children.filter(child => child !== node);
    }

    /**
     * 辅助方法：截断字符串（带省略号）
     */
    private static truncate(str: string, maxLength = 50): string {
        return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
    }
  }