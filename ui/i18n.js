/*
  opensidian, a vault-compatible markdown notes app.
  Copyright (C) 2026 Jendrik Poloczek
  SPDX-License-Identifier: GPL-3.0-or-later
  This program comes with ABSOLUTELY NO WARRANTY. It is free software, and you
  are welcome to redistribute it under the terms of the GNU GPL version 3 or
  (at your option) any later version. See LICENSE, or <https://www.gnu.org/licenses/>.
*/
/* Interface language.

   The English sentence IS the key: t("Open settings") looks the string up and
   falls back to itself. That keeps every untranslated surface readable (never a
   key like "cmd.open_settings", never an empty box), lets a translation arrive
   one string at a time, and means the call sites stay honest — they still show
   what they show.

   Scope of this first slice: the static chrome, the command palette, the
   settings navigation and its row/section labels, and the hotkeys pane.
   Row descriptions, context menus and notices are still English until they are
   added here; nothing pretends otherwise. Only chrome goes through t(): user
   content (file names, note titles, folder names) never does, which is why the
   static ids below are an allow-list instead of a blanket DOM walk.

   The choice lives in localStorage (persisted by main.rs ls_get/ls_set), because
   it is a per-window preference, not vault state:
     os.locale = "zh-CN" | "en" | "" (empty/absent = follow the system). */
