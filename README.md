[English](README.md) | [简体中文](README.zh-CN.md)

# Mcfunction Studio for 1.12

[![Marketplace](https://img.shields.io/vscode-marketplace/v/Mcd0-LUO.mcfunction-studio.svg?flat-square&label=marketplace)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)
[![Downloads](https://img.shields.io/visual-studio-marketplace/i/Mcd0-LUO.mcfunction-studio.svg?logo=visual-studio-code&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mcd0-LUO.mcfunction-studio)

A VS Code extension for **Minecraft 1.12.2** datapack development: completion, navigation,
diagnostics and refactoring for `.mcfunction` files.

Successor to *McFunction Spirit for 1.12.2*, rewritten and maintained by **Mcd0_LUO**.

---

## Features

### Command completion
A hand-written 1.12.2 command tree (42 commands) drives context-aware completion.
Press <kbd>Tab</kbd> to accept, arrow keys to browse.

> The tree models **1.12.2** syntax, not 1.13+. `execute` has no `run` keyword,
> `clone` takes `[maskMode] [cloneMode] [TileName] [dataValue]`, and so on.

### Diagnostics
15 rules report problems inline while you type. Every rule can be set to
`off` / `hint` / `information` / `warning` / `error` through `mcfStudio.diagnostics.rules`.

| Group | Examples |
|-------|----------|
| Syntax | unknown command, too many arguments, the 1.13 `run` keyword after `execute`, unknown command after `execute` |
| References | undefined scoreboard objective / team / tag / advancement / **function** |
| Duplicates | the same objective or team defined more than once |
| Values | integer outside int32, objective name > 16 chars, display name > 32 chars, inverted `score_X_min` / `score_X` range |

Diagnostics stay quiet while you are still typing a token, and are suppressed entirely
when no datapack is loaded — a wall of red is worse than no diagnostics at all.

### Go to definition
<kbd>Ctrl</kbd>+Click a scoreboard objective, function, advancement, tag, fake player or team
to jump to where it is defined.

### Find references and rename
<kbd>Shift</kbd>+<kbd>F12</kbd> lists every reference across the datapack.
<kbd>F2</kbd> renames a symbol and updates the definition plus all references —
including the objective name inside selectors such as `@a[score_points=10]`.

Matching is by **role**, not by raw text: an identical string inside a `say` message is
never touched.

### Text component preview
Move the cursor onto a line containing `tellraw` or `title` to preview the rendered
component (single line, colours included).

### Create a function file
- Right-click a folder in the Explorer → **新建mcfunction文件**
- Or <kbd>Ctrl</kbd>+Click the path in `function ns:path/to/fn` — jumps if it exists,
  otherwise creates the file and opens it

### Fast scoreboard debug
Right-click in the editor → **插入快速记分板debug** to insert a `tellraw` that dumps every
scoreboard used by the current function.

### Custom commands via YAML
Drop `.yml` files into `.McfStudio/extra_command/` to teach the completion engine your own
commands. Subfolders are scanned recursively and edits hot-reload.
See [docs/yaml-command.md](docs/yaml-command.md) (Chinese).

---

## Getting started

1. Open your datapack's **`data`** folder as the workspace
   (typically `saves/<world>/datapacks/<pack>/data`).
   Any workspace root containing a `functions` directory works.
2. Open a `.mcfunction` file — the extension activates on the `mcfunction` language.
3. If the extension could not locate the datapack on activation, it says so once;
   run **Mcfunction Studio: 刷新函数|计分板|进度|标签池** after opening the right folder.
   Opening the datapack folder later also triggers an automatic retry.

### Configuration

Everything lives in `data/.McfStudio/`:

| Path | Purpose |
|------|---------|
| `McfunctionStudio.json` | ignore patterns, concurrency, etc. |
| `extra_command/*.yml` | custom command definitions |
| `index-cache.json.gz` | index cache (1.5.0+). **Safe to delete** — it is rebuilt on next open, and invalidated automatically whenever a `.mcfunction` file changes. |

---

## Commands

| Command | Default keybinding |
|---------|--------------------|
| Mcfunction Studio: 新建mcfunction文件 | — |
| Mcfunction Studio: 刷新函数\|计分板\|进度\|标签池 | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> |
| Mcfunction Studio: 插入快速记分板debug | — |
| Mcfunction Studio: DSL管线调试: 切换日志开关 | — |

> Command titles are currently Chinese only. Localising them via `package.nls.json` is on
> the roadmap.

---

## Documentation

The in-depth documentation is currently **Chinese only**:

- [Quick start](docs/quickstart.md)
- [Custom YAML commands](docs/yaml-command.md)
- [Command-tree DSL guide](docs/dsl-guide.md)
- [Changelog](CHANGELOG.md)

---

## Development

```bash
npm run compile

npm run test:purity        # layering guard: pure layers must not import vscode
npm run test:engine        # completion engine behaviour
npm run test:diagnostics   # diagnostic rules + symbol extraction
npm run test:index         # index / disk-cache serialisation
npm run test:baseline      # 1.12.2 command-tree baseline
npm run test:e2e           # real VS Code integration (needs a local VS Code)

npm run bench:perf                      # synthetic datapack load / complete
npm run bench:perf -- --quiet           # lighter load
npm run bench:real -- "D:/path/to/data" # measure a real datapack
```

See [docs/AGENT.md](docs/AGENT.md) for architecture notes and the design constraints that
matter before changing anything.

---

## Known issues

None currently.

## Roadmap

- Bulk team / scoreboard / player-data / chunk / entity management
- Standardised function documentation
- Visual editor for raw NBT compound files (`*.dat`, `*.mca`)

---

## A note on the removed macro feature

The custom macro language (`mcmacro`) was introduced in 1.3.0 and **removed in 1.5.1**.

- `.mcmacro` files are no longer recognised.
- Leftover `#@macro start: ...` / `#@macro end` blocks are plain comments — clean them up
  manually if you like.
- `IgnorePattern.Macro` is kept in the config schema only for backwards compatibility and
  no longer has any effect.

---

## Contact

Bug reports and questions: QQ **1473522801**, or open an issue on
[GitHub](https://github.com/Mcd0LUO/Mcunction-Studio-for-1.12.2/issues).
