// SPDX-License-Identifier: GPL-3.0-or-later
//! Markdown syntax hints — ADR-10: the guide for the note ITSELF.
//!
//! The point of this layer is not a copy of Obsidian's manual: it is that a
//! person can write a knowledge base by hand in THIS app. So the guide may only
//! name a form the app really draws. These assertions do three things, and each
//! of them can rot independently:
//!
//!   1. the DATA (ui/markdown-syntax.js, between its GUIDE markers) has one row
//!      per meaning, prints an example and a sentence on every row, and every
//!      sentence exists in ui/i18n.js as Chinese;
//!   2. every documented form is PAIRED with the renderer that draws it —
//!      ui/editor.js for live preview, src-tauri/src/main.rs (or index.rs) for
//!      the reading view — and a form the reading view does not draw says so;
//!   3. the guide owns no list and no key: it is a place, not a popup that
//!      opens on typing, and the engine's register/owner accept a provider with
//!      only `panel`/`panelCommit`.
//!
//! (The interactive half — chips land in the model, the card follows the caret,
//! prose and a fence body stay quiet — runs in Ed.selfTest on every launch as
//! [edt:md:...], and by the macOS probe for pixels.)

use std::fs;
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..") }

fn read(rel: &str) -> String {
    let p = root().join(rel);
    fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {}", p.display(), e))
}

fn assert_has(file: &str, needles: &[&str]) {
    let src = read(file);
    for n in needles {
        assert!(src.contains(n), "{file} no longer contains {n:?} — the Markdown guide was rearranged; see README-Mac.md (ADR-10)");
    }
}

fn assert_lacks(file: &str, needles: &[&str]) {
    let src = read(file);
        for n in needles {
        assert!(!src.contains(n), "{file} must not contain {n:?} — the guide would teach a form the app does not draw; see README-Mac.md (ADR-10)");
    }
}

/// The GUIDE block of ui/markdown-syntax.js: data only, one row per meaning.
fn guide_block() -> String {
    let src = read("ui/markdown-syntax.js");
    let a = src.find("GUIDE-BEGIN").expect("GUIDE-BEGIN marker");
    let b = src.find("GUIDE-END").expect("GUIDE-END marker");
    assert!(b > a, "GUIDE-END must follow GUIDE-BEGIN");
    src[a..b].to_string()
}

/// Every `field: "..."` value in the guide block. Rows are written one value
/// per line and no value contains a quote, so a quote scan is enough — the
/// crude-but-honest read the mermaid test uses for its vocabulary too.
fn values(field: &str) -> Vec<String> {
    let block = guide_block();
    let needle = format!("{field}: \"");
    let mut out = Vec::new();
    let mut from = 0usize;
    while let Some(at) = block[from..].find(&needle) {
        let start = from + at + needle.len();
        let end = start + block[start..].find('"').expect("an unterminated string in the guide");
        out.push(block[start..end].to_string());
        from = end + 1;
    }
    out
}

/// The `ins: [ ... ]` arrays of the guide, one per row. A `]` inside a quoted
/// value (`[[note]]`, `- [ ] `) must not close the array, so quotes are
/// tracked: the arrays are the chips a row offers, nothing else.
fn arrays(field: &str) -> Vec<Vec<String>> {
    let block = guide_block();
    let needle = format!("{field}: [");
    let mut out = Vec::new();
    let mut from = 0usize;
    while let Some(at) = block[from..].find(&needle) {
        let start = from + at + needle.len();
        let mut in_q = false;
        let mut end = None;
        for (i, c) in block[start..].char_indices() {
            match c {
                '"' => in_q = !in_q,
                ']' if !in_q => { end = Some(start + i); break; }
                _ => {}
            }
        }
        let end = end.expect("an unterminated ins array in the guide");
        let body = &block[start..end];
        let mut v = Vec::new();
        for part in body.split('"').enumerate() {
            if part.0 % 2 == 1 { v.push(part.1.to_string()); }
        }
        out.push(v);
        from = end;
    }
    out
}

