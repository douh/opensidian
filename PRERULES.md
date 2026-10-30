<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# PRERULES.md — fork 前规则

**读的顺序：先本文件，再 `AGENTS.md`。**

`AGENTS.md` 与上游**逐字一致**（任何时候 `git diff origin/main -- AGENTS.md` 都应为空），
所以上游改规则时不会产生合并冲突——与 `README.md` 同一条策略（见 §1）。
fork 自己的规则——文档分层、想法阶段的治理、macOS 平台实现与进程边界——全部写在这里，
**不写回** `AGENTS.md`。

本文件是"前"规则，不是"超"规则：它决定**先想清楚该往哪儿写、现在处在哪个阶段**，
再交给 `AGENTS.md` 去管代码怎么改。

---

## 0. 定位：共生体，不是简单 fork

本项目与上游不是"分叉后各自演化"，而是**共生**：

| | 宿主（host） | 共生层（symbiont） |
|---|---|---|
| 是谁 | 上游 `jpzk/opensidian` | 本仓库的 macOS 实现与治理 |
| 提供什么 | Linux 优先的实现、文件格式、上游规则 | macOS 打包/沙盒/本地化、只读 MCP、文档与阶段治理 |
| 哪些文件 | `README.md`、`AGENTS.md` … | `README-Mac.md`、`PRERULES.md`、`packaging/macos/` |

三条共生契约（可检验，不是修辞）：

1. **基因不变**：上游文件逐字一致（`git diff origin/main -- README.md AGENTS.md` 为空）。
   共生层不靠改写宿主的基因来表达自己。
2. **外层自包含**：fork 层只依赖上游的**公开**接口——文件格式（`.md` / `.obsidian/`）、
   CLI、Tauri 命令、HTML 契约。上游删掉一个内部函数，最多让 fork 层局部失效，
   不能让 fork 整体崩塌。所以 fork 层的能力必须是在上游大幅变动后**能重建**的，
   而不是寄生在某个未公开的实现细节上。
3. **可回流**：fork 层里对上游也有价值的部分（macOS 平台实现、i18n、LP 的围栏与 Mermaid
   渲染）以 PR 形式回流。上游不接也照常自用，且**不因此**放松契约 1、2。

共生不对等，也不假装对等：上游没有义务接受回流，fork 也没有义务跟随每一次上游改动。
但有一条底线——**分家不致命**：把 `origin` 换掉、只留本仓库，仍能构建、能读库、
能跑 `cargo test --locked`。做不到，那就不是共生，是寄生。

---

## 0.1 优先级

| 问题 | 看哪份 |
|---|---|
| 能不能做、怎么提交、能否引入依赖、clean-room 与许可证边界 | `AGENTS.md`（上游） |
| 这段文字该放哪个文件、现在算想法还是架构、提案该不该出现 | 本文件 §1、§2 |
| 这个改动值不值得回流上游、会不会破坏"基因不变" | 本文件 §0 |
| macOS 上怎么实现、沙盒与签名、MCP 进程边界 | 本文件 §3 |

本文件**不覆盖**上游规则，只补上游不涉及的东西。两者都沾边时按上表分流；
分不流的，问一句，别猜（与上游 `AGENTS.md` 结尾同一原则）。

---

## 1. 文档分层

| 文件 | 承载什么 | 提交 | 与上游的关系 |
|---|---|---|---|
| `README.md` | 上游项目说明 | 是 | **逐字一致** |
| `README-Mac.md` | fork 说明（简体中文） | 是 | fork 专属 |
| `AGENTS.md` | 上游 agent 规则 | 是 | **逐字一致** |
| `PRERULES.md` | 本文件：fork 前规则 | 是 | fork 专属 |
| `IDEA-<topic>.md` | 想法稿 | **否** | 本地档案 |
| `PLAN-<topic>.md` | 架构（已冻结）或未开工计划 | **否** | 本地档案 |

`IDEA-*` 与 `PLAN-*` 用 `.git/info/exclude` 挡住：per-clone 的本地列表，
不写进 `.gitignore`，所以永远不会有 `PLAN` 字样出现在合并冲突里。
代价是**新 clone 要补一次**：

```sh
printf '/IDEA-*.md\n/PLAN-*.md\n' >> .git/info/exclude
```

