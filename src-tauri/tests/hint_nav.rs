// SPDX-License-Identifier: GPL-3.0-or-later
//! The mermaid GRAMMAR NAVIGATION — L0 data plus its interpreter, pinned.
//!
//! "What may follow here?" used to be guessed from line shapes in the provider.
//! It is now answered from mermaid's own grammar: `tools/vendor/flow-11.17.2.jison`
//! is compiled once at BUILD time by `tools/gen-hint-nav.js` into
//! `ui/hint-nav.json`, and `ui/hint-nav.js` interprets that data in the webview
//! (lexer layer for characters, LALR layer for tokens). jison is never shipped
//! and the app never runs it.
//!
//! These assertions guard the four things a merge or a "quick" hand edit can
//! silently break — and the ones the user can SEE if they break:
//!
//!   1. the data still corresponds to the vendored grammar (sha256 recomputed);
//   2. the interpreter stays pure (no DOM, no app globals, no eval, no I/O) so
//!      it can be driven from a test and from a provider alike;
//!   3. `ui/index.html` loads it in the L0 → L1 → L2 → L3 order;
//!   4. the generator/selftest that rebuild the data still exist (a hand-edited
//!      JSON with no way to regenerate it is a dead end).
//!
//! Behavioural parity with jison was checked during the port over 133 inputs
//! (53 corpus + every prefix of a realistic diagram), and is re-checked by
//! `node tools/selftest-hint-nav.js` on any grammar bump.
//!
//! NOTE: a red test here is usually a merge decision, not a bug — read the
//! failure, then re-run `node tools/gen-hint-nav.js` and
//! `node tools/selftest-hint-nav.js` before touching the pinned numbers.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use sha2::{Digest, Sha256};

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..") }

fn read(rel: &str) -> String {
    let p = root().join(rel);
    fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {}", p.display(), e))
}

fn assert_has(file: &str, needles: &[&str]) {
    let src = read(file);
    for n in needles {
        assert!(
            src.contains(n),
            "{file} no longer contains {n:?} — see README-Mac.md (Completion: the hint engine)"
        );
    }
}

fn assert_lacks(file: &str, needles: &[&str]) {
    let src = read(file);
    for n in needles {
        assert!(
            !src.contains(n),
            "{file} must not contain {n:?} — the grammar navigation layer was crossed; see README-Mac.md"
        );
    }
}

fn data() -> Value {
    serde_json::from_str(&read("ui/hint-nav.json")).expect("ui/hint-nav.json is not valid JSON")
}

#[test]
fn the_tables_are_generated_from_the_vendored_grammar() {
    let d = data();
    let meta = &d["meta"];
    assert_eq!(meta["mermaid"], "11.17.2", "the data must say which mermaid grammar it came from");
    assert_eq!(meta["jison"], "0.4.18", "the build-time compiler version is part of the pin");
    assert_eq!(meta["license"], "MIT", "flow.jison is upstream MIT");
    assert_eq!(meta["generator"], "tools/gen-hint-nav.js", "the data must name the program that rebuilds it");

    // The pin the whole design rests on: the JSON is only meaningful as long as
    // it was produced from THIS grammar. A hand edit fails here, not in the UI.
    let grammar = fs::read(root().join("tools/vendor/flow-11.17.2.jison")).expect("vendored grammar");
    let got = format!("{:x}", Sha256::digest(&grammar));
    assert_eq!(
        meta["sha256"].as_str().unwrap_or(""),
        got,
        "ui/hint-nav.json was generated from a different flow.jison — run node tools/gen-hint-nav.js"
    );
}