/// The Chinese value under `"key":` in ui/i18n.js, if any.
fn translated(key: &str) -> Option<String> {
    let src = read("ui/i18n.js");
    let needle = format!("\"{key}\":");
    let at = src.find(&needle)?;
    let rest = src[at + needle.len()..].trim_start().strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

#[test]
fn one_row_is_one_meaning_and_every_sentence_is_chinese() {
    // 7 block forms, 6 inline forms, 11 link/embed/tag/id forms: the renderer's
    // whole subset, nothing twice. A row whose meaning went missing would print
    // a chip with an empty right column — the table is the point.
    assert_has("ui/markdown-syntax.js", &[
        "const BLOCKROWS = [",
        "const INLINEROWS = [",
        "const LINKROWS = [",
        "const SECTION = { block: \"Line begins with\", inline: \"Inside a line\", link: \"Links & embeds\" };",
        "function rowItems(rows) {",
        "first: i === 0 ? 1 : 0",
        "function section(name, rows) { return { name, items: rowItems(rows) }; }",
        "window.MdHints = { BLOCKROWS, INLINEROWS, LINKROWS, SECTION, helpOf };",
    ]);
    let hints = values("hint");
    let exs = values("ex");
    assert_eq!(hints.len(), 24, "the guide lost a row's meaning: {hints:?}");
    assert_eq!(exs.len(), 24, "the guide lost a row's example: {exs:?}");
    for h in &hints {
        assert!(!h.trim().is_empty(), "an empty meaning in the guide");
        let zh = translated(h).unwrap_or_else(|| panic!("ui/i18n.js has no sentence for {h:?}"));
        assert!(zh.chars().any(|c| c as u32 >= 0x2E80),
            "{h:?} is not translated — the card would print English in a Chinese UI: {zh:?}");
    }
    for ex in &exs {
        assert!(!ex.trim().is_empty(), "an empty example in the guide");
    }
    // the tree's own headings and places are i18n keys too
    for k in ["Markdown", "Blank line", "Line start", "Line begins with", "Inside a line",
              "Links & embeds"] {
        assert!(translated(k).is_some(), "ui/i18n.js lost the heading/place {k:?}");
    }
}

#[test]
fn the_ground_is_a_line_that_may_begin() {
    // The card speaks where a line may BEGIN: a blank line (the whole cheat
    // sheet) or the start of a line with no block marker yet (only what may be
    // that line). Mid-line prose, a fence body and a line that already IS a
    // block stay quiet — the discipline mermaid uses inside a fence.
    assert_has("ui/markdown-syntax.js", &[
        "if (fence) return null;",
        "if (!/^[ \\t]*$/.test(p)) return null;",
        "if (MARKER.test(a)) return null;",
        "const blank = !a.trim();",
        "? [section(SECTION.block, BLOCKROWS), section(SECTION.inline, INLINEROWS), section(SECTION.link, LINKROWS)]",
        ": [section(SECTION.block, BLOCKROWS)];",
        "return { type: \"Markdown\", place: blank ? \"Blank line\" : \"Line start\", sections, items };",
        "[-*+] |\\d+\\. )",
    ]);
    assert_eq!(arrays("ins").len(), 24, "one ins array per row");
    let chips: Vec<String> = arrays("ins").into_iter().flatten().collect();
    assert_eq!(chips.len(), 35, "the whole sheet is 35 chips: {chips:?}");
    assert_eq!(chips.iter().filter(|c| c.is_empty()).count(), 1,
        "only the block id is passive; every other chip lands text: {chips:?}");
    // heading chips show the #s WITHOUT the space they insert
    assert!(guide_block().contains("labels: [\"#\", \"##\", \"###\", \"####\", \"#####\", \"######\"]"),
        "heading chips must show what a heading looks like, not the trailing space they insert");
    // no chip lands twice
    let mut seen = Vec::new();
    for c in chips.iter().filter(|c| !c.is_empty()) {
        assert!(!seen.contains(c), "the chip {c:?} appears twice in the guide");
        seen.push(c.clone());
    }
    // the block id belongs at the END of a block: shown as an example, never a
    // tap (a tap at a line start could only put the id before the text it labels)
    assert!(guide_block().contains("{ ins: [\"\"], labels: [\"^id\"], ex: \"text ^id\","),
        "the block-id row must be a passive example (empty ins)");
    assert!(guide_block().contains("// a block id belongs at the END of a block"),
        "the passive row needs its reason beside it, or the next edit 'fixes' it");
}

/// One documented form and the code that draws it in each view. A `live` or
/// `read` needle may be empty: that is a form the view deliberately leaves
/// alone, and the guide must say so in words.
struct Pair {
    form: &'static str,     // the chip as the guide prints it (asserted below)
    live: &'static str,     // ui/editor.js: the live-preview rule
    read: &'static str,     // src-tauri/src/main.rs (or index.rs): the reading-view rule
    read_file: &'static str,
}

#[test]
fn every_documented_form_has_a_renderer() {
    let pairs = [
        Pair { form: "# ", live: "const h = /^(#{1,6}) /.exec(t);", read: "<h1", read_file: "src-tauri/src/main.rs" },
        Pair { form: "- ", live: "const lm = /^([-*+]|\\d+\\.) /.exec(t);", read: "<ul>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "1. ", live: "const lm = /^([-*+]|\\d+\\.) /.exec(t);", read: "<ul>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "- [ ] ", live: "const task = /^\\[([ xX])\\] /.exec(rest);", read: "Event::TaskListMarker(checked) if reading", read_file: "src-tauri/src/main.rs" },
        Pair { form: "- [x] ", live: "const task = /^\\[([ xX])\\] /.exec(rest);", read: "Event::TaskListMarker(checked) if reading", read_file: "src-tauri/src/main.rs" },
        Pair { form: "> ", live: "if (t.startsWith(\">\")) {", read: "<blockquote>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "```", live: "if (/^(```|~~~)/.test(t)) {", read: "<pre>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "~~~", live: "if (/^(```|~~~)/.test(t)) {", read: "<pre>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "| ", live: "if (t.startsWith(\"|\")) {", read: "<table>", read_file: "src-tauri/src/main.rs" },
        Pair { form: "---", live: "if (tt.length >= 3 && /^(-+|\\*+|_+)$/.test(tt)) {", read: "Event::Rule", read_file: "src-tauri/src/main.rs" },
        // emphasis, inline code and the tags themselves are pulldown's own
        // emitter: this app customises events, then hands them to push_html
        Pair { form: "**bold**", live: "[\"**\", \"b\", \"strong\"]", read: "html::push_html(&mut out, evs.into_iter());", read_file: "src-tauri/src/main.rs" },
        Pair { form: "*italic*", live: "[\"*\", \"i\", \"em\"]", read: "html::push_html(&mut out, evs.into_iter());", read_file: "src-tauri/src/main.rs" },
        Pair { form: "***bold italic***", live: "[\"***\", \"bi\", \"strong\"]", read: "html::push_html(&mut out, evs.into_iter());", read_file: "src-tauri/src/main.rs" },
        Pair { form: "~~struck~~", live: "[\"~~\", \"s\", \"span\"]", read: "html::push_html(&mut out, evs.into_iter());", read_file: "src-tauri/src/main.rs" },
        // live preview only: the reading view keeps the == as text (asserted below)
        Pair { form: "==marked==", live: "[\"==\", \"hl\", \"mark\"]", read: "", read_file: "src-tauri/src/main.rs" },
        Pair { form: "`code`", live: "if (rest[0] === \"`\") {", read: "html::push_html(&mut out, evs.into_iter());", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[[note]]", live: "const wl = /^(!?)\\[\\[([^\\]]*)\\]\\]/.exec(rest);", read: "data-note=", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[[note|alias]]", live: "const label = bar >= 0 ? raw.slice(bar + 1) : raw;", read: "data-note=", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[[note#heading]]", live: "const hash = target.indexOf(\"#\");", read: "data-anchor=", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[[note#^id]]", live: "if (hash >= 0) a.dataset.anchor = target.slice(hash + 1);", read: "data-anchor=", read_file: "src-tauri/src/main.rs" },
        Pair { form: "![[image.png]]", live: "if (wl[1] === \"!\" && hash < 0 && Ed.isImg(target)) {", read: "is_img_target(note)", read_file: "src-tauri/src/main.rs" },
        Pair { form: "![[doc.pdf#page=3]]", live: "if (wl[1] === \"!\" && Ed.isPdf(hash >= 0 ? target.slice(0, hash) : target)) {", read: "fn is_pdf_target", read_file: "src-tauri/src/main.rs" },
        Pair { form: "![alt](image.png)", live: "const im = Ed.linkAt(rest.slice(1));", read: "Event::Start(Tag::Image { ref dest_url, .. })", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[text](Note.md)", live: "const lt = Ed.linkAt(rest);", read: "fn md_link_internal_ok", read_file: "src-tauri/src/main.rs" },
        Pair { form: "[text](https://example.com)", live: "const url = Ed.urlAt(rest);", read: r#"class=\"ext\" rel=\"noopener\""#, read_file: "src-tauri/src/main.rs" },
        Pair { form: "#tag", live: "tagSpans(s) {", read: "fn clean_tag", read_file: "src-tauri/src/index.rs" },
        // the block id is recognised by BOTH views, but live preview leaves it
        // as text: only the reading view wraps it, and its CSS then hides it
        Pair { form: "^id", live: "", read: "fn split_block_id", read_file: "src-tauri/src/main.rs" },
    ];
    let block = guide_block();
    for p in &pairs {
        assert!(block.contains(&format!("\"{}\"", p.form)),
            "the pairing table names {:?}, which the guide no longer prints", p.form);
        if !p.live.is_empty() {
            assert!(read("ui/editor.js").contains(p.live),
                "the guide teaches {:?} but live preview no longer draws it ({:?})", p.form, p.live);
        }
        if !p.read.is_empty() {
            assert!(read(p.read_file).contains(p.read),
                "the guide teaches {:?} but the reading view no longer draws it ({:?} in {})",
                p.form, p.read, p.read_file);
        }
    }
    assert_eq!(pairs.len(), 27, "every guide chip has a pair");
    // exactly one chip has no live-preview renderer: the passive block id
    let live_only: Vec<&str> = pairs.iter().filter(|p| p.live.is_empty()).map(|p| p.form).collect();
    assert_eq!(live_only, vec!["^id"], "only the block id is unrendered while editing: {live_only:?}");
    assert!(!read("ui/editor.js").contains("blockid"),
        "no code emits .blockid, so live preview shows the id as text; the guide must not claim otherwise");
    assert!(read("ui/style.css").contains(".preview .blockid { display: none }"),
        "the reading view hides the block id by CSS — the guide's sentence depends on it");
    // the options set is what makes the reading view's promise: a blanket
    // Options::all() minus the two the app does itself. A pulldown bump must
    // revisit the guide (it could start drawing `==` or `%%`), so the pin is
    // asserted rather than left to chance.
    assert_has("src-tauri/src/main.rs", &[
        "let mut opts = Options::all();",
        "opts.remove(Options::ENABLE_WIKILINKS);",
        "opts.remove(Options::ENABLE_SMART_PUNCTUATION);",
    ]);
    assert!(read("src-tauri/Cargo.toml").contains("pulldown-cmark = \"0.13\""),
        "pulldown-cmark left 0.13 — Options::all() may now parse a form the guide calls invisible");
}

#[test]
fn the_forms_the_app_does_not_draw_are_not_taught() {
    // A guide is a promise, not a parser dump. These ARE parsed (or inserted by
    // the palette) but drawn as plain text, or not at all — teaching them would
    // promise more than the app keeps, the one failure a guide cannot afford.
    // The reasons sit beside the data in ui/markdown-syntax.js.
    let chips: Vec<String> = arrays("ins").into_iter().flatten().collect();
    for bad in ["$", "%%", "^sup^", "~sub~", "[!NOTE]", "<!"] {
        assert!(!chips.iter().any(|c| c.contains(bad)), "the guide offers {bad:?}, which this app does not draw");
    }
    assert!(guide_block().contains("Deliberately absent:"),
        "the guide must say WHY these forms are missing, or they will be 'fixed' back in");
    assert_lacks("src-tauri/src/main.rs", &["<mark", "Tag::Highlight"]);
    // …and the two-view difference is STATED, not smoothed over: `==` is a
    // live-preview convenience, the reading view keeps the `==` as text.
    let hit = translated("highlight in live preview; the reading view keeps the == as text")
        .expect("the == row lost its sentence");
    assert!(hit.contains("阅读视图"), "the == sentence must state the reading view's limit: {hit:?}");
    assert!(guide_block().contains("hint: \"highlight in live preview; the reading view keeps the == as text\""),
        "the == row must state its own limit");
}

#[test]
fn the_guide_owns_no_list_and_no_key() {
    // ADR-10 wires the guide as a PANEL-ONLY provider: no match/offer/commit,
    // so no keystroke can open it and the list walk skips it. The engine had to
    // learn one thing for that (register accepts a panel-only provider, owner
    // skips one without `match`); everything else is unchanged.
    let prov = read("ui/hint-markdown.js");
    assert!(prov.contains("HC.register({"), "hint-markdown.js no longer registers");
    assert!(prov.contains("id: \"markdown\"") && prov.contains("priority: 5"),
        "the guide must be asked after mermaid (20) and wiki (10)");
    for no in ["match(ctx)", "offer(ctx", "commit(it", "trigger(typed"] {
        assert!(!prov.contains(no), "a panel-only provider must not implement {no:?} — that would open a list");
    }
    assert_has("ui/hint-markdown.js", &[
        "panel(ctx) {",
        "if (ctx.fence) return null;",
        "return MD.helpOf(ctx.before, ctx.line.slice(ctx.c), ctx.fence);",
        "panelCommit(it, ctx, host) {",
        "if (!it || typeof it.ins !== \"string\" || !it.ins) return false;",
        "host.replace({ l: ctx.l, from: ctx.c, to: ctx.c }, it.ins);",
        "return true;",
    ]);
    assert_lacks("ui/hint-markdown.js", &["document", "Ed.", "notesCache", "acEl", "updateTitle"]);
    // the engine's half of the contract
    assert_has("ui/hint-core.js", &[
        "const lists = typeof p.match === \"function\" && typeof p.offer === \"function\" &&",
        "if (!lists && typeof p.panel !== \"function\") return false;",
        "if (!on(p) || typeof p.match !== \"function\") continue;   // panel-only providers open no list",
        "const PANEL_MAX = 48;",
    ]);
}

#[test]
fn the_layers_load_in_order_and_the_card_fits() {
    // Vocabulary -> engine -> providers -> pane. markdown-syntax.js is L0 (the
    // data), hint-markdown.js is L2 (only the wiring), and main.js stays last
    // because it registers the host.
    let html = read("ui/index.html");
    let order = ["mermaid-syntax.js", "markdown-syntax.js", "hint-core.js",
                 "hint-wiki.js", "hint-markdown.js", "main.js"];
    let mut prev = 0usize;
    for f in order {
        let tag = format!("script src=\"{f}\"");
        let at = html.find(&tag).unwrap_or_else(|| panic!("index.html does not load {f}"));
        assert!(at > prev, "{f} must load after the previous layer in index.html");
        prev = at;
    }
    // the blank-line sheet is 35 chips over 24 meanings; a cap below it would
    // silently drop the meanings off the end of the card, so the cap is asserted
    // together with the sheet it must hold
    let core = read("ui/hint-core.js");
    let at = core.find("const PANEL_MAX = ").expect("PANEL_MAX is gone") + "const PANEL_MAX = ".len();
    let cap: usize = core[at..].split(';').next().unwrap().trim().parse().expect("PANEL_MAX is not a number");
    assert!(cap >= 35, "PANEL_MAX {cap} cannot hold the Markdown sheet");
    // nothing new in the view: the card is the ADR-9 table, painted by main.js
    assert_has("ui/main.js", &["function paintHelp(g, st) {", "if (items.some(it => it.first)) {",
        "row.className = \"mh-row\";",
        "head.textContent = h.type || i18n.t(\"Choose a diagram type\");",
        "place.textContent = i18n.t(h.place);", "cap.textContent = i18n.t(sec.name);",
        "g._hints.subscribe(st => paintHelp(g, st));", "[hinthelp:"]);
}

#[test]
fn a_row_can_be_pruned_and_brought_back() {
    // ADR-11: the guide is a lesson, so each row (one syntax element) has a
    // depth the reader sets from the card itself. Four of the five levels still
    // print the row; `off` removes it — which is why the way back must be a
    // command, not a click on something that is no longer there.
    assert_has("ui/hint-core.js", &[
        "const LEVELS = [\"full\", \"syntax\", \"example\", \"keyword\", \"off\"];",
        "depths: {} };",
        "if (typeof k === \"string\" && LEVELS.indexOf(o.depths[k]) >= 0) out.depths[k] = o.depths[k];",
        "function rowKey(it) { return String(it.row != null ? it.row : (it.ins || it.label || \"\")); }",
        "function shapeHelp(pid, h, depths) {",
        "if (level === \"off\") { row = null; return; }",
        "if (level === \"syntax\")",
        "else if (level === \"example\" || level === \"keyword\")",
        "out.push(Object.assign({}, first, { level, key }), ...row.slice(1));",
        "const h = shapeHelp(a.p.id, a.h, settings().depths);",
        "function setDepth(key, level) {",
        "depths[st.help.id + \"/\" + key] = level;",
        "function refresh() { syncHelp(true); return !!st.help; }",
        "setDepth, refresh, state: snapshot, subscribe, host",
        "function resetDepths(prefix) {",
        "if (!p || k.indexOf(p) === 0) continue;",
        "create, settings, mode, enabled, resetDepths,",
    ]);
    // the view: a pill on every row, the five levels inside the card, and the
    // "syntax only" level drops the words but keeps the row (and its pill)
    assert_has("ui/main.js", &[
        "const DEPTH_WORD = {",
        "full: \"Show fully\", syntax: \"Syntax only\", example: \"Example only\",",
        "keyword: \"Keyword only\", off: \"Hide this form\",",
        "const DEPTH_SHORT = { full: \"all\", syntax: \"syntax\", example: \"example\", keyword: \"keyword\", off: \"off\" };",
        "lv.textContent = i18n.t(DEPTH_SHORT[it.level || \"full\"]);",
        "lv.title = i18n.t(\"Guide depth\");",
        "g._hints.refresh();",
        "g._hints.setDepth(it.key, lvl);",
        "if (txt) {",
        "cmdResetDepth],",
    ]);
    assert_has("ui/style.css", &[".mh-lvl {", ".mh-lvlmenu {", ".mh-lvlmenu .mh-w.on {"]);
    // the words the card prints: the five levels twice (pill + menu) and the
    // reset message — absent translations would show English in a Chinese UI
    for k in ["Show fully", "Syntax only", "Example only", "Keyword only", "Hide this form",
              "all", "syntax", "example", "keyword", "off", "Guide depth",
              "Guide depth reset: every form is shown again"] {
        let zh = translated(k).unwrap_or_else(|| panic!("ui/i18n.js lost {k:?}"));
        assert!(zh.chars().any(|c| c as u32 >= 0x2E80), "{k:?} is not translated: {zh:?}");
    }
    // the levels in the engine and the levels in the view are the same five
    let core = read("ui/hint-core.js");
    assert!(core.contains("const LEVELS = [\"full\", \"syntax\", \"example\", \"keyword\", \"off\"];"));
    let view = read("ui/main.js");
    for lv in ["full", "syntax", "example", "keyword", "off"] {
        assert!(view.contains(&format!("{lv}: \"")),
            "ui/main.js has no word for the level {lv:?}");
    }
}

#[test]
fn the_app_checks_the_guide_on_every_load() {
    // Ed.selfTest drives the REAL provider on a fake host at startup: a blank
    // line offers 35 chips, a line with text offers only what may begin it,
    // prose / a fence / an existing marker stay quiet, a chip lands through the
    // model, and the passive row is not tappable. A regression shows up as
    // [edt:md:...] in the title instead of waiting for a user to type.
    assert_has("ui/editor.js", &[
        "const MD = window.MdHints;",
        "fail(\"md:rows\")", "fail(\"md:blank\")", "fail(\"md:blank2\")",
        "fail(\"md:first\")", "fail(\"md:item\")", "fail(\"md:dup\")",
        "fail(\"md:passive\")", "fail(\"md:passive2\")",
        "fail(\"md:prose\")", "fail(\"md:fence\")", "fail(\"md:marker\")", "fail(\"md:marker2\")",
        "fail(\"md:follow\")", "fail(\"md:tap\")", "fail(\"md:notap\")",
        "fail(\"md:start\")", "fail(\"md:tapstart\")", "fail(\"md:quiet\")",
        "fail(\"md:intent\")", "fail(\"md:noList\")",
        // ADR-11: the depths are driven on a throwaway provider, so a real
        // reader's pruning is never written by the launch check
        "fail(\"depth:default\")", "fail(\"depth:syntax\")", "fail(\"depth:example\")",
        "fail(\"depth:keyword\")", "fail(\"depth:off\")", "fail(\"depth:saved\")",
        "fail(\"depth:reset\")", "fail(\"depth:restored\")", "resetDepths(\"self:\")",
    ]);
}
