# 此目录用于存放扩展自带的全局 YAML 命令定义。

YamlCommandLoader 会从 `out/dsl/global/` 读取本目录下的 `*.yml`，
为内置命令补充或覆盖补全定义（用户侧的 YAML 在 `.McfStudio/extra_command/`）。

本文件的作用：让 git 跟踪这个空目录。
`npm run compile` 的 cpSync 步骤要求 `src/dsl/global` 存在，
若无本文件则新克隆仓库时该目录不存在，compile 会抛 ENOENT。

用法：把全局 YAML 放在本目录，例如 `effect.yml`。