这两类文件不提交，但**不隐身**：它们的存在、阶段、结论要能在对话或提交信息里被引用到
"哪个文件名 + 哪一节"，而不是"我记得讨论过"。

---

## 2. 三阶段：想法 → 架构 → 提案

| 阶段 | 落地文件 | 合格的判据 | 不合格的样子 |
|---|---|---|---|
| 想法 | `IDEA-<topic>.md` | 说得通，且说清**为什么** | 「提案积压退化成草稿」——谁触发？退化是移动还是标记？ |
| 架构 | `PLAN-<topic>.md` | 每条主张都有 ①数据形状 ②归属模块 ③不变量 ④验收测试 | 「加个后台任务自动清理」——没有所有者、没有恢复路径 |
| 提案 | `PLAN-<topic>.md` 的 `## 提案` | 成本 + 用户可见承诺 + 回滚方案 + 否决权归属 | 「默认开启」——没人知道关掉后数据会怎样 |

一个主题可以长期停在想法阶段，这是正常状态，不是欠债。**想法不因为没变成架构而失效。**

### 2.1 想法阶段（`IDEA-<topic>.md`）

**允许**：自相矛盾、半成品、只有问题没有答案、同一文件里既有结论也有反例。
**允许**：只写"为什么值得想"，完全不写"怎么做"。

**要求（只有三条）**：

1. 每条主张写明它**回答哪个问题**（否则以后没人知道它在解决什么）；
2. 写明它**服务谁**：人 / AI / 两者（人机共用是这套笔记的前提，不写就等于默认两者）；
3. 若触碰到三条公理——**A1 文本主权**（语义必须完整存在于纯文本）、
   **A2 可编辑性**（一行一语义、改动局部）、**A3 语义/样式分离**——注明是哪一条、为什么没违反。

**禁止**：

- 从 `IDEA-` 直接写代码（先冻结进 `PLAN-`，见 §2.2）；
- 把 `IDEA-` 的文字当契约引用（评审、提交信息里引它 = 引一份随时可改的草稿）；
- 把密钥、他人隐私、未公开数据写进 `IDEA-`（它不提交，但仍在磁盘上）。

**推翻的写法（否决也是资产）**：

```md
~~主张：提案积压 30 天后自动降级为草稿~~
→ 被推翻（2026-10-27）：降级是"值不值得占注意力"的判断，只能由人做；自动降级会
   制造虚假的优先级。保留为可手动触发的 demote。
```

直接删掉重写，等于让后来的人再踩一次同一个坑。宁可留一行"为什么不要它"。

### 2.2 冻结（想法 → 架构）

**一次只冻结一条主张**，冻结时必须补齐四件套：

1. **数据形状**：存什么、字段、版本号、未知字段怎么办；
2. **归属模块**：哪个文件/进程拥有它，谁不许碰；
3. **不变量**：什么永远不许发生（要能被测试断言）；
4. **验收测试**：先失败、后通过的那一条。

补不齐就**留在想法稿里**。宁可 `IDEA` 长，不要 `PLAN` 虚。
冻结后 `IDEA` 里那条加一行 `→ 已冻结至 PLAN-<topic>.md §x`，**不删原文**：
保留当时的措辞，才能在以后发现"冻结的那一刻其实理解错了"。

### 2.3 架构（`PLAN-<topic>.md`）

- 每条主张可测；写不出测试的段落不进架构；
- 允许留待定项（ADR），但每项必须有**默认值**、**备选**、**影响面**、**谁拍板**；
- 架构不承诺排期；排期属于提案；
- 架构要写"非目标"，否则默认值会被人当成缺陷。

### 2.4 提案

提案不是新文件：它是 `PLAN-<topic>.md` 里的一节 `## 提案`（或一次明确拍板的对话），
只在某条架构决策**需要人拍板**时出现。四样缺一，就还没到提案：

- **成本**（人日 / 新增依赖 / 测试面积）
- **用户可见承诺**（升级后看到什么变化）
- **回滚方案**（反悔怎么退，数据怎么救）
- **否决权归属**（谁说不做就不做）

---

## 3. 平台与进程边界

以下正文**逐字迁自**当时的 `AGENTS.md`（只调整了标题层级）。迁出的目的是让
`AGENTS.md` 回到上游原文，此后上游改规则不再产生冲突。内容未做任何改动。

### 3.1 定位

