# mcfunction-studio-for-1-12 README

[![Marketplace](https://img.shields.io/vscode-marketplace/v/Mcd0-LUO.mcfunction-studio.svg?flat-square&label=marketplace
)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)
[![Downloads](https://img.shields.io/visual-studio-marketplace/i/Mcd0-LUO.mcfunction-studio.svg?logo=visual-studio-code&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)

***
#### 本拓展为原拓展 McFunction Spirit for 1.12.2 的后续重构开发版本
    Author Mcd0_LUO (小罗)
***
### 插件说明
* 建议使用saves/***/data 即存档目录下的data文件夹作为工作区 (其实只要工作区包含data且其下存在functions的结构即可)
* 如有任何拓展问题请以 qq | qq邮箱 联系开发者   id: 1473522801

***
### 功能介绍
定义跳转:
- 按住 **ctrl** 并点击 记分板|函数|进度| 标签 #TODO |假玩家#TODO 可跳转至定义

命令补全:
- 输入命令部分，自动弹出补全项，按下tab补全，可使用方向键选择补全项

文本组件预览:
- 光标移动至含tellraw | title 命令的行，将预览内容(仅单行带颜色)

快速创建函数:
- 方法一: 右键左侧工作区目录，点击新建mcfunction文件
- 方法二: 在任一函数文件中，输入function xxx:xxx ，按住ctrl并点击路径， 若存在则跳转至定义，否则创建并跳转

快捷操作:
- 在编辑区域右键可插入快速记分板debug，tellraw本函数用到的所有记分板

宏定义：
- 所有宏必须在 工作区根目录/mcmacro 文件夹下定义，也就是与functions | advancements | loot_tables 文件夹同级
- 装载宏的文件必须以 .mcmacro 为后缀， 宏文件取名不影响命名空间， 一个宏文件可以定义多个宏， 宏可以以不同参数数量重载
```mcmacro
//行注释
/**
*宏文档注释
*/
/*块注释 *|
1**
* 定义宏
*其中type，default_value为可选项,可填任意符合值规范的值,可以为 字符串字面量 "hello", 数字 123, 等任意连续字符
*name遵循一般编程语言的命名规范
*1
define name(param1:type =default_value,param2:type =default_value) {
    //使用$(xxx)来引用宏参数
    scoreboard players set @s $(param1) $(param2)
}

// 省略版本
define name(param1,param2){
    scoreboard players set @s $(param1) $(param2)
}
//支持嵌套宏，且宏参数可以为自身宏参数引用
define test(num:int){
    //假设当前文件在mcmacro/demo文件夹下，则应采用命名空间.宏名的方式调用宏
    //嵌套调用已定义的name宏 (引用自身宏参数是被允许的)
    demo.name(random ,$(num))
}
```
宏使用
```mcfunction
#这里采用简单逻辑介绍
#因为定义了demo.name宏，假设我们要设置记分板temp值为100
#一般写法scoreboard players set @s temp 100
# 宏写法
demo.name(temp, 100)
#之后按右上角运行宏展开｜或者调用命令mcf-studio.unfoldMacro
#demo.name(将展开成三个部分)
#1：元信息起始部分。
#@macro start: $test.set_num(temp,100)
# 2：宏内容
scoreboard players set @s temp 100
#3:元信息结束部分
#@macro end
#如若想折叠宏回到运行前状态，调用命令mcf-studio.foldMacro即可
```

### 已知问题
- NONE

TODO:
- 批量存档队伍管理
- 批量存档记分板管理
- 存档玩家数据管理
- 批量存档区块管理
- 批量存档实体清理
- 标准化函数文档
- 可视化编辑原始nbtCompound文件(*.dat,*.mca)
- ... 敬请期待
***
 