(function () {
  const ZH = {
    /* --- window + ribbon + sidebar chrome --- */
    "Minimise": "最小化",
    "Maximise / restore": "最大化 / 还原",
    "Close": "关闭",
    "Collapse sidebar": "收起侧边栏",
    "Expand sidebar": "展开侧边栏",
    "Open graph view": "打开关系图谱",
    "Open local graph": "打开局部关系图",
    "Settings": "设置",
    "Files": "文件",
    "Search": "搜索",
    "Bookmarks": "书签",
    "New note": "新建笔记",
    "New folder": "新建文件夹",
    "Collapse all": "全部折叠",
    "Expand all": "全部展开",
    "folder name": "文件夹名称",
    "Search...": "搜索…",
    "Clear search": "清除搜索",
    "Filter...": "筛选…",
    "Clear": "清除",
    "Open settings": "打开设置",
    "Reading view": "阅读视图",
    "Live preview": "实时预览",
    "Source mode": "源码模式",
    "Toggle Live Preview/Source mode": "切换实时预览 / 源码模式",
    "Check for updates": "检查更新",
    "Restore all": "全部还原",
    "Restore every hotkey to its default": "把所有热键恢复为默认",
    "Restore default": "恢复默认",
    "Customize this command": "为这条命令设置快捷键",
    "Press hotkey...": "按下快捷键…",
    "Blank": "未设置",
    "Remove": "移除",
    "All": "全部",
    "Assigned": "已设置",
    "Assigned by me": "我修改的",
    "Unassigned": "未设置",
    "Conflicts": "冲突",
    "Choose folder…": "选择文件夹…",
    "Choose another folder…": "换个文件夹…",
    "Reveal": "在 Finder 中显示",
    "Later": "稍后",
    "Download": "下载",
    "No matches": "没有匹配项",
    "install it?": "是否安装？",

    /* --- vault picker + dialogs (index.html static text) --- */
    "Minimise window": "最小化窗口",
    "Maximise or restore window": "最大化或还原窗口",
    "switch vault": "切换仓库",
    "Bookmark the active tab...": "收藏当前标签页…",
    "New group": "新建分组",
    "Show search filter": "显示搜索筛选",
    "Tags": "标签",
    "Expand right sidebar": "展开右侧边栏",
    "Create": "创建",
    "Create a new vault under a folder.": "在一个文件夹下新建仓库。",
    "Open folder as vault": "把文件夹作为仓库打开",
    "Choose an existing folder of Markdown files.": "选择已有的 Markdown 文件夹。",
    "Open": "打开",
    "Back": "返回",
    "Vault name": "仓库名称",
    "Create vault": "创建仓库",
    "Open this folder": "打开此文件夹",
    "Create in new window": "在新窗口中创建",
    "Open in new window": "在新窗口中打开",
    "location": "位置",
    "path to an image file": "图片文件路径",
    "new name": "新名称",
    "Update links": "更新链接",
    "Do you want to update internal links that link to this file?": "是否要更新指向此文件的内部链接？",
    "Always update": "总是更新",
    "Just once": "仅此一次",
    "Do not update": "不更新",
    "Delete file": "删除文件",
    "Cancel": "取消",
    "Delete": "删除",
    "Edit bookmark": "编辑书签",
    "Path": "路径",
    "Title": "标题",
    "Bookmark group": "书签分组",
    "Save": "保存",
    "Checking douh/opensidian and the local build folder…": "正在检查 douh/opensidian 与本地构建目录…",
    "Follow system": "跟随系统",
    "nothing to configure yet.": "暂无可配置项。",
    "Not implemented yet": "尚未实现",

    /* --- command palette + the hotkeys pane's command rows (ui/main.js CMDS) --- */
    "Add internal link": "添加内部链接",
    "Add tag": "添加标签",
    "Close window": "关闭窗口",
    "Create new canvas": "新建白板",
    "Create new folder": "新建文件夹",
    "Create note to the right": "在右侧新建笔记",
    "Delete paragraph": "删除段落",
    "Follow link under cursor": "跟随光标下的链接",
    "Go to last tab": "切换到上次使用的标签页",
    "Go to next tab": "切换到下一个标签页",
    "Go to previous tab": "切换到上一个标签页",
    "Insert attachment": "插入附件",
    "Insert Markdown link": "插入 Markdown 链接",
    "Navigate back": "后退",
    "Navigate forward": "前进",
    "Open command palette": "打开命令面板",
    "Open help": "打开帮助",
    "Open link under cursor in new tab": "在新标签页打开光标下的链接",
    "Open link under cursor to the right": "在右侧打开光标下的链接",
    "Open quick switcher": "打开快速切换",
    "Reset zoom": "重置缩放",
    "Save current file": "保存当前文件",
    "Search & replace current file": "在当前文件中查找并替换",
    "Search current file": "在当前文件中查找",
    "Switch vault": "切换仓库",
    "Templates: Insert current date": "模板：插入当前日期",
    "Templates: Insert current time": "模板：插入当前时间",
    "Toggle bold": "切换粗体",
    "Toggle bullet list": "切换无序列表",
    "Toggle checkbox status": "切换复选框状态",
    "Toggle comment": "切换注释",
    "Toggle italic": "切换斜体",
    "Toggle left sidebar": "切换左侧边栏",
    "Toggle light/dark mode": "切换浅色/深色模式",
    "Toggle numbered list": "切换有序列表",
    "Toggle right sidebar": "切换右侧边栏",
    "Undo close tab": "撤销关闭标签页",
    "Zoom in": "放大",
    "Zoom out": "缩小",
    "Open vault": "打开仓库",
    "Open another vault": "打开另一个仓库",
    "Create new vault": "新建仓库",
    "Open today's daily note": "打开今天的日记",
    "Create new note": "新建笔记",
    "Close current tab": "关闭当前标签页",
    "Close all tabs": "关闭全部标签页",
    "New tab": "新建标签页",
    "Next tab": "下一个标签页",
    "Previous tab": "上一个标签页",
    "Split right": "向右分屏",
    "Split down": "向下分屏",
    "Toggle sidebar": "切换侧边栏",
    "Toggle reading view": "切换阅读视图",
    "Toggle bookmarks": "切换书签面板",
    "Open graph": "打开图谱",
    "Open local graph view": "打开局部图谱",
    "Open file explorer": "打开文件列表",
    "Search in all files": "在全部文件中搜索",
    "Quick switcher": "快速切换",
    "Command palette": "命令面板",
    "Move file to trash": "把文件移到废纸篓",
    "Rename file": "重命名文件",
    "Export to PDF": "导出为 PDF",
    "Reload app": "重新加载应用",
    "Toggle developer tools": "切换开发者工具",
    "Switch interface language": "切换界面语言",

    /* --- settings navigation (groups + entries) --- */
    "Options": "选项",
    "Core plugins": "核心插件",
    "Community plugins": "第三方插件",
    "General": "通用",
    "Appearance": "外观",
    "Interface": "界面",
    "Editor": "编辑器",
    "Files and links": "文件与链接",
    "Hotkeys": "热键",
    "Keychain": "密钥",
    "About": "关于",
    "Canvas": "白板",
    "Backlinks": "反向链接",
    "Daily notes": "日记",
    "Graph view": "关系图谱",
    "Sync": "同步",

    /* --- settings section headings inside a pane --- */
    "Account": "账户",
    "Advanced": "高级",
    "Behavior": "行为",
    "Display": "显示",
    "Font": "字体",
    "Links": "链接",
    "Secrets": "密钥",
    "Trash": "废纸篓",

    /* --- settings rows: General --- */
    "Automatic updates": "自动更新",
    "Receive early access versions": "接收抢先体验版",
    "Language": "语言",
    "Help": "帮助",
    "Your account": "你的账户",
    "Commercial license": "商业授权",
    "Notify if startup takes longer than expected": "启动过久时提醒",
    "Command line interface": "命令行接口",
    "Hardware acceleration": "硬件加速",

    /* --- settings rows: Appearance --- */
    "Base color scheme": "基础配色",
    "Accent color": "强调色",
    "Themes": "主题",
    "Current community themes": "当前第三方主题",
    "CSS snippets": "CSS 片段",
    "Interface font": "界面字体",
    "Text font": "文本字体",
    "Monospace font": "等宽字体",
    "Font size": "字体大小",
    "Quick font size adjustment": "快速调整字体大小",
    "Custom app icon": "自定义应用图标",

    /* --- settings rows: Interface --- */
    "Show tab title bar": "显示标签页标题栏",
    "Ribbon menu configuration": "侧边栏菜单配置",
    "Show ribbon": "显示侧边栏",
    "Window frame style": "窗口边框样式",

    /* --- settings rows: Editor --- */
    "Default editing mode": "默认编辑模式",
    "Show editing mode in status bar": "在状态栏显示编辑模式",
    "Always focus new tabs": "新标签页始终获得焦点",
    "Vim key bindings": "Vim 键位",
    "Default view for new tabs": "新标签页默认视图",
    "Fold heading": "折叠标题",
    "Fold indent": "折叠缩进",
    "Indent using tabs": "用制表符缩进",
    "Indent visual width": "缩进视觉宽度",
    "Line numbers": "行号",
    "Indentation guides": "缩进辅助线",
    "Properties in document": "文档中的属性",
    "Show Mermaid diagrams in notes": "在笔记中显示 Mermaid 图表",
    "Smart lists": "智能列表",
    "Auto-pair brackets": "自动配对括号",
    "Auto-pair Markdown syntax": "自动配对 Markdown 语法",
    "Spellcheck": "拼写检查",
    "Spellcheck languages": "拼写检查语言",
    "Readable line length": "可读行宽",
    "Strict line breaks": "严格换行",
    "Inline title": "内联标题",
    "Convert pasted HTML to Markdown": "将粘贴的 HTML 转换为 Markdown",

    /* --- settings rows: Files and links --- */
    "Confirm before deleting files": "删除文件前确认",
    "Deleted files": "已删除文件",
    "Delete attachments when deleting files": "删除文件时同时删除附件",
    "Default location for new notes": "新笔记默认位置",
    "Default file to open": "默认打开的文件",
    "New link format": "新链接格式",
    "Use [[Wikilinks]]": "使用 [[Wikilinks]]",
    "Automatically update internal links": "自动更新内部链接",
    "Default location for new attachments": "新附件默认位置",
    "Excluded files": "排除的文件",
    "Override config folder": "覆盖配置文件夹",
    "Show all file types": "显示所有文件类型",

    /* --- settings rows: core plugin list + misc rows --- */
    "Audio recorder": "录音机",
    // "Bases" stays as it is: it is the feature's own name, the way "Mermaid"
    // and "CSS" are, so translating it would rename the thing instead of the UI.
    "Bases": "Bases",
    "File recovery": "文件恢复",
    "Format converter": "格式转换",
    "Footnotes view": "脚注视图",
    "Note composer": "笔记组合器",
    "Outgoing links": "出链",
    "Outline": "大纲",
    "Page preview": "页面预览",
    "Properties view": "属性视图",
    "Publish": "发布",
    "Random note": "随机笔记",
    "Slash commands": "斜杠命令",
    "Slides": "幻灯片",
    "Tags view": "标签视图",
    "Templates": "模板",
    "Unique note creator": "唯一笔记创建器",
    "Word count": "字数统计",
    "Workspaces": "工作区",
    "Web viewer": "网页视图",
    "Allow community plugins": "允许第三方插件",
    "Allow URI callbacks": "允许 URI 回调",
    "Learn more about plugin security": "了解插件安全",
    "Encryption not available": "加密不可用",
    "Rebuild vault cache": "重建仓库缓存",
    "Open settings in new window": "在新窗口中打开设置",
    "Native menus": "原生菜单",
    "Right-to-left (RTL)": "从右到左（RTL）",
    "Zoom level": "缩放级别",
    /* --- canvas chrome: tooltips + help panel (strings live in canvas-nav.js) --- */
    "Canvas help": "画布帮助",
    "Canvas settings": "画布设置",
    "More canvas settings": "更多画布设置",
    "Zoom to fit (Shift + 1)": "适应画布（Shift + 1）",
    "Zoom to fit": "适应画布",
    "Zoom to selection": "缩放到选区",
    "Undo": "撤销",
    "Redo": "重做",
    "Add text node": "添加文本卡片",
    "Jump to group…": "跳转到分组…",
    "No groups on this canvas.": "此画布上没有分组。",
    "Pan the board": "平移画布",
    "Pan sideways": "横向平移",
    "Zoom": "缩放",
    "Select all": "全选",
    "Add to the selection": "加入选区",
    "Create a card with specific size": "创建指定尺寸的卡片",
    "Clone card": "克隆卡片",
    "Constrain movement to axis": "限制为轴向移动",
    "Disable snapping": "禁用吸附",
    "Edit a card": "编辑卡片",
    "Remove card": "删除卡片",

    /* --- default control values (see VALUES below) --- */
    "Vault folder": "仓库文件夹",
    "Visible": "可见",
    "Hidden (default)": "隐藏（默认）",
    "Last opened": "上次打开",
    "Live Preview": "实时预览",
    "Editing view": "编辑视图",
    "Shortest path when possible": "尽可能使用最短路径",
    "Move to system trash": "移到系统废纸篓",
    "Choose": "选择",
    "Log in": "登录",
    "Sign up": "注册",
    "Activate": "激活",
    "Purchase": "购买",
    "Rebuild": "重建",
    "Adapt to system": "跟随系统",
    "(purple)": "（紫色）",
    "Default": "默认",
    "Manage button": "管理",
    "Ask each time": "每次询问",
    "All selected": "全选",
    "Exit Restricted mode": "退出受限模式",
    /* ADR-8: the labels the mermaid context layer builds at runtime. The words
       themselves (subgraph, participant, ...) are syntax and never translated. */
    "Choose a diagram type": "选择图表类型",
    "Top-level statement": "顶层语句",
    "Inside a block": "块内（用 end 收尾）",
    /* ADR-9: the tree's section headings (the words under them are syntax). */
    "Statements": "语句",
    "Blocks": "块",
    "Directives": "指令",
    "Arrow style": "连线箭头",
    "Nodes": "节点",
    "Shapes": "形状",
    "Links": "连线",
    "Edge labels": "连线文字",
    /* ADR-9's value level: gantt's dateFormat/axisFormat take free text, so the
       layer shows the tokens their own formatter understands. */
    "Date format": "日期格式",
    "Axis format": "坐标轴格式",
    "Excluded days": "排除的日子",
    "Included days": "纳入的日子",
    "dayjs tokens, spaced as you like; default YYYY-MM-DD": "dayjs 记号，可按需加分隔符；默认 YYYY-MM-DD",
    "d3 time-format tokens; default %Y-%m-%d": "d3 时间格式记号；默认 %Y-%m-%d",
    "comma-separated days left out of the calendar": "逗号分隔，排期时跳过的日子",
    "comma-separated days added to the calendar": "逗号分隔，排期时额外计入的日子",
    "the default layout, e.g. 2014-08-01": "默认写法，例如 2014-08-01",
    "four-digit year": "四位数年份",
    "two-digit year": "两位数年份",
    "quarter (sets the month to the quarter's first month)": "季度（并把月份设为该季度的第一个月）",
    "month 1–12": "月份 1–12",
    "month name in dayjs.locale()": "月名（随 dayjs.locale()）",
    "day of month 1–31": "当月第几天 1–31",
    "day of month with an ordinal": "当月第几天（带序数词）",
    "day of year 1–365": "当年第几天 1–365",
    "unix timestamp in seconds": "Unix 时间戳（秒）",
    "unix timestamp in milliseconds": "Unix 时间戳（毫秒）",
    "hour 0–23": "小时 0–23（24 小时制）",
    "hour 1–12": "小时 1–12（12 小时制）",
    "am or pm": "上午/下午",
    "minute 0–59": "分钟 0–59",
    "second 0–59": "秒 0–59",
    "tenths of a second": "十分之一秒",
    "hundredths of a second": "百分之一秒",
    "milliseconds": "毫秒",
    "UTC offset ±HH:mm": "UTC 偏移 ±HH:mm",
    "UTC offset ±HHmm": "UTC 偏移 ±HHmm",
    "abbreviated weekday name": "星期名缩写",
    "full weekday name": "完整星期名",
    "abbreviated month name": "月份名缩写",
    "full month name": "完整月份名",
    "date and time": "日期与时间",
    "day of month, zero-padded [01,31]": "当月日期，补零 [01,31]",
    "day of month [ 1,31]": "当月日期 [ 1,31]",
    "hour, 24-hour [00,23]": "小时（24 小时制）[00,23]",
    "hour, 12-hour [01,12]": "小时（12 小时制）[01,12]",
    "day of year [001,366]": "当年第几天 [001,366]",
    "month [01,12]": "月份 [01,12]",
    "minute [00,59]": "分钟 [00,59]",
    "milliseconds [000,999]": "毫秒 [000,999]",
    "second [00,61]": "秒 [00,61]",
    "week of year, Sunday first [00,53]": "当年周数（周日为一周第一天）[00,53]",
    "weekday [0 = Sunday, 6]": "星期几 [0=周日, 6]",
    "week of year, Monday first [00,53]": "当年周数（周一为一周第一天）[00,53]",
    "date as %m/%d/%Y": "日期，即 %m/%d/%Y",
    "time as %H:%M:%S": "时间，即 %H:%M:%S",
    "year without century [00,99]": "年份（不含世纪）[00,99]",
    "year with century": "年份（含世纪）",
    "timezone offset, e.g. -0700": "时区偏移，例如 -0700",
    "a literal %": "一个字面意义上的 %",
  };

  /* Strings the app builds at runtime carry a number: "Version 0.9.0",
     "Plugin API version 1.13.7", "Conflicts 3". A regex keeps one entry per
     sentence instead of a key for every possible version. */
  const PATTERNS = [
    [/^Version (.+)$/, m => "版本 " + m[1]],
    [/^Plugin API version (.+)$/, m => "插件 API 版本 " + m[1]],
    [/^Conflicts (\d+)$/, m => "冲突 " + m[1]],
  ];

  const saved = (function () {
    try { return localStorage.getItem("os.locale") || ""; } catch (_) { return ""; }
  })();
  /* OPENSIDIAN_LOCALE reaches the page before any IPC (host_js), so a launch can
     pin the language without touching the per-window preference. */
  const hostLocale = (globalThis.__opensidianHost && globalThis.__opensidianHost.locale) || "";

  function pick(savedLocale) {
    if (savedLocale) return savedLocale;
    const sys = String((navigator && (navigator.language || navigator.languages && navigator.languages[0])) || "");
    return /^zh\b|^zh-/i.test(sys) ? "zh-CN" : "en";
  }

  const locale = pick(saved || hostLocale);
  const zh = /^zh/i.test(locale);
  document.documentElement.lang = locale;

  /** Translate an English label. Unknown strings come back unchanged. */
  function t(s) {
    if (!zh || s == null) return s;
    const hit = ZH[s];
    if (hit != null) return hit;
    for (const [re, fmt] of PATTERNS) {
      const m = re.exec(s);
      if (m) return fmt(m);
    }
    return s;
  }

  /* The language's own name, in the language — a picker never translates the
     choice into the language you are trying to leave. */
  function langName(l) { return /^zh/i.test(l) ? "简体中文" : "English"; }

  /* A count with its unit: English inflects the unit ("1 word" / "2 words"),
     Chinese does not ("2 词"). Used by the status bar, where the number and the
     noun are built in one string and cannot be split into a dictionary lookup. */
  function count(n, one, many, zhUnit) {
    return zh ? n + " " + zhUnit : n + (n === 1 ? one : many);
  }

  /* Control values the settings rows show by default (structure.tsv column 6).
     They are transcribed constants, but a value slot can also hold USER data — a
     folder name, a path, a font — so they go through this allow-list instead of
     t(): a user's folder called "Open" must not become "打开". */
  const VALUES = new Set([
    "Vault folder", "Visible", "Hidden (default)", "Last opened", "Live Preview",
    "Editing view", "Shortest path when possible", "Move to system trash", "Open",
    "Choose", "Log in", "Sign up", "Activate", "Purchase", "Rebuild",
    "Adapt to system", "(purple)", "Default", "Manage button", "Ask each time", "All selected",
    "Exit Restricted mode",
  ]);

  function tValue(v) {
    if (!zh || v == null) return v;
    return VALUES.has(v) ? t(v) : v;
  }

  /* Static chrome: only the attributes and text nodes named here are touched, so
     a file or folder called "Settings" is never renamed by the translator. An
     entry may carry `text` (the element's own label) and/or attributes. */
  const STATIC = {
    "wf-min": { title: "Minimise", "aria-label": "Minimise window" },
    "wf-max": { title: "Maximise / restore", "aria-label": "Maximise or restore window" },
    "wf-close": { title: "Close", "aria-label": "Close window" },
    "collapsebtn": { title: "Collapse sidebar" },
    "graphbtn": { title: "Open graph view" },
    "lgbtn": { title: "Open local graph" },
    "setbtn": { title: "Settings" },
    "stab-files": { title: "Files" },
    "stab-search": { title: "Search" },
    "stab-bm": { title: "Bookmarks" },
    "newbtn": { title: "New note" },
    "newfolderbtn": { title: "New folder" },
    "fecabtn": { title: "Collapse all" },
    "fname": { placeholder: "folder name" },
    "sinput": { placeholder: "Search..." },
    "sclear": { title: "Clear search" },
    "vswitch": { title: "switch vault" },
    "bmaddbtn": { title: "Bookmark the active tab..." },
    "bmgrpbtn": { title: "New group" },
    "bmcabtn": { title: "Collapse all" },
    "bmfltbtn": { title: "Show search filter" },
    "rtab-bl": { title: "Backlinks" },
    "rtab-out": { title: "Outgoing links" },
    "rtab-tags": { title: "Tags" },
    "rtab-toc": { title: "Outline" },
    "rtoggle": { title: "Expand right sidebar" },
    "p-close": { title: "Close" },
    "ptname": { text: "Opensidian" },
    "p-create-b": { text: "Create new vault" },
    "p-create-s": { text: "Create a new vault under a folder." },
    "p-create": { text: "Create" },
    "p-open-b": { text: "Open folder as vault" },
    "p-open-s": { text: "Choose an existing folder of Markdown files." },
    "p-open": { text: "Open" },
    "p-back": { text: "Back" },
    "p-name": { placeholder: "Vault name" },
    "p-path": { title: "location" },
    "shead-t": { text: "Settings" },
    "sclose": { title: "Close" },
    "anew": { placeholder: "path to an image file" },
    "rnbox": { placeholder: "new name" },
    "rninput": { placeholder: "new name" },
    "ultitle": { text: "Update links" },
    "ulq": { text: "Do you want to update internal links that link to this file?" },
    "ul-always": { text: "Always update" },
    "ul-once": { text: "Just once" },
    "ul-no": { text: "Do not update" },
    "deltitle": { text: "Delete file" },
    "del-no": { text: "Cancel" },
    "del-yes": { text: "Delete" },
    "bmetitle": { text: "Edit bookmark" },
    "bme-lpath": { text: "Path" },
    "bme-ltitle": { text: "Title" },
    "bme-lgrp": { text: "Bookmark group" },
    "bme-no": { text: "Cancel" },
    "bme-yes": { text: "Save" },
  };

  function applyStatic(doc) {
    if (!zh) return;
    for (const [id, spec] of Object.entries(STATIC)) {
      const el = (doc || document).getElementById(id);
      if (!el) continue;
      for (const [attr, key] of Object.entries(spec)) {
        if (attr === "text") el.textContent = t(key);
        else el.setAttribute(attr, t(key));
      }
    }
  }

  globalThis.i18n = { t, tValue, applyStatic, locale, zh, saved, langName, count };
  globalThis.t = t;
})();
