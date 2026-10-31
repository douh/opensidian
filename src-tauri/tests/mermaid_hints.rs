// SPDX-License-Identifier: GPL-3.0-or-later
//! mermaid syntax hints — the vocabulary and the wiring, checked without a
//! browser.
//!
//! Two things can rot here. The DATA: a keyword that Mermaid does not accept
//! teaches a user something the renderer then rejects, which is worse than no
//! hint at all — so every quoted string in the module's HINTS block is looked
//! up in the vendored 11.17.2 bundle. The WIRING: the popup, the insertion path
//! and the error caption live in three files that a merge could rearrange
//! without breaking a single JS line; the assertions below name the seams.
//!
//! (The interactive half — typing inside a fence really opens the popup, a bad
//! diagram really shows the parser's line — needs a running webview and is
//! covered by the macOS probe, not by this file.)

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
        assert!(src.contains(n), "{file} no longer contains {n:?} — the mermaid syntax hints were rearranged; see README-Mac.md");
    }
}

/// The HINTS block of ui/mermaid-syntax.js, between its markers.
fn hints_block() -> String {
    let src = read("ui/mermaid-syntax.js");
    let a = src.find("HINTS-BEGIN").expect("HINTS-BEGIN marker");
    let b = src.find("HINTS-END").expect("HINTS-END marker");
    assert!(b > a, "HINTS-END must follow HINTS-BEGIN");
    src[a..b].to_string()
}

/// Every double-quoted string in the HINTS block that carries a word.
fn vocabulary() -> Vec<String> {
    let block = hints_block();
    let mut out = Vec::new();
    for part in block.split('"').enumerate() {
        if part.0 % 2 == 0 { continue; }                      // outside quotes
        let s = part.1.to_string();
        if s.len() >= 3 && s.chars().any(|c| c.is_ascii_alphabetic()) { out.push(s); }
    }
    out
}

#[test]
fn every_suggested_word_exists_in_the_vendored_bundle() {
    let bundle = read("ui/vendor/mermaid/mermaid.min.js");
    let words = vocabulary();
    assert!(words.len() >= 120, "only {} vocabulary strings — the HINTS block lost data", words.len());
    let missing: Vec<&String> = words.iter().filter(|w| !bundle.contains(w.as_str())).collect();
    assert!(
        missing.is_empty(),
        "these suggestions do not occur in the vendored 11.17.2 bundle, so Mermaid would reject them: {missing:?}"
    );
}

#[test]
fn the_type_list_is_the_whole_shipped_grammar() {
    let block = hints_block();
    for t in ["flowchart", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "erDiagram", "gantt",
              "pie", "mindmap", "timeline", "journey", "gitGraph", "quadrantChart", "requirementDiagram",
              "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment", "sankey-beta",
              "xychart-beta", "block-beta", "packet-beta", "kanban", "architecture-beta", "radar-beta",
              "treemap-beta"] {
        assert!(block.contains(&format!("[\"{t}\"")), "diagram type {t:?} is missing from TYPES");
    }
    assert!(block.contains("graph: \"flowchart\""), "`graph` must alias the flowchart keyword table");
    assert!(!block.contains("zenuml"), "zenuml has no parser in the vendored bytes — it must not be offered");
}

#[test]
fn the_module_is_a_classic_script_loaded_before_main() {
    let html = read("ui/index.html");
    let vocab = html.find("script src=\"mermaid-syntax.js\"").expect("mermaid-syntax.js is not loaded by index.html");
    let prov = html.find("script src=\"hint-mermaid.js\"").expect("hint-mermaid.js tag");
    let main = html.find("script src=\"main.js\"").expect("main.js tag");
    assert!(vocab < prov, "the vocabulary must load BEFORE the provider that reads it");
    assert!(prov < main, "the providers must load BEFORE main.js (it registers the host)");
    assert_has("ui/mermaid-syntax.js",
        &["window.MmdHints = { TYPES, KW, ALIAS, wordChar, statementStart, wordAt, fenceOf, typeOf, suggest,",
          "helpOf, joins, SECTION, NAVTOK, errText };"]);
}

