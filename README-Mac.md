<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Opensidian · macOS fork 说明

`douh/opensidian` 与 [jpzk/opensidian](https://github.com/jpzk/opensidian) 是**共生**关系，不是简单的 fork：上游是宿主，提供 Linux 优先的实现、文件格式与规则；本仓库是 macOS 共生层，提供打包、App Sandbox、本地化与只读 MCP。两边各自演化、互不吞并，边界与契约写在 [`PRERULES.md`](PRERULES.md) §0。

**为什么单独一个文件。** `README.md` 与上游**逐字一致**（任何时候 `git diff origin/main -- README.md` 都应为空），所以上游改 README 时不会产生合并冲突。fork 自己的说明——macOS 打包与签名、App Sandbox、界面语言、只读 MCP 服务器——全部写在这里。要加 fork 专属文字，请加在本文件，不要加回 `README.md`。

**规则也是同样的分层。** `AGENTS.md` 与上游**逐字一致**（`git diff origin/main -- AGENTS.md` 应为空）；fork 自己的规则写在 [`PRERULES.md`](PRERULES.md)——文档分层、想法 → 架构 → 提案的三阶段、macOS 平台与 App Sandbox、MCP 只读边界。动手之前先读它，再读 `AGENTS.md`。想法稿 `IDEA-*.md` 与计划 `PLAN-*.md` 只留本地（`.git/info/exclude`），永不提交。

上游 README 里的 Linux 安装包、`SHA256SUMS` 与其 GPG 签名都来自上游；本 fork **不发布任何二进制**（GitHub Releases 留空，只有源码），macOS 请按下文从源码构建。

## 这个 fork 改了什么

| 方向 | 内容 |
|---|---|
| macOS 打包 | `packaging/macos/make-app.sh` 产出 `src-tauri/target/macos/Opensidian.app`（ad-hoc 签名、App Sandbox、原生标题栏与红绿灯按钮）；`make-dmg.sh` 再出安装镜像，给了 Developer ID 与公证凭据时一并签名、公证、staple |
| 界面语言 | 英文 / 简体中文，跟随系统；设置、命令面板、热键页、状态栏等界面文案已本地化 |
| MCP | `.app` 内含只读的 `opensidian-mcp`（stdio），供任意本地 MCP 客户端读取仓库 |
| 渲染 | 阅读视图的代码高亮、Mermaid 与公式，以及 Live Preview 里的围栏块；` ```mermaid ` 围栏内还有语法提示与解析错误提示（上游尚未实现，见下文「补全」与「Mermaid」两节） |
| 其余 | 跟随上游（Linux 包、Landlock 自沙盒、插件市场、主题等行为不变） |

## 安装

本 fork 暂不发布二进制安装包：GitHub Releases 留空，分发的是源码，`.app` 与 `.dmg` 请自己构建。仓库里也没有签名密钥，也不由代理持有（`AGENTS.md` 的 *Releases*）。默认构建出的 `.app` 与 `.dmg` 是 ad-hoc 签名，可以在**构建它的这台机器**上直接运行；拷贝到别的机器会被 Gatekeeper 拦下。要让安装包能发给别人，用自备的 Developer ID 走一遍签名 + 公证（脚本已就位，见下文「分发：Developer ID 与公证」）。

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

需要安装镜像时（卷内是 `.app` 加一个 `/Applications` 快捷方式，拖一下就装）：

```sh
packaging/macos/make-dmg.sh                          # -> src-tauri/target/macos/Opensidian-<version>-macos-<arch>.dmg
OPENSIDIAN_SKIP_BUILD=1 packaging/macos/make-dmg.sh  # 复用已有 target/release 二进制
OPENSIDIAN_SKIP_APP=1 packaging/macos/make-dmg.sh    # 连 .app 也复用（版本必须与 tauri.conf.json 一致）
```

文件名里的版本取自 `src-tauri/tauri.conf.json`，因为**设置 ▸ 通用 ▸ 检查更新**是从文件名（`src-tauri/src/updates.rs::scan_dir` 的 `Opensidian-<version>-*.dmg`）读出本地构建的版本的，改名会让它认不出这个包。

构建细节：`src-tauri/tauri.macos.conf.json` 打开 `decorations` 并用 `titleBarStyle: Overlay`，所以关闭/最小化/缩放是真实的红绿灯，页面内容延伸到标题栏下方（`ui/style.css` 在 `body.mac` 下隐藏 Linux 自绘的窗口条与缩放角）。红绿灯所在的那条 28px 空白带（`.app-container` 的 `padding-top`）就是窗口标题栏：拖它移动窗口，双击它把窗口铺满可见屏幕（macOS 的 zoom，等价于系统「双击标题栏」，不是全屏）——开满标签、每个窗格标题条都被占满时，这条带仍然可用（`ui/main.js` 的 `wfMacBand`/`wfBandPx`；带高从 CSS 读取，两处不会各写一个 28）。插件看到的宿主也是真实的：`os.platform()` 与 `process.platform` 回答 `darwin`，架构为 `arm64`/`x64`，而不是硬编码的 `linux`。

## 分发：Developer ID 与公证

两个脚本把「能在这台机器跑」和「能发给别人」分开，并且**不会假装**后者已经做到：缺证书或缺凭据时，它们照常产出 ad-hoc 构建，然后在最后一行说明这个包只在本机可用。

需要的三样东西都在你自己的钥匙串 / Apple 开发者账号里，**不进仓库、不写进脚本**（`AGENTS.md` 的 *Releases*）：

| 东西 | 从哪来 | 用在哪 |
|---|---|---|
| Developer ID Application 证书 | Apple 开发者账号 → Certificates → 导入登录钥匙串 | `OPENSIDIAN_SIGN_ID`（`security find-identity -v -p codesigning` 里带 `Developer ID Application: 名字 (TEAMID)` 的那一行） |
| 公证凭据 | `xcrun notarytool store-credentials <名字>`，只做一次 | `OPENSIDIAN_NOTARY_PROFILE`（钥匙串里的 profile 名） |
| 或者 Apple ID 三件套 | App Store Connect 的 app-specific password | `OPENSIDIAN_NOTARY_APPLE_ID` / `_TEAM_ID` / `_PASSWORD`（密码建议写 `@keychain:项名`，免得出现在 `ps` 里） |

```sh
xcrun notarytool store-credentials os-notary \
    --apple-id "you@example.com" --team-id "TEAMID" --password "@keychain:AC_PASSWORD"

OPENSIDIAN_SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
OPENSIDIAN_NOTARY_PROFILE=os-notary \
packaging/macos/make-dmg.sh
```

脚本做的事，顺序固定（每一步失败都会停下，不会带着半个结果往下走）：

1. `make-app.sh` 用 Developer ID 签两个二进制——先 `opensidian-mcp`（**不带** entitlements，它必须能读外部 vault），再整个 bundle（带 App Sandbox entitlements），都加 `--options runtime --timestamp`；
2. 把 `.app` 打成 zip 送公证，Accepted 后 `stapler staple` 到 `.app` 本身——这样用户从 DMG 里拖到 `/Applications` 的那份，离线首启也能过 Gatekeeper；
3. 生成 `Opensidian-<version>-macos-<arch>.dmg`（`.app` + `/Applications` 快捷方式，UDZO 只读卷），用同一身份签 DMG；
4. DMG 再送一次公证、Accepted 后 staple 到 DMG；
5. 打印 `hdiutil verify`、`stapler validate` 与 Gatekeeper 自己的判定（`spctl -a -t open --context context:primary-signature -vv`）、`shasum -a 256`。

两次公证（app 与 dmg）而不是一次，是为了让「从 DMG 里拷出来的 app」和「DMG 本身」各自都有 ticket；只公证 DMG 时，被拷出来的 app 首次离线启动仍会被拦。`OPENSIDIAN_NO_NOTARIZE=1` 明确跳过公证，只签名出镜像。

验证一个已经发出的包（在任何一台 Mac 上）：

```sh
spctl -a -t open --context context:primary-signature -vv Opensidian-0.9.0-macos-arm64.dmg   # accepted / source=Notarized Developer ID
xcrun stapler validate Opensidian-0.9.0-macos-arm64.dmg
codesign -dv --verbose=4 /Applications/Opensidian.app                                      # Authority=Developer ID Application …，flags 含 runtime
```

ad-hoc 构建（不带 `OPENSIDIAN_SIGN_ID`）的预期结果是 `spctl` 报 `rejected`——这是未签名分发的正常回答，不是打包失败。

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

## 补全：一个引擎，两个提供者（`ui/hint-core.js`）

`[[` 链接补全与 mermaid 关键字补全曾各自维护半截输入流：什么时候弹、光标动了算不算结束、键位归谁、取用走哪条插入路径，散在 `showAc`/`acKeydown`/`acMmdClose` 里，一处改动另一处就失配。**这两件事本来就是同一件事**——"光标所在处允许写什么、按了什么键、取用后落到哪"——所以现在只有一份实现，按依赖单向分成四层：

| 层 | 文件 | 只负责 |
|---|---|---|
| L0 知识 | `ui/mermaid-syntax.js`、`ui/hint-nav.js` + `ui/hint-nav.json` | 词表 + 纯函数（围栏、语句起始、前缀过滤、错误措辞、ADR-8 的上下文分类 `helpOf`）；语法导航的机器表（见「Mermaid」一节的「语法导航」）；不认识光标 |
| L1 引擎 | `ui/hint-core.js` | 状态机、上下文、意图、键位、异步归属；**无 DOM、无 app 全局** |
| L2 提供者 | `ui/hint-mermaid.js`、`ui/hint-wiki.js` | 为各自语法回答 `match`/`trigger`/`offer`/`commit`（mermaid 另有被动图层的 `panel`，ADR-8），只通过 host 接口说话 |
| L3 宿主 + 呈现 | `ui/main.js` | `hintHost(g)`（读模型与仓库）、`paintHints`（**唯一**写 `g.acEl` 的地方）与 `paintHelp`（ADR-8 图层的唯一写点） |

**上下文状态管理。** 每个 pane 一个引擎（`mkGroup` 里 `g._hints = HintCore.create(hintHost(g))`），列表状态跟着 pane 走。引擎把光标、本行前缀、围栏、本次键入收进一个 `ctx` 交给提供者；`state()` 给出可被 census/自检读取的快照（含 `at` 与 `fence`）。

**随光标而动。** 事件只有三个来源：编辑器事务（`sense`）、按键（`key`）、布局变化（`reanchor`）。规则集中在引擎里：
- 只有**打出来的字符**能开列表（`input.type` 事务；粘贴/撤销/删除/程序化插入只关不开）；
- 列表打开时，光标**仍在本词跨度内**就跟着重算（左/右移动即重新过滤），离开就结束；
- 空格/标点/回车让 `match` 不再成立，列表当场结束，而不是"先关、再让字符落进去"。

**用户意图。** `auto`（默认，打字即提示）/ `manual`（只有显式唤出才开：Ctrl+Space 或 Tab）/ `off`（永不），另有按提供者开关与**键位表** `keys`（`open`/`accept`/`dismiss`/`move`，默认值见下）；存在 `localStorage["os.hints"]`。命令面板一行 `hints:cycle-intent` 循环并给出提示当前值；`create(host, { mode, providers })` 可对单个引擎覆盖——自检据此在不改用户设置的前提下证明三种意图。

**异步归属。** `[[note#` 要跨文件读笔记，答案回来时光标可能已走。每次 `offer` 带一个 generation 令牌，只有最新那次允许上屏（旧实现里那句 `now.q !== ctx.q` 是这颗种子，现在是引擎级规则）。

**键位（ADR-7，已裁定 2026-10-30）**：引擎 `key(e)` 只回答"我要这个键"，`preventDefault` 由编辑器做（便于无事件对象地测试）。一个键不该同时背三种含义，所以 `Tab`、`Shift+Tab`、快速两次 `Tab` 各自对应一种情况；四张表都在 `os.hints` 的 `keys` 里，可改：

| 手势 | 列表开着 | 列表关着 |
|---|---|---|
| `Tab` | 取用当前候选（`accept`） | 只在**能开列表的槽**上打开（`open`；`manual` 意图下也算显式唤出），其余位置原样交给编辑器 |
| `Shift+Tab` | 结束列表且**不插入**（`dismiss`） | 交给编辑器（反缩进） |
| 快速两次 `Tab` | —— | 第一下开、第二下取用 = 直接要第一个候选；不在提示槽上就是两次缩进 |
| `↑` / `↓` | 移选择（`move`，表内顺序即下/上） | 编辑器 |
| `Enter` | 取用（`accept`） | 编辑器（换行） |
| `Esc` | 结束（`dismiss`） | 编辑器 |
| `Ctrl+Space` | —— | 显式唤出，除 `off` 外一律吞掉，免得插进一个空格 |

关键在于"**Tab 只在能开列表处被引擎吃掉**"：Mermaid/Markdown 很少真的用 Tab，但**缩进不能凭空消失**——围栏行首、正文、列表里的 Tab 仍归编辑器；mermaid 的 `subgraph` 体、Markdown 列表续行照常缩进。代价是：光标正落在某条语句的首词上时，第一下 Tab 开列表、第二下取用，想在那处缩进就得先改键（`HintCore.settings({ keys: { open: ["Ctrl+Space"] } })` 后 Tab 全部归还编辑器，未给的列表保持默认；旧版本存在顶层 `accept` 的设置文件会被一次性迁移进 `keys.accept`）。

**插入**：两个提供者都走 `host.replace(range, text)` → `Ed.replace`（模型、行锚定、一次撤销、同脏标记、同保存路径）；`Ed.acInsert`/`Ed.acInsertText` 因此删除，全 app 只剩一条插入路径。

**证据**：`Ed.selfTest()` 启动时用**假 host 驱动真引擎**跑一遍输入流（打字开、Enter 取用、空格/粘贴/光标离开结束、manual 与 off、异步过期丢弃、`[[` 与标题、Tab 开/双 Tab 取/Shift+Tab 不插入/无槽 Tab 归还），失败以 `[edt:hint:…]` 出现在窗口标题。`src-tauri/tests/hint_engine.rs`（10 条）钉住层序与边界：引擎无 `document`/`Ed.`、提供者只碰 host、意图键是 `os.hints`、每 pane 一引擎、键位归属、ADR-7 的三手势与可改绑、异步令牌，以及 ADR-8 的被动图层（无键、无插入路径、列表优先、`manual`/`off` 安静）；`tests/mermaid_hints.rs`（10 条）继续钉住 mermaid 的词表与连线、以及"只有打字能开"的输入流。`tests/hint_nav.rs`（5 条）钉住 mermaid 语法表。探针 token：`[hintmode:auto|manual|off]` 常在，`[hint:open:<provider>:<n>:<首个候选>]` 只在列表打开时出现，`[hinthelp:<provider>:<type>:<place>:<n>]` 在图层显示时出现（`type` 为 `-` 表示还没写图表指令）。

## Mermaid：围栏里的语法提示

围栏内写图时，两件事有提示：**能写什么**（补全）与**哪儿写错了**（解析错误）。知识源仍是 `ui/mermaid-syntax.js`（普通 `<script>`，在引擎与 `main.js` 之前加载），不新增 vendored 包——CM6 自带的 `@codemirror/autocomplete`/`lint` 虽已随 `ui/vendor/cm6` 存在，仍不使用，避免第二套并行路径。

- **补全**：`ui/hint-mermaid.js` 作为提供者回答四问——`match`（光标在 mermaid 围栏体内、落在**词**上、且这个词从语句起始处开始；节点标签 `A[Start`、边文本 `|open|`、标题是散文，不弹）、`trigger`（本次键入的是词字符）、`offer`（`M.suggest` 取围栏体内光标上方的行；替换跨度是本行这个词的列区间）、`commit`（经 host 插入）。围栏判定用 `M.fenceOf` → `Ed.fenceAt`，与渲染器同一个函数，所以能补的行一定是渲染器会画的行。
- **语法图层（ADR-8，已裁定 2026-10-31）**：补全只在"开始打一个词"时出现，新人进入一张空图时仍然不知道该写什么。因此引擎多了一个**被动**表面：光标只要落在 mermaid 围栏**体内**（两个 ``` 行除外），右侧就出现一块小卡，写着三件事——**这是哪个图**（`sequenceDiagram`…）、**光标站在哪一层**（`顶层语句` / `块内`，后者由 `subgraph`/`loop`/`class A {` 这类开启行与 `end`/`}` 的配对深度算出）、**此处可用的词**（直接取 `TYPES` 或 `KW`，所以依旧是 `mermaid_hints.rs` 对着 vendored bundle 查过的那批字符串）。围栏体还没有指令时，卡片列出的就是全部 26 种图表类型——这正是"用不全所有类型"的那一问。
  这块卡**不拥有任何键、不插入任何东西**：它是地图，不是菜单（插入仍走 ADR-7 的列表）。所以它可以在散文处（节点标签、边文本）出现而不改坏一行字；只在 `auto` 意图下出现（`manual`/`off` 保持安静），列表打开时让位（列表已经说了能取什么）。空行/`%%` 注释行/两个 ``` 行都不画。引擎侧是 `syncHelp()`（`sense` 与 `reanchor` 之后调用，`follow()` 供新建或获焦的 pane），快照里是 `help:{id,type,place,items,at}`；`main.js` 只有 `paintHelp` 一处画它（`.mmdhelp`，z-index 低于 `.ac`，`pointer-events:none` 所以卡片不抢文字上的点击，右侧放不下时翻到左侧）。真机量出两处需要改的地方并已改：①没有指令时标题已经写了"选择图表类型"，`place` 再写一遍就是同一句话两行，白占一行芯片 → 选择器返回 `place:""`，`paintHelp` 空则不出第二行；②卡高曾写死 `240px`，而卡片不接指针事件（滚不动），26 个类型芯片的最后一行被裁掉 → 高度改为按光标下方的剩余空间算（`box.style.maxHeight = max(80, content.clientHeight - top - 12)`）。
- **错误**：解析失败时阅读视图与 Live Preview **都**保留源码，并追加解析器自己的话（`MmdHints.errText` 把 jison 的 `Parse error on line N: … Expecting …` 压成一行，行号只取自 `hash.loc`，不臆造）。空盒绝不会出现。
- **真实性**：`HINTS-BEGIN/HINTS-END` 之间的每个字符串都是"词表声明"，`src-tauri/tests/mermaid_hints.rs` 逐条在 `ui/vendor/mermaid/mermaid.min.js` 里查存在——提议 Mermaid 会拒绝的语法比不提更糟。因此 `zenuml`（11.17.2 的解析图里没有该 parser）与 ER 基数符号（压缩后的 lexer 由碎片拼出，无字面量可查）**故意不收**。
- **语法导航**：光标停在 `A--` 后面该接什么，不是风格问题，是 mermaid 自己语法的事。两层各有各的答案：字符层由 lexer 决定（`o`/`x`/`>`/`-` 才是箭头，其他字符开始边文本，`"` 静默进 `string` 条件），token 层由 LALR 表决定（`A-->` 之时期望 13 个 token，含节点 `NODE_STRING`/`UNICODE_TEXT` 与开标签的 `PIPE`）。表不是手写的：`tools/vendor/flow-11.17.2.jison`（上游 `mermaid@11.17.2` 的 `flow.jison`，MIT，sha256 `b95d5a12…e384`）在**构建期**被 jison 0.4.18 编译一次，由 `tools/gen-hint-nav.js` 写成 `ui/hint-nav.json`（291 状态 / 4142 格 / 190 产生式 / 84 终结符 / 122 条词法规则 / 21 个条件，约 68 KB）。应用里**不装 jison、不跑 jison、不做 eval**：`ui/hint-nav.js` 只解释这份数据（`load`/`tokenize`/`drive`/`at`/`chars`），无 DOM、无 app 全局，`prefix` 必须从围栏体起算（`graph` 打开 `dir`、`--` 打开 `edgeText`，且 mermaid 的 `firstGraph()` 只认第一个 `graph`）。于是提示内容由**光标位置**决定，字母只改过滤词。重建：`npm i --prefix /tmp/hint-nav-tool jison@0.4.18 && NODE_PATH=/tmp/hint-nav-tool/node_modules node tools/gen-hint-nav.js`（装在仓外，避免 node_modules 弄脏工作树；`--check` 只比对不写；数据是单行紧凑 JSON，改一个字节就是一次可评审的 diff）。验收：`node tools/selftest-hint-nav.js`（45 条断言，零依赖，`A--` 字符类、`A-->` 期望、`A-->B` 收尾、词法错误不抛不转圈），Rust 侧 `src-tauri/tests/hint_nav.rs` 5 条（重算语法 sha256、表规模、运行时纯净、脚本层序、生成器与自检仍在）。移植时还与 jison 逐 token 对拍过 133 个输入（53 条语料 + 一张真实图的每个前缀），token 名与词法状态全等；已知上游死 token（`SEP`/`QUOTE`，语法里没有对应产生式）如实写进 `meta.deadTokens`，运行时按 jison 的"无 token"路径跳过。
  **尚未接线**：把 `HintNav.load(await (await fetch("hint-nav.json")).text())` 与 `at()` 接到 `hint-mermaid.js` 的 `offer`（"此处需要一个 Node"、`A--` 后的 `o/x/>` 候选）是下一步；今天入库的是数据、解释器、生成器与上面的自检，索引页按 L0 顺序加载 `hint-nav.js`。

真机验证（macOS 探针，非自动化测试，输入法切 ABC 后按键才不被候选栏截走）：围栏内接在 `sub` 后打 `b` 弹出唯一候选 `subgraph`，Enter 取用后落盘且列表关闭；一次 `keystroke` 连发 `su`（并批）同样弹出；空格落下、列表当场关闭（此时 Enter 才是换行）；Esc 关闭；粘贴 `xy`、在 `A[Open] --> B` 行中段打 ` e` 都**不**弹；坏图在阅读视图与 Live Preview 各显示 `line 2: A[Start] -->|open| (`；标题为 `[edt:ok]`、`[hintmode:auto]`。

ADR-8 图层的真机验证（同一套探针，2026-10-31，窗口摆回屏幕内、`ae=1` 后按行移动光标读标题）：` ```mermaid ` 行与围栏后的行都没有 `[hinthelp:]`；围栏体里当指令只打了 `fl` 时标题是 `[hinthelp:mermaid:-:-:26]`（26 种类型，截图确认 26 个芯片一次全可见、标题只出现一次）；`flowchart LR` 行是 `[hinthelp:mermaid:flowchart:Top-level_statement:11]`（顶层不含 `end`）；`subgraph S` 之下是 `[hinthelp:mermaid:flowchart:Inside_a_block:12]`（含 `end`）。走到围栏后面的行时 token 消失，列表（`[hint:]`）与图层同时存在的情形从未出现。

合并姿态：上游若自带补全，**取上游**的弹窗与词表——我们的引擎/提供者是平台无关的 L2 上，冲突面只有 `index.html` 的脚本顺序、`onUpdate/onKey` 的两个缝和 `main.js` 的宿主/呈现函数；`errText` 那行错误说明与 `.mmderr` 样式仍以小补丁加回。上游不做则整块原样保留（`hint_engine.rs` 的 10 条 + `mermaid_hints.rs` 的 10 条保证它不会被某次重构顺手删掉）。

## 许可

GPL-3.0-or-later，与上游相同（[LICENSE](LICENSE)）。再分发前请阅读 [THIRD-PARTY.md](THIRD-PARTY.md)。

---

本文件以简体中文书写，面向中文读者；英文的项目概览与 Linux 用法见上游 [README.md](README.md)。