opensidian 是桌面 markdown 笔记应用，打开 Obsidian 风格的 vault（纯 `.md` 文件加
`.obsidian/` 配置目录）。Rust 后端 on Tauri v2，纯 JS 前端，Linux 优先
（AppImage、Flatpak、裸二进制），**macOS since 2026-10**
（`Opensidian.app`，`packaging/macos/make-app.sh`）。

### 3.2 两个目标，一棵树

三个部件是 Linux plumbing，在 macOS 上**打桩关掉**——不要模拟，也不要换新 crate：

- Landlock（`sandbox.rs`）：macOS 无对应物；`enforce()` 返回 `NotEnforced`，
  `landlock_enabled()` 为 false，启动行写
  `landlock: off (not available on this platform)`。
- libsoup HTTPS（Linux）vs `/usr/bin/curl`（macOS，`plugin_store.rs` 的 `http_get`）：
  同一 allowlist、每跳一次请求、同样的字节上限。macOS 的代理来自 `*_proxy` 环境变量，
  否则 `scutil --proxy`（Finder 启动不带环境）。拷进 vault 的插件处处都能加载。
- freedesktop Secret Service（`secrets.rs`）：每个操作都是 `unsupported:` 错误。
  macOS Keychain 尚未接上。

### 3.3 App Sandbox：路径不是权限

macOS 包运行在 **App Sandbox** 内（`packaging/macos/Opensidian.entitlements`，由
`make-app.sh` 施加）：

- `~/Library/Containers/dev.koto.opensidian` 之外的文件夹**只能**通过
  `src/sandbox_mac.rs` 触达：主线程上的 NSOpenPanel，授权以 app-scoped
  security-scoped bookmark 存进 `~/.opensidian.json` 的 `vault_bookmarks`
  （容器内的 home），跨启动保留。
- 绝不为了"让路径直接能用"而加 `absolute-path.read-write` 临时例外：那等于把整个
  文件系统交回来，本节的隔离就成了装饰。
- 启动闸门是 `main.rs` 的 `boot_sandbox_gate` + `boot_sandbox_panel`：bookmark 无法恢复的
  vault 会在窗口出现**之前**弹面板；Linux 与任何非沙盒运行（`cargo test`、裸二进制）
  走 `needs_panel(false, …)`，不受影响。
- `[sandbox]` 那几行启动日志（容器路径、内部可写、外部拒写）就是检查点；
  静默的 `ALLOWED` 意味着隔离已经破了。

### 3.4 两个 macOS-only 接线点

两者都挂在同一个事实上：

- `src-tauri/tauri.macos.conf.json`：`decorations: true` + `titleBarStyle: Overlay`，
  边框归系统（真红绿灯），页面在它下面跑。`ui/style.css` 的 `body.mac` 隐藏 Linux
  自绘的 `#wframe`、`#wrz` 并让出红绿灯那一角；标志来自下一条。
- `main.rs host_js()`：作为 initialization script 在任何页面脚本之前注入，
  `ui/plugins/node-desktop.js` 读它，使 `os.platform()` / `process.platform`
  回答 `darwin`（arch `arm64`）而不是硬编码的 `linux`。
  **不要再把宿主事实硬编码进 JS shim。**

### 3.5 其余系统调用：一一对应

凡是 Linux syscall 在 POSIX/macOS 有对应形式的地方，两边保持同步：
`/proc` 存活检测走 libproc（`spawn::alive`），`renameat2(RENAME_NOREPLACE)` 走
`renameatx_np(RENAME_EXCL)`，`O_PATH` 走 `O_SYMLINK` 加 `O_NONBLOCK`
（FIFO 上裸 `O_RDONLY` 会永久阻塞），`/proc/self/fd/N` 的 chmod 走真实 fd 上的 `fchmod`，
`pipe2` 走 `pipe` + `FD_CLOEXEC`，`prctl(PDEATHSIG)` 与 `close_range` 跳过，
`xdg-open` 走 `open`，umask 取 022 默认（macOS 不设置就读不到）。
需要第二个文件系统的测试在 macOS 上挂一个一次性 RAM disk，挂不上就**大声 SKIP**；
`flock(1)` 一处都不用——竞争测试自己 fork 并拿 `flock(2)`。

### 3.6 布局补充（上游 `AGENTS.md` 的 Layout 段没有的两项）