#[test]
fn the_popup_has_a_mermaid_source() {
    // The mermaid half is a PROVIDER of the hint engine (ui/hint-core.js): its
    // own file, its own three answers, the vocabulary from ui/mermaid-syntax.js.
    // main.js no longer knows anything about mermaid syntax.
    assert_has("ui/hint-mermaid.js", &[
        "id: \"mermaid\"",
        "if (!f || f.lang !== \"mermaid\") return false;",
        "const w = M.wordAt(ctx.before);",
        "return M.statementStart(ctx.before.slice(0, w.from));",
        "trigger(typed) { return M.wordChar(typed); },",
        "const sug = M.suggest(ctx.lines.slice(f.start, ctx.l), ctx.before);",
        "range: { l: ctx.l, from: ctx.c - w.word.length, to: ctx.c }",
        "commit(it, ctx, host) { host.replace(ctx.range, it.ins); },",
    ]);
}

#[test]
fn the_hints_follow_typing_not_changes() {
    // The input flow lives in the ENGINE now, once, instead of in three helpers
    // in main.js: typing (only) may open, a caret move only refreshes a list
    // that still describes the caret, everything else only ends one, the arrow
    // keys and the accept keys belong to the list, and Escape/Shift+Tab end it
    // (ADR-7: Tab opens only where a list can open, so indent survives). If any
    // of these is dropped the popup degrades back to "a list that appears
    // whenever the document changes" — the defect this flow was built to fix.
    assert_has("ui/editor.js", &[
        "typedChar(u) {",
        // the flow is keyed on the transaction's origin, not on change shapes:
        // paste, undo, redo, drag-drop and our own insertions never open a list
        "if (!t || !t.isUserEvent(\"input.type\")) return null;",
        "g._hints.sense({ typed: Ed.typedChar(u), moved: !!u.selectionSet, docChanged: true });",
        "if (u.selectionSet && !u.docChanged && g._hints) g._hints.sense({ typed: null, moved: true, docChanged: false });",
        "if (g._hints && g._hints.key(e)) { e.preventDefault(); e.stopPropagation(); return; }",
    ]);
    assert_has("ui/hint-core.js", &[
        "if (!typed) return false;",                       // nothing opens without a typed character
        "if (use() !== \"auto\") return false;",            // manual/off are intents, not hints
        "if (!p || !p.trigger(typed, ctx)) return false;",
        "if (!inside(st.range, ctx)) return close(\"moved\");",
        "if (K.dismiss.indexOf(c) >= 0) { close(c === \"Escape\" ? \"escape\" : \"dismiss\"); return true; }",
        "if (K.accept.indexOf(c) >= 0) { pick(st.sel); return true; }",
    ]);
    // and the policy itself is pure, so selfTest proves it on every launch
    assert_has("ui/editor.js", &["fail(\"mmd:char\")", "fail(\"mmd:start\")"]);
}

