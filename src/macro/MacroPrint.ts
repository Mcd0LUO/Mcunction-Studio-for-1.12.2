import { McFunctionFile, AstNode, MacroDefinition, MacroParameter, MacroCall, McFunctionStatement } from "./MacroAst";

/**
 * AST 可视化工具：控制台格式化打印 AST 树形结构
 * 特性：层级缩进 + 颜色标记 + 关键信息高亮 + 位置信息标注
 */
export class MacroAstVisualizer {
    // 缩进空格数（控制层级显示）
    private static readonly INDENT_SPACE = 2;
    // 控制台颜色码（高亮不同节点/信息，关闭颜色可注释）
    private static readonly COLOR = {
        NODE_TYPE: '\x1b[36m', // 青色：节点类型
        KEY: '\x1b[33m',       // 黄色：关键字段（name/arguments/parameters）
        VALUE: '\x1b[32m',     // 绿色：字段值（宏名/参数名/语句内容）
        POS: '\x1b[90m',       // 灰色：位置信息（行/列）
        RESET: '\x1b[0m'       // 重置颜色
    };

    /**
     * 对外暴露的核心方法：打印 AST 可视化结构
     * @param ast AST 根节点（McFunctionFile）
     * @param enableColor 是否开启控制台颜色（默认开启，调试时建议开启）
     */
    public static print(ast: McFunctionFile, enableColor = true): void {
        console.log('\n===== [MCFUNCTION 宏 AST 可视化结构] =====\n');
        this.visitNode(ast, 0, enableColor);
        console.log('\n==========================================\n');
    }

    /**
     * 递归访问 AST 节点（核心逻辑）
     * @param node 任意 AST 节点
     * @param indent 当前层级缩进数
     * @param enableColor 是否开启颜色
     */
    private static visitNode(node: AstNode, indent: number, enableColor: boolean): void {
        const indentStr = ' '.repeat(indent * this.INDENT_SPACE);
        const C = enableColor ? this.COLOR : { NODE_TYPE: '', KEY: '', VALUE: '', POS: '', RESET: '' };

        // 根据节点类型个性化打印
        switch (node.type) {
            case 'McFunctionFile':
                this.printFileNode(node as McFunctionFile, indentStr, C, indent);
                break;
            case 'MacroDefinition':
                this.printMacroDefNode(node as MacroDefinition, indentStr, C, indent);
                break;
            case 'MacroParameter':
                this.printMacroParamNode(node as MacroParameter, indentStr, C);
                break;
            case 'MacroCall':
                this.printMacroCallNode(node as MacroCall, indentStr, C);
                break;
            case 'McFunctionStatement':
                this.printStmtNode(node as McFunctionStatement, indentStr, C);
                break;
            default:
                console.log(`${indentStr}${C.NODE_TYPE}[未知节点]${C.RESET} ${node.type}`);
        }
    }

    /** 打印根节点：McFunctionFile */
    private static printFileNode(
        file: McFunctionFile,
        indentStr: string,
        C: typeof this.COLOR,
        indent: number
    ): void {
        // 打印根节点基本信息
        console.log(`${indentStr}${C.NODE_TYPE}McFunctionFile${C.RESET} ${C.POS}[${this.getPosStr(file.position)}]${C.RESET}`);
        const childIndent = indent + 1;

        // 打印宏定义列表
        if (file.macros.length > 0) {
            console.log(`${indentStr}  ${C.KEY}macros${C.RESET} (${file.macros.length}个):`);
            file.macros.forEach(macro => this.visitNode(macro, childIndent, true));
        }

        // 打印语句/宏调用混合列表
        if (file.statements.length > 0) {
            console.log(`${indentStr}  ${C.KEY}statements${C.RESET} (${file.statements.length}个):`);
            file.statements.forEach(stmt => this.visitNode(stmt, childIndent, true));
        }
    }

    /** 打印宏定义节点：MacroDefinition */
    private static printMacroDefNode(
        macro: MacroDefinition,
        indentStr: string,
        C: typeof this.COLOR,
        indent: number
    ): void {
        // 基础信息：宏名 + 位置
        let baseStr = `${indentStr}${C.NODE_TYPE}MacroDefinition${C.RESET} `;
        baseStr += `${C.KEY}name${C.RESET}:${C.VALUE}${macro.name}${C.RESET} `;
        baseStr += `${C.POS}[${this.getPosStr(macro.position)}]${C.RESET}`;
        console.log(baseStr);

        // 文档注释（有则打印）
        if (macro.docComment) {
            console.log(`${indentStr}  ${C.KEY}docComment${C.RESET}: ${C.VALUE}${macro.docComment.trim()}${C.RESET}`);
        }

        // 打印参数列表
        console.log(`${indentStr}  ${C.KEY}parameters${C.RESET} (${macro.parameters.length}个):`);
        macro.parameters.forEach(param => this.visitNode(param, indent + 2, true));

        // 打印宏体
        console.log(`${indentStr}  ${C.KEY}body${C.RESET} (${macro.body.length}条语句):`);
        macro.body.forEach(stmt => this.visitNode(stmt, indent + 2, true));
    }

    /** 打印宏参数节点：MacroParameter */
    private static printMacroParamNode(
        param: MacroParameter,
        indentStr: string,
        C: typeof this.COLOR
    ): void {
        let paramStr = `${indentStr}${C.NODE_TYPE}MacroParameter${C.RESET} `;
        paramStr += `${C.KEY}name${C.RESET}:${C.VALUE}${param.name}${C.RESET} | `;
        paramStr += `${C.KEY}type${C.RESET}:${C.VALUE}${param.paramType || '省略'}${C.RESET} `;
        paramStr += `${C.POS}[${this.getPosStr(param.position)}]${C.RESET}`;
        console.log(paramStr);
    }

    /** 打印宏调用节点：MacroCall */
    private static printMacroCallNode(
        call: MacroCall,
        indentStr: string,
        C: typeof this.COLOR
    ): void {
        let callStr = `${indentStr}${C.NODE_TYPE}MacroCall${C.RESET} `;
        callStr += `${C.KEY}name${C.RESET}:${C.VALUE}${call.name}${C.RESET} | `;
        callStr += `${C.KEY}arguments${C.RESET}:${C.VALUE}[${call.arguments.join(', ')}]${C.RESET} `;
        callStr += `${C.POS}[${this.getPosStr(call.position)}]${C.RESET}`;
        console.log(callStr);
    }

    /** 打印普通语句节点：McFunctionStatement */
    private static printStmtNode(
        stmt: McFunctionStatement,
        indentStr: string,
        C: typeof this.COLOR
    ): void {
        let stmtStr = `${indentStr}${C.NODE_TYPE}McFunctionStatement${C.RESET} `;
        // 语句内容过长时截断（避免控制台换行混乱）
        const content = stmt.content.length > 80
            ? `${stmt.content.slice(0, 80)}...`
            : stmt.content;
        stmtStr += `${C.KEY}content${C.RESET}:${C.VALUE}${content}${C.RESET} `;
        stmtStr += `${C.POS}[${this.getPosStr(stmt.position)}]${C.RESET}`;
        console.log(stmtStr);
    }

    /** 工具方法：格式化位置信息为 行:列 -> 行:列 */
    private static getPosStr(pos: AstNode['position']): string {
        return `${pos.start.line}:${pos.start.column} -> ${pos.end.line}:${pos.end.column}`;
    }
}