- `src/sandbox_mac.rs`（macOS-only）：App Sandbox 的文件夹面板与 bookmark。
- `src/bin/opensidian-mcp.rs`：本地 MCP 客户端以 stdio 启动的**只读** MCP 服务器。
  它**必须留在 App Sandbox 之外**——`make-app.sh` 在 app 之前、不带 entitlements 签它，
  否则读不到交给它的 vault。**不写入**：保持读者（list/read/search），
  永不成为第二个写者。

---

## 4. 自检（每次收工跑一遍）

```sh
git fetch origin --quiet                               # 先同步，否则下面两条会误报
git diff --stat origin/main -- README.md AGENTS.md     # 必须为空
git check-ignore -v IDEA-studio.md PLAN-foo.md         # 必须命中 .git/info/exclude
git status --short                                     # 不应出现 IDEA-/PLAN- 文件
```

第一条不是形式：上游发版时 `README.md`/`AGENTS.md` 一定动（如 v0.9.0 的安装链接），
此时"有差异"意味着**你还没合并上游**，而不是规则破了。合并后仍不为空，才是真的漏了 fork 文字。

合并完上游的改动后，再补一条**共生自检**（§3 引用的上游符号是否还活着，对应契约 2）：

```sh
for f in sandbox.rs sandbox_mac.rs plugin_store.rs spawn.rs secrets.rs; do
  test -f "src-tauri/src/$f" || echo "MISSING src-tauri/src/$f"
done
grep -q 'boot_sandbox_gate' src-tauri/src/main.rs || echo "MISSING boot_sandbox_gate"
grep -q 'host_js'           src-tauri/src/main.rs || echo "MISSING host_js"
grep -q 'fn serve('        src-tauri/src/bin/opensidian-mcp.rs || echo "MCP entry renamed?"
```

符号消失不是"上游的错"，是**本文件的债**：要么改引用，要么把相应能力搬进 fork 层自包含。

---

## 5. 分层契约（L1 / L2 / L3）

产品已经不止是笔记软件，而是人机协作平台。所以与上游的关系必须从**代码共生**降为
**契约共生**：平台跑在契约上，宿主随时可以换代。

### 5.1 三层与铁律

| 层 | 内容 | 谁拥有 | 变化速度 | 承诺 |
|---|---|---|---|---|
| **L1 格式** | vault、`.md`、`.obsidian/`、`.studio/` | 本仓库（应公开为规范） | 极慢，只增不改 | 任何工具可读写；不兼容必须升版本号 |
| **L2 宿主** | 上游代码：编辑器、渲染、索引、打包、Linux 规则 | 上游 | 快（`main.rs` 近半年 238 次提交） | 只经 §5.2 清单对外；文件不为 L3 而改 |
| **L3 共生层** | macOS 打包、Studio 三态、agent 协议、MCP、评审 UX | 本仓库 | 最快 | 只依赖 L1 + §5.2；可单独发布 |

**铁律：`L3 → L2` 只走 §5.2 清单。** `src/studio/` 里出现清单外的 `crate::…` 路径，即为违约
（§5.6 有测试）。

### 5.2 窄接口清单（v1）

命令（全部已在 `invoke_handler` 注册，共 12 个）：

| 接口 | L3 用途 |
|---|---|
| `vault_id` | 命名空间与审计归属 |
| `list_notes` | 提案列表、侧栏分组 |
| `read_note` | dry-run、锚重定位（读全文） |
| `write_note` | **accept 唯一落盘路径**（核心执行，L3 不自写 `.md`） |
| `rename_note` / `move_note` / `delete_note` | 锚批量重定位、`orphan` 判定 |
| `block_lines` | 行号 → 块范围（LP 旁批锚点） |
| `outline` | 按章节归组 |
| `search` | 上下文触发的候选召回（复活用） |
| `backlinks` | 复用判定（"被引用"这条硬证据） |
| `render_view` | 仅用于 diff 预览（可选，v2 才可依赖） |

事件：`vault-changed`（外部改动 → 锚重定位、`orphan` 判定）。

模块（**唯二**允许 import 的上游代码）：

| 模块 | 为什么必须复用它 |
|---|---|
| `opensidian_lib::vaultfs` | 写入安全靠 `openat` + `O_NOFOLLOW`；复制一份等于制造安全退化 |
| `opensidian_lib::index` 的 `link_parts` / `resolve`（纯函数） | 链接语义只该有一处实现，否则两套解析必然漂移 |