#[test]
fn insertion_goes_through_the_model() {
    // One primitive for both providers: the host's `replace` on the offered
    // span, through Ed.replace (the model) — same undo entry, dirty flag and
    // save path as typing. A provider never touches a DOM node.
    assert_has("ui/main.js", &[
        "replace: (r, text) => Ed.replace(g,",
        "{ a: { l: r.l, c: Math.max(0, r.from) }, b: { l: r.l, c: Math.max(0, r.to) }, empty: false },",
    ]);
    assert_has("ui/hint-wiki.js", &[r#"commit(it, ctx, host) { host.replace(ctx.range, "[[" + it.ins + "]]"); },"#]);
}

#[test]
fn a_broken_diagram_explains_itself_in_both_views() {
    assert_has("ui/main.js", &["const why = window.MmdHints && MmdHints.errText(e);",
        "h.className = \"mmderr\""]);
    assert_has("ui/editor.js", &["mmdCache.set(src, { bad: window.MmdHints ? MmdHints.errText(e) : \"parse error\" });",
        "h.className = \"mmderr\"; h.textContent = c.bad;"]);
    assert_has("ui/style.css", &[":is(.preview, .lp) .mermaid-block .mmderr"]);
}

#[test]
fn the_context_layer_speaks_the_same_vocabulary() {
    // ADR-8: the layer must never invent syntax either — its words are drawn
    // from TYPES/KW, the two tables this file checks against the vendored bundle,
    // and its `place` values are i18n keys.
    //
    // ADR-9: it is a TREE, and the extra levels are still not invented. The
    // section captions are only names over those same tables; a flowchart's last
    // levels are the compiled flow.jison tables (ui/hint-nav.json) — the parser
    // itself — and anything the tables cannot name falls back to the verified
    // keyword groups rather than to a guess.
    assert_has("ui/mermaid-syntax.js", &[
        "function helpOf(prev, prefix, nav) {",
        "const OPENERS = {",
        "const INNER = [\"end\", \"else\", \"and\"];",
        "const SECTION = {",
        "function kwSections(key, depth) {",
        "if (depth === 0 && INNER.indexOf(k) >= 0) continue;",
        "const NAVTOK = {",
        "function navSections(prev, prefix, nav) {",
        "if (!sections) sections = kwSections(d.key, depth);",
        // the chooser says nothing twice: its heading IS "Choose a diagram type"
        "return { type: \"\", place: \"\", sections: [{ name: \"\", items }], items };",
        "place: depth > 0 ? \"Inside a block\" : \"Top-level statement\", sections, items };",
        "helpOf, joins, SECTION, NAVTOK, errText };",
    ]);
    assert_has("ui/hint-mermaid.js", &[
        "panel(ctx) {",
        "if (n <= f.start || (!f.unclosed && n >= f.end)) return null;",
        "return M.helpOf(ctx.lines.slice(f.start, ctx.l), ctx.before, window.HintNav);",
        "panelCommit(it, ctx, host) {",
        r#"const pad = M.joins(it.ins) && /[A-Za-z0-9_)\]}]$/.test(ctx.before) ? " " : "";"#,
    ]);
    assert_has("ui/i18n.js", &["\"Choose a diagram type\": \"选择图表类型\"",
        "\"Top-level statement\": \"顶层语句\"", "\"Inside a block\": \"块内（用 end 收尾）\"",
        "\"Statements\": \"语句\"", "\"Arrow style\": \"连线箭头\"", "\"Links\": \"连线\""]);
    // The tables are DATA, not code: the JSON carries its provenance (mermaid and
    // jison versions, the grammar's sha256) so a bump cannot silently diverge.
    let nav = read("ui/hint-nav.json");
    assert!(nav.contains("\"sha256\""), "ui/hint-nav.json must carry the grammar's sha256 in its meta");
    assert!(nav.contains("\"jison\":\"0.4.18\"") || nav.contains("\"jison\": \"0.4.18\""),
        "ui/hint-nav.json must pin the jison version it was compiled with");
    // The tables load with a same-origin fetch (main.js), and connect-src is
    // otherwise closed to everything but IPC. Without 'self' the fetch is blocked
    // and every flowchart level silently falls back to the keyword groups
    // (measured on the real app 2026-10-31).
    let csp = read("src-tauri/tauri.conf.json");
    assert!(csp.contains("connect-src ipc: http://ipc.localhost 'self'"),
        "the CSP no longer allows fetching ui/hint-nav.json; the grammar levels would fall back to keywords");
    assert!(!csp.contains("connect-src * "), "connect-src widened to the whole web — the tables need 'self' only");
}

#[test]
fn the_app_checks_the_hints_on_every_load() {
    // Ed.selfTest runs at startup, so the pure half of these hints AND the hint
    // engine (driven on a fake host) are proven on a real webview without
    // typing anything — a regression surfaces as [edt:mmd:...] / [edt:hint:...]
    // in the window title. That also means the checks may not be quietly
    // dropped when selfTest is refactored.
    assert_has("ui/editor.js", &["const MH = window.MmdHints, HC = window.HintCore;",
        "fail(\"mmd:types\")", "MH.fenceOf(mdoc, 3, dt.length)", "fail(\"mmd:err\")", "fail(\"mmd:word\")"]);
    assert_has("ui/editor.js", &["fail(\"hint:open\")", "fail(\"hint:take\")", "fail(\"hint:stale\")"]);
    assert_has("ui/mermaid-syntax.js", &[r#".replace(/^\.{3}\s*/, "")"#]);
}

#[test]
fn the_probe_can_see_the_hints() {
    // [hintmode:] always (the intent reaches the engine), [hint:open:p:n:first]
    // while a list is up (what the popup SAYS, not just that something covers
    // pixels), [mmderr:] the parser's own line under a broken diagram.
    assert_has("ui/census.js", &["hintTok()", "[mmderr:"]);
    assert_has("ui/main.js", &["[hintmode:", "[hint:"]);
}