#[test]
fn the_tables_have_the_shape_the_runtime_expects() {
    let d = data();
    let p = &d["parser"];
    let l = &d["lex"];

    // Counts are deliberately exact: a grammar bump must be a reviewed diff, and
    // a silently truncated table would otherwise "work" by answering nothing.
    // `table` is an array of per-state rows: keys are symbol ids, values are
    // [1,state] shift / [2,production] reduce / [3] accept, or a bare goto.
    assert_eq!(p["table"].as_array().map(|a| a.len()), Some(291), "LALR states");
    assert_eq!(p["productions"].as_array().map(|a| a.len()), Some(190), "productions");
    assert_eq!(p["terminals"].as_object().map(|m| m.len()), Some(84), "terminals");
    assert_eq!(l["patterns"].as_array().map(|a| a.len()), Some(122), "lexer rules");
    assert_eq!(l["actions"].as_array().map(|a| a.len()), Some(122), "one serialized action per rule");
    assert_eq!(l["conditions"].as_object().map(|m| m.len()), Some(21), "lexer conditions");

    let cells: usize = p["table"]
        .as_array()
        .expect("table")
        .iter()
        .map(|row| row.as_object().map(|r| r.len()).unwrap_or(0))
        .sum();
    assert_eq!(cells, 4142, "table cells (shift/reduce/goto entries)");

    // Every condition may only point at rules that exist, and every serialized
    // action must stay in the three forms the interpreter models.
    let n = l["patterns"].as_array().unwrap().len();
    for (name, cond) in l["conditions"].as_object().expect("conditions") {
        for r in cond["rules"].as_array().expect("rules") {
            let i = r.as_u64().expect("rule index") as usize;
            assert!(i < n, "condition {name} points at rule {i}, but only {n} rules exist");
        }
    }
    for a in l["actions"].as_array().expect("actions") {
        assert!(a["ops"].as_array().is_some(), "an action lost its ops array");
        for op in a["ops"].as_array().unwrap() {
            let k = op[0].as_str().unwrap_or("");
            assert!(
                matches!(k, "push" | "pop" | "firstGraph"),
                "unsupported lexer action {k:?} — teach tools/gen-hint-nav.js and ui/hint-nav.js"
            );
        }
    }

    // The two lexer tokens mermaid's own grammar never accepts are declared,
    // not hidden: the interpreter maps them to "no token" like jison would.
    let dead = d["meta"]["deadTokens"].as_array().expect("deadTokens");
    assert!(!dead.is_empty(), "deadTokens documents the known-unreachable lexer names (SEP/QUOTE)");

    // Compact on purpose: one line means a regeneration is one reviewable diff.
    let raw = read("ui/hint-nav.json");
    assert!(raw.trim_end().matches('\n').count() == 0, "ui/hint-nav.json must stay a single compact line");
    assert!(raw.len() > 60_000 && raw.len() < 90_000, "table size moved ({} bytes) — re-check the budget", raw.len());
}

#[test]
fn the_interpreter_is_pure_and_owns_both_layers() {
    // Pure = drivable from Node (tools/selftest-hint-nav.js) and from a provider.
    assert_lacks("ui/hint-nav.js", &[
        "document", "addEventListener", "querySelector", "createElement",
        "getComputedStyle", "Ed.", "MmdHints", "notesCache", "localStorage",
        "eval(", "new Function(", "require(", "fetch(",
    ]);
    assert_has("ui/hint-nav.js", &[
        "window.HintNav = {",
        "load,", "ready,", "meta,", "tokenize,", "drive,", "at,", "chars,",
        // the lexer layer: first-match-wins and sticky end-of-input, like jison
        "if (this.done) return END;",
        // an unmatched character is an error, never an infinite loop
        "if (this.lexerror) return 0;",
        // mermaid's firstGraph() only opens `dir` once per fence
        "if (!this.firstGraph) { this.firstGraph = true; this.pushState(op[1]); }",
        // the LALR layer: shift/reduce/accept, goto for a bare number
        "const kind = Array.isArray(action) ? action[0] : 1;",
        "if (kind === 3) return { verdict: \"accept\" };",
        // budgets: a fence, not a novel
        "const MAX_TOKENS = 4096;",
        "const MAX_STEPS = 8192;",
    ]);
    assert_lacks("ui/hint-nav.js", &["HintCore.register", "ctx.before", "host."]);
}

#[test]
fn the_layers_load_in_order() {
    let html = read("ui/index.html");
    let order = ["mermaid-syntax.js", "hint-nav.js", "hint-core.js", "hint-mermaid.js", "main.js"];
    let mut prev = 0usize;
    for f in order {
        let tag = format!("script src=\"{f}\"");
        let at = html.find(&tag).unwrap_or_else(|| panic!("index.html does not load {f}"));
        assert!(at > prev, "{f} must load AFTER the previous layer in index.html");
        prev = at;
    }
}

#[test]
fn the_data_can_be_rebuilt_and_rechecked() {
    // No node_modules are shipped: the generator names the exact one-off install
    // and is the only writer of ui/hint-nav.json.
    assert_has("tools/gen-hint-nav.js", &[
        "jison@0.4.18",
        "flow-11.17.2.jison",
        "performAction",
        "sha256",
        "--check",
        "ui/hint-nav.json",
    ]);
    assert_has("tools/selftest-hint-nav.js", &[
        "b95d5a12271ece39b9be35fdc082801ed73c179e54f2903b472452394991e384",
        "A--", "A-->", "complete via at()",
        "Nav.chars(owner)", "lexerror",
    ]);
    for f in ["tools/vendor/flow-11.17.2.jison", "tools/gen-hint-nav.js", "tools/selftest-hint-nav.js"] {
        assert!(root().join(f).is_file(), "{f} is missing — the tables can no longer be regenerated");
    }
    // Upstream licence travels with the vendored grammar.
    assert_has("tools/vendor/flow-11.17.2.jison", &["MIT license", "Knut Sveidqvist"]);
    assert_has("THIRD-PARTY.md", &["flow.jison", "jison 0.4.18", "MIT"]);
}