清单之外想用什么，**先改这份清单再写代码**。加清单需要说明：它是 L1/L2 契约的一部分吗？

### 5.3 能力协商与降级

L2 暴露 `core_caps()` → `{"api": 1, "commands": [...]}`。L3 启动时自检：

- 缺项 → 进入**只读模式**（能看提案、不能 accept），并在 UI 明说缺哪个能力；
- 版本不兼容 → 只读 + 提示升级，**绝不静默降级**。

这是"上游重构只让你局部失效"的落地机制：失效是可观测的，而不是运行时崩。

### 5.4 L2 允许的改动（适配器：加性、可回退）

| 改动 | 规模上限 | 说明 |
|---|---|---|
| 新增 `core_caps` | ~15 行 | 只读清单，无副作用 |
| `write_note` 增加可选 `provenance` 参数 | ~20 行 | 审计用；**不传时行为逐字节不变** |
| `studio_call` 网关 | ~40 行 | **P0 唯一**插入点；P1 独立进程后删除 |

超过这个规模的核心改动，先讨论——那通常意味着契约设计错了，而不是该去改宿主。

### 5.5 进程与构建形态

| 期 | 形态 | 判据 |
|---|---|---|
| **P0** | 与核心同进程；L3 模块只被 `studio::api` 门面引用，核心只开 `studio_call` 一个网关 | 核心文件改动 ≤ §5.4 |
| **P1** | 独立二进制 `opensidian-studio`（transport 见 ADR-9）；MCP 可挂在 L3 | L3 崩溃不影响读写笔记 |
| **P2** | L3 独立版本号与发布节奏；core 可单独发版 | 两者能各自回滚 |

形态变了，契约不变：L3 必须在上游重构后"能修"，而不是"必须跟着改"（§0 契约 2）。

### 5.6 契约测试（`src-tauri/tests/contract.rs`，P0 就要有）

1. §5.2 清单里每个命令都出现在 `invoke_handler`；
2. `core_caps()` 的 `api == 1`，且 `commands` ⊇ 清单；
3. 扫描 `src-tauri/src/studio/**`，出现清单外的 `crate::` 路径即失败；
4. `write_note` 不传 `provenance` 时，输出与基线逐字节一致（行为不变）。

四条都红了才算"契约破了"，而不是等一次上游 merge 才发现。

### 5.7 回流边界

- **L3 永不回流**：那是产品本身，不是技术债。
- **L2 的平台无关修复可以回流**（syscall 映射、`host_js`、i18n、LP 围栏/Mermaid）。
- **L1 规范公开**：`.studio/` 的事件日志 schema 一旦稳定就发布，别人能实现，我们是参考实现。
  平台真正的护城河是格式，不是代码。

---

## 6. 何时从双轨走向分家

现在（2026-10-27 实测）：**领先 24 个提交、落后 225 个**（上游同日发了 v0.9.0）。
上游极活跃但下游几乎无人实质开发（见下），所以这是升级契约的窗口，不是分家的窗口。

下游生态实测（同日的 25 个 fork，除我们外）：20 个零独立提交（最多落后 655 个），
Morglaf 的 `windows-experimental`（MSVC 移植，26 文件）、Orillian 的 `android` 尖刀（2 文件）、
IronJeff80 的每 6 小时 `gh repo sync` 工作流、jeongsk 的 `.codegraph/.gitignore` 是仅有的四处改动。

| 触发器 | 阈值 | 动作 |
|---|---|---|
| 合并冲突率 | 单次 merge 需人工解决 > 3 处，或 > 2 天 | 评估分家 |
| 内部重构打断我们 | 一个季度 ≥ 2 次 §4 自检报 MISSING | 把该能力搬进 L3 自包含 |
| 关键回流被拒 | 连续 2 个平台相关 PR 被拒，或 3 个月无回应 | 评估分家 |
| 上游自建 agent 层 | 出现与我们冲突的提案/评审机制 | **立即**评估分家 |
| 平台提交占比 | L3 改动 > 总提交 60%，且需要改渲染/IR | 执行分家 |

分家 = 只保留 L1 兼容（格式与规范），L2 自己维护。这是坡道的终点，不是惩罚。
