<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Opensidian · macOS fork 说明

`douh/opensidian` 与 [jpzk/opensidian](https://github.com/jpzk/opensidian) 是**共生**关系，不是简单的 fork：上游是宿主，提供 Linux 优先的实现、文件格式与规则；本仓库是 macOS 共生层，提供打包、App Sandbox、本地化与只读 MCP。两边各自演化、互不吞并，边界与契约写在 [`PRERULES.md`](PRERULES.md) §0。

**为什么单独一个文件。** `README.md` 与上游**逐字一致**（任何时候 `git diff origin/main -- README.md` 都应为空），所以上游改 README 时不会产生合并冲突。fork 自己的说明——macOS 打包与签名、App Sandbox、界面语言、只读 MCP 服务器——全部写在这里。要加 fork 专属文字，请加在本文件，不要加回 `README.md`。

**规则也是同样的分层。** `AGENTS.md` 与上游**逐字一致**（`git diff origin/main -- AGENTS.md` 应为空）；fork 自己的规则写在 [`PRERULES.md`](PRERULES.md)——文档分层、想法 → 架构 → 提案的三阶段、macOS 平台与 App Sandbox、MCP 只读边界。动手之前先读它，再读 `AGENTS.md`。想法稿 `IDEA-*.md` 与计划 `PLAN-*.md` 只留本地（`.git/info/exclude`），永不提交。

上游 README 里的 Linux 安装包、`SHA256SUMS` 与其 GPG 签名都来自上游，本 fork 不发布任何签名构建；macOS 请按下文从源码构建。

## 这个 fork 改了什么

| 方向 | 内容 |
|---|---|
| macOS 打包 | `packaging/macos/make-app.sh` 产出 `src-tauri/target/macos/Opensidian.app`（ad-hoc 签名、App Sandbox、原生标题栏与红绿灯按钮） |
| 界面语言 | 英文 / 简体中文，跟随系统；设置、命令面板、热键页、状态栏等界面文案已本地化 |
| MCP | `.app` 内含只读的 `opensidian-mcp`（stdio），供任意本地 MCP 客户端读取仓库 |
| 渲染 | 阅读视图的代码高亮、Mermaid 与公式，以及 Live Preview 里的围栏块；` ```mermaid ` 围栏内还有语法提示与解析错误提示（上游尚未实现，见下文「Mermaid」两节） |
| 其余 | 跟随上游（Linux 包、Landlock 自沙盒、插件市场、主题等行为不变） |

## 安装

本 fork 不发布签名构建，也没有公证（notarisation）。本地构建出的 `.app` 是 ad-hoc 签名，可以在**构建它的这台机器**上直接运行；拷贝到别的机器仍会被 Gatekeeper 拦下，需要 Developer ID 与公证，而签名密钥不在仓库里，也不由代理持有。

```sh
cp -R src-tauri/target/macos/Opensidian.app /Applications/
open /Applications/Opensidian.app
```

从 Finder 首次启动时，系统会通过原生文件夹选择面板询问仓库目录（见下文 App Sandbox）。

## 从源码构建

环境：macOS（已在 2026-10-25 于 macOS 27.0.1 / arm64、Rust 1.99.1 上验证）。上游 README 里的系统依赖是 Linux 专用；macOS 只需要 Xcode 命令行工具（链接器，`xcode-select --install`），WebKit 属于系统组件，无需额外安装。

```sh
git clone https://github.com/douh/opensidian && cd opensidian
cd src-tauri
cargo build --release --locked      # -> target/release/opensidian
./target/release/opensidian ~/Notes # 命令行给路径只是暗示，首次仍会弹出文件夹授权面板
cargo test --locked                 # Landlock 相关测试在 macOS 上自行跳过
```

要得到 Finder 能双击的包（脚本按自身位置解析仓库根目录，在哪个目录执行都可以）：

```sh
packaging/macos/make-app.sh         # -> src-tauri/target/macos/Opensidian.app
OPENSIDIAN_SKIP_BUILD=1 packaging/macos/make-app.sh   # 复用已有 target/release 二进制
```

需要安装镜像时：

```sh
hdiutil create -volname Opensidian -srcfolder Opensidian.app -ov -format UDZO Opensidian.dmg
```

构建细节：`src-tauri/tauri.macos.conf.json` 打开 `decorations` 并用 `titleBarStyle: Overlay`，所以关闭/最小化/缩放是真实的红绿灯，页面内容延伸到标题栏下方（`ui/style.css` 在 `body.mac` 下隐藏 Linux 自绘的窗口条与缩放角）。红绿灯所在的那条 28px 空白带（`.app-container` 的 `padding-top`）就是窗口标题栏：拖它移动窗口，双击它把窗口铺满可见屏幕（macOS 的 zoom，等价于系统「双击标题栏」，不是全屏）——开满标签、每个窗格标题条都被占满时，这条带仍然可用（`ui/main.js` 的 `wfMacBand`/`wfBandPx`；带高从 CSS 读取，两处不会各写一个 28）。插件看到的宿主也是真实的：`os.platform()` 与 `process.platform` 回答 `darwin`，架构为 `arm64`/`x64`，而不是硬编码的 `linux`。

## App Sandbox

`.app` 运行在 App Sandbox 内（`packaging/macos/Opensidian.entitlements`，由 `make-app.sh` 施加）：

- 写入落在 `~/Library/Containers/dev.koto.opensidian`；
- 沙盒外的仓库目录只能通过原生文件夹面板授权，授权以 security-scoped bookmark 形式保存在容器内 `.opensidian.json` 的 `vault_bookmarks` 里，下次启动直接打开、不再询问；
- 命令行传路径**不是**授权：首次启动仍会弹面板，以你选择的文件夹为准并记住它；
- 偏好文件也搬进了容器，旧的 `~/.opensidian.json` 不会被继承——选一次仓库即可；
- 「打开另一个仓库」仍可用：一个进程一个仓库，授权在启动新进程之前写入配置。

启动日志会自我说明：`[sandbox] app-sandbox=on …`、容器内写入成功、真实 home 写入被拒。如果第二条出现了 `ALLOWED`，说明沙盒已经失效。

## 界面语言（English / 简体中文）

三种入口，切换后 `location.reload()`：

1. **设置 ▸ 通用 ▸ 语言**（下拉：跟随系统 / English / 简体中文）；
2. 命令面板的 *Switch interface language*（`""` 跟随系统 → `zh-CN` → `en` 循环）；
3. 启动时设 `OPENSIDIAN_LOCALE=zh-CN`（或 `en`）。

解析顺序：localStorage 的 `os.locale` → `OPENSIDIAN_LOCALE` → 系统语言（`zh*` 归到 `zh-CN`）；`<html lang>` 同步更新。

实现方式是 gettext 风格的「英文即 key」：`ui/i18n.js` 的 `ZH` 字典 + `PATTERNS`（带数字的串，如 `Version 0.9.0`、`Conflicts 2`）。为避免翻译到用户内容，静态文本只翻译 `STATIC` 白名单（`title` / `aria-label` / `placeholder` / 文本），控件默认值只翻译 `VALUES` 白名单；文件名、笔记标题、仓库路径永远不会被翻译。命令面板与热键筛选会同时匹配英文与译文，文件快速切换只匹配文件名。

已覆盖：设置导航与各分区标题、设置行标签、命令面板与热键命令名、仓库选择器与四个对话框的静态文本、状态栏计数单位，以及画布工具栏提示与帮助面板（`canvas-nav.js`）。尚未覆盖（仍为英文）：设置行的长描述、右键菜单、toast 通知、原生 macOS 菜单（`Settings…` 等在 Rust 侧硬编码）、插件自带的文案，以及画布设置面板与画布内其余对话框（`canvas-*.js` 约百条文案）。品牌名（`Bases`）与图形参数名刻意保留英文。

## MCP 服务器（只读）

`.app` 内含 `Contents/MacOS/opensidian-mcp`：一个围绕单个仓库的只读 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，任何本地 MCP 客户端都可以用（Claude Desktop、Cursor、你自写的脚本……）。它走 stdio（每行一条 JSON-RPC，不监听 HTTP），所以所有客户端都只需要两项：

- command：`/Applications/Opensidian.app/Contents/MacOS/opensidian-mcp`
- args：仓库的绝对路径，例如 `/Users/you/Notes`（也可以不给参数，改用环境变量 `OPENSIDIAN_VAULT`）

有 JSON 配置的客户端加上一段 `mcpServers`：

```json
{
  "mcpServers": {
    "opensidian": {
      "command": "/Applications/Opensidian.app/Contents/MacOS/opensidian-mcp",
      "args": ["/Users/you/Notes"]
    }
  }
}
```

只提供表单的客户端填同样三件事：传输方式 **stdio**（不是 HTTP）、上面的命令、仓库路径作为参数。添加后重连或重启客户端。

工具：

- `list_notes`：相对路径列表，可选 `folder` / `limit`；
- `read_note`：UTF-8 文本，默认在 200 KB 处截断并注明；
- `search_notes`：大小写不敏感的子串搜索，返回文件 + 行号 + 匹配行。

不写任何东西：`.obsidian/`、`.git/`、`.trash/`、`node_modules/` 不会被列出或搜索，逃出仓库的路径会被拒绝。

这个 helper 刻意放在 App Sandbox **之外**：它由 MCP 客户端直接启动，不继承 `.app` 的任何东西，而且必须能读你指定的目录。它和任何本地 MCP 服务器一样以你的用户权限运行，且只读。`make-app.sh` 先签它、且不加 entitlements，正是这个原因。

Linux 上它是同一构建的第二个二进制（`target/release/opensidian-mcp`），用法相同。

## 仍在等待 macOS 实现的两项

两者都是管线而非功能：

- **Landlock 自沙盒**（`OPENSIDIAN_LANDLOCK=1`）：Linux LSM，macOS 没有对应物，启动行会写 `landlock: off (not available on this platform)`；macOS 上的隔离由上面的 App Sandbox 负责。
- **密钥存储**：freedesktop Secret Service（gnome-keyring / KWallet / KeePassXC）在 macOS 上不可用，需要保存 API key 的插件会报告 unsupported；macOS Keychain 尚未接入。

## 插件市场下载与代理

插件浏览与安装在 macOS 上走系统 `/usr/bin/curl`（每个重定向跳都单独发请求，所以 allowlist 与字节上限仍然逐跳生效）。curl 不自己读取 macOS 网络设置：没有 `*_proxy` 环境变量、也不是手动启动时，代理从 `scutil --proxy` 读出并以 `--proxy` 传入——所以从 Finder 启动、处在代理网络里的 `.app` 访问 GitHub 的方式与浏览器一致。

## 更新检查

**设置 ▸ 通用 ▸ 检查更新** 会把本构建分别与 fork 自己的 release 列表、以及可选的本地构建目录比较，两个答案分开显示；只提供 reveal / download，不会声称自己验证不了的签名，在 App Sandbox 内也无法安装。

## 与上游同步

```sh
git fetch origin
git merge origin/main      # README.md 逐字一致，冲突只会来自真正的代码改动
cargo test --locked        # src-tauri/
```

大改动的上游合并建议先在临时 worktree 里试合、解决冲突、跑测试，验证后再 `git merge --ff-only` 合入 `macos`。

**回流。** 共生层里与平台无关、对上游也有价值的部分（macOS 的 syscall 映射、`host_js`、界面语言、Live Preview 的围栏与 Mermaid 渲染）以 PR 提交上游；上游不接也照常自用。回流只动代码与测试，**不动** `README.md` 与 `AGENTS.md`——这两份的逐字一致本身就是回流的礼貌。上游改动合并后，跑一遍 `PRERULES.md` §4 的共生自检，确认共生层引用的上游符号还活着。

## Mermaid：若上游也做了，怎么和平合并

上游只留了槽位、没留实现：`ui/plugins/api-functions.js` 的 `loadMermaid` 至今是 `Promise.reject`（注释写 *"still not vendored"*）。本 fork 把这一格填满——`ui/vendor/mermaid/` 的 11.17.2 字节，阅读视图（`main.js` 的 `drawMermaid`）与 Live Preview（`editor.js` 的 `BlockW`）共用同一个实例。上游迟早可能自己实现一版（甚至只做低功能版），所以冲突面与取舍先钉在这里。

冲突面只有四处，且都可预测：

| 位置 | 本 fork 的实现 | 上游若动手时的取舍 |
|---|---|---|
| `api-functions.js` 的 `loadMermaid` | 真加载 vendored 字节；`startOnLoad:false`、`securityLevel:"strict"`、按当前主题初始化 | **取上游**；只把 strict / 关自动扫描 / `'self'` 懒加载留下。上游若用 `loose` 或改 CSP 加 eval → **拒绝** |
| `main.js` 的 `preview()` 后处理 | 一行 `drawMermaid(g.preview, src);` + 两个函数（选择器驱动、`isConnected` 守卫，天然幂等） | 上游自渲染则**取上游**、删我们这两处；`.bad` 兜底与 scratch 节点清理尽量以补丁形式加回 |
| `editor.js` 的块机制 | `k === "mermaid"` 分支 + `mmdCache`(40) / `mmdPending` / 待定态显示源码 / 高度预估 | 上游做 LP 块 → 用他们的解析与块机制，把我们的缓存、去重、待定态搬过去；上游不做 → 原样保留（这是我们的差异点） |
| `ui/vendor/mermaid/` | 11.17.2 字节 + `VENDOR.md` / `SHA256SUMS` / `LICENSE` | 上游 vendor → **取上游的版本与字节，删我们的目录**；`VENDOR.md`、`SHA256SUMS`、`THIRD-PARTY.md` 条目按上游的 pin 重写 |

三条底线，任何合并结果都必须仍然成立（功能少可以，质量底线不行）：

1. `securityLevel:"strict"`、无 eval、CSP 里没有裸 `'unsafe-eval'`（只保留既有的 `'wasm-unsafe-eval'`）；
2. 懒加载（不含 ` ```mermaid ` 的笔记不加载 3.4 MB）与失败兜底（显示源码，不是空盒）；
3. 平台无关：`frontendDist` 一份字节，`tauri.macos.conf.json` 不覆盖 `csp` 与 `resources`。

这三条已固化为 `src-tauri/tests/mermaid_pin.rs`（8 条断言，含**字节 sha256 实测**）。合并上游后：

```sh
cargo test --locked --test mermaid_pin   # 红了=某条底线被静默抹掉，读下面板再取舍
cargo test --locked
```

测试红不是 bug，是**合并决策**：按上表逐条落定，再手工开一张含 ` ```mermaid ` 的笔记，阅读视图与 Live Preview 各看一眼。若上游只实现低功能版（无兜底、无 LP），我们的取舍是"用他们的渲染路径，把我们的兜底作为小补丁加回"，而不是整段回退。

## Mermaid：围栏里的语法提示

围栏内写图时，两件事有提示：**能写什么**（补全）与**哪儿写错了**（解析错误）。两者共用一份知识源 `ui/mermaid-syntax.js`（普通 `<script>`，在 `main.js` 之前加载），不新增任何 vendored 包——`@codemirror/autocomplete` 与 `@codemirror/lint` 虽已随 `ui/vendor/codemirror/cm6.js` 存在，但 app 的补全一直是自研弹窗（`[[` 链接就是它），再用一套 CM6 扩展只会多出一条并行路径。

- **补全（输入流，不是"文档变了就弹"）**：`Ed.onUpdate` 把本次更新交给 `showAc(g, u)`；`acTypedChar(u)` 先看 CM6 给这次事务打的来源标注，**只有 `input.type` 才算打字**——粘贴、撤销、拖放、程序化插入一律不弹，所以不用去猜"这次改动像不像打字"。随后 `mmdContext(g, u)` 过三道闸：围栏（`fenceOf` 委托 `Ed.fenceAt`，与渲染器同一函数）、位置（`statementStart`：这个词必须从行首缩进后开始，节点标签 `A[Start`、边文本 `|open|`、标题里一律不弹）、词表（`suggest`，按前缀过滤，26 种图型或该图型关键字；`%%` 注释行不弹）。快打时两个字符可能并进一次事务，取最后一个字符判断即可，列表照常出现。
- **键位**：列表打开时 ↑/↓ 只移选择（光标不动）、Enter/Tab 取用、Esc 关闭、其余可打印键（空格/标点/引号）先关列表再落到编辑器——下一个键永远是用户想按的那个；取用经 `Ed.acInsertText` 走编辑器模型（行锚定、一次撤销、同脏标记），光标停在词尾，不展开模板。光标自己移动（方向键、点击、Home/End）由 `acMmdClose` 关列表；`[[` 补全的行为不变。
- **错误**：解析失败时阅读视图与 Live Preview **都**保留源码，并在下面追加一行解析器自己的话（`MmdHints.errText` 把 jison 的 `Parse error on line N: … Expecting …` 压成一行，行号只取自 `hash.loc`，不臆造）。空盒是绝不会出现的失败形态。
- **真实性**：`HINTS-BEGIN/HINTS-END` 之间的每个字符串都是"词表声明"，`src-tauri/tests/mermaid_hints.rs` 逐条在 `ui/vendor/mermaid/mermaid.min.js` 里查存在——提议 Mermaid 会拒绝的语法比不提更糟。因此 `zenuml`（11.17.2 的解析图里没有该 parser）与 ER 基数符号（压缩后的 lexer 由碎片拼出，无字面量可查）**故意不收**。
- **自检**：纯函数的场景挂在 `Ed.selfTest()` 里，启动即在真机跑一遍，失败会以 `[edt:mmd:…]` 出现在窗口标题（正常是 `[edt:ok]`）；探针另有 `[mmd:n:首个候选]` 与 `[mmderr:一行错误]` 两个 census token。

真机验证（macOS 探针，非自动化测试，输入法切 ABC 后按键才不被候选栏截走）：围栏内打 `b`（接在 `sub` 后）弹出唯一候选 `subgraph`，Enter 取用后落盘；一次 `keystroke` 连发 `su`（并批）同样弹出；空格落下且列表当场关闭、此时 Enter 才是换行；Esc 关闭；粘贴 `xy` 与在 `A[Open] --> B` 这一行中段打 ` e` 都**不**弹；坏图在阅读视图与 Live Preview 各显示 `line 2: A[Start] -->|open| (`。

合并姿态：上游若自带补全，**取上游**的弹窗与词表，我们只把 `errText` 那行错误说明与 `.mmderr` 样式作为小补丁加回；若上游不做，这整块原样保留（`mermaid_hints.rs` 的 9 条断言保证它不会被某次重构顺手删掉）。

## 许可

GPL-3.0-or-later，与上游相同（[LICENSE](LICENSE)）。再分发前请阅读 [THIRD-PARTY.md](THIRD-PARTY.md)。

---

本文件以简体中文书写，面向中文读者；英文的项目概览与 Linux 用法见上游 [README.md](README.md)。
