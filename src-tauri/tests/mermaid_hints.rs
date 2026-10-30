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
    let m = html.find("script src=\"mermaid-syntax.js\"").expect("mermaid-syntax.js is not loaded by index.html");
    let main = html.find("script src=\"main.js\"").expect("main.js tag");
    assert!(m < main, "mermaid-syntax.js must load BEFORE main.js (showAc reads window.MmdHints)");
    assert_has("ui/mermaid-syntax.js", &["window.MmdHints = { TYPES, KW, ALIAS, fenceOf, typeOf, suggest, errText }"]);
}

#[test]
fn the_popup_has_a_mermaid_source() {
    assert_has("ui/main.js", &[
        "function mmdContext(g)",
        "MH.fenceOf(",
        "if (!f || f.lang !== \"mermaid\") return null;",
        "acKind = \"m\";",
        "function paintAc(g)",
        "if (acKind === \"m\") Ed.acInsertText(g, acLine, acStart, acEnd, name);",
        // a [[ completion after a mermaid hint must fall back to the note path
        "acStart = ctx.start; acLine = 0; acEnd = -1; acKind = \"n\";",
    ]);
}

#[test]
fn insertion_goes_through_the_model() {
    assert_has("ui/editor.js", &[
        "acInsertText(g, l, c0, c1, text)",
        "Ed.replace(g, { a: { l, c: Math.max(0, c0) }, b: { l, c: Math.max(0, c1) }, empty: false }",
    ]);
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
fn the_app_checks_the_hints_on_every_load() {
    // Ed.selfTest runs at startup, so the pure half of these hints is proven on
    // a real webview without typing anything — a regression surfaces as
    // [edt:mmd:...] in the window title. That also means the checks may not be
    // quietly dropped when selfTest is refactored.
    assert_has("ui/editor.js", &["const MH = window.MmdHints;", "fail(\"mmd:types\")",
        "MH.fenceOf(mdoc, 3, dt.length)", "fail(\"mmd:err\")"]);
    assert_has("ui/mermaid-syntax.js", &[r#".replace(/^\.{3}\s*/, "")"#]);
}

#[test]
fn the_probe_can_see_the_hints() {
    assert_has("ui/census.js", &["[mmd:", "[mmderr:"]);
}
