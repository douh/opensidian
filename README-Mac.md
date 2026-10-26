<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Opensidian · macOS fork 说明

`douh/opensidian` 是 [jpzk/opensidian](https://github.com/jpzk/opensidian) 的 macOS 取向 fork。

**为什么单独一个文件。** `README.md` 与上游**逐字一致**（任何时候 `git diff origin/main -- README.md` 都应为空），所以上游改 README 时不会产生合并冲突。fork 自己的说明——macOS 打包与签名、App Sandbox、界面语言、只读 MCP 服务器——全部写在这里。要加 fork 专属文字，请加在本文件，不要加回 `README.md`。

上游 README 里的 Linux 安装包、`SHA256SUMS` 与其 GPG 签名都来自上游，本 fork 不发布任何签名构建；macOS 请按下文从源码构建。

## 这个 fork 改了什么

| 方向 | 内容 |
|---|---|
| macOS 打包 | `packaging/macos/make-app.sh` 产出 `src-tauri/target/macos/Opensidian.app`（ad-hoc 签名、App Sandbox、原生标题栏与红绿灯按钮） |
| 界面语言 | 英文 / 简体中文，跟随系统；设置、命令面板、热键页、状态栏等界面文案已本地化 |
| MCP | `.app` 内含只读的 `opensidian-mcp`（stdio），供任意本地 MCP 客户端读取仓库 |
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

构建细节：`src-tauri/tauri.macos.conf.json` 打开 `decorations` 并用 `titleBarStyle: Overlay`，所以关闭/最小化/缩放是真实的红绿灯，页面内容延伸到标题栏下方（`ui/style.css` 在 `body.mac` 下隐藏 Linux 自绘的窗口条与缩放角）。插件看到的宿主也是真实的：`os.platform()` 与 `process.platform` 回答 `darwin`，架构为 `arm64`/`x64`，而不是硬编码的 `linux`。

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

实现方式是 gettext 风格的「英文即 key」：`ui/i18n.js` 的 `ZH` 字典 + `PATTERNS`（带数字的串，如 `Version 0.8.1`、`Conflicts 2`）。为避免翻译到用户内容，静态文本只翻译 `STATIC` 白名单（`title` / `aria-label` / `placeholder` / 文本），控件默认值只翻译 `VALUES` 白名单；文件名、笔记标题、仓库路径永远不会被翻译。命令面板与热键筛选会同时匹配英文与译文，文件快速切换只匹配文件名。

已覆盖：设置导航与各分区标题、设置行标签、命令面板与热键命令名、仓库选择器与四个对话框的静态文本、状态栏计数单位。尚未覆盖（仍为英文）：设置行的长描述、右键菜单、toast 通知、原生 macOS 菜单（`Settings…` 等在 Rust 侧硬编码），以及插件自带的文案；品牌名（`Bases`）与图形参数名刻意保留英文。

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

## 许可

GPL-3.0-or-later，与上游相同（[LICENSE](LICENSE)）。再分发前请阅读 [THIRD-PARTY.md](THIRD-PARTY.md)。

---

本文件以简体中文书写，面向中文读者；英文的项目概览与 Linux 用法见上游 [README.md](README.md)。
