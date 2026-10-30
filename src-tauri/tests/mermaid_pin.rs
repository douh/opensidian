// SPDX-License-Identifier: GPL-3.0-or-later
//! mermaid as THIS fork ships it — pinned, so an upstream merge cannot quietly
//! take it away.
//!
//! Upstream keeps the slot and refuses it: `GATED.loadMermaid` rejects with
//! "Mermaid is still not vendored". This fork filled that slot (vendored bytes
//! under `ui/vendor/mermaid/`) and draws the fences twice — reading view
//! (`main.js: drawMermaid`) and live preview (`editor.js: BlockW`). If upstream
//! ever ships its own renderer, the merge must CHOOSE one drawing path; what it
//! must not do is drop the three things this fork refuses to lose:
//!
//!   1. `securityLevel:"strict"`, no eval, and no bare `'unsafe-eval'` in the CSP;
//!   2. lazy bytes (a note without a fence never loads 3.4 MB) and a failed
//!      diagram that shows its source instead of an empty box;
//!   3. platform neutrality: one `frontendDist`, and `tauri.macos.conf.json`
//!      overriding neither `csp` nor `resources`.
//!
//! A red test here is a merge decision, not a bug: read it, apply the table in
//! `README-Mac.md` ("Mermaid：若上游也做了"), then run again. The byte check
//! below also catches a half-finished re-pin (new bytes, stale `SHA256SUMS`).

use sha2::{Digest, Sha256};
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
        assert!(
            src.contains(n),
            "{file} no longer contains {n:?} — an upstream merge dropped part of the mermaid work; \
             see README-Mac.md \"Mermaid：若上游也做了\" for what to do with it"
        );
    }
}

#[test]
fn vendor_bytes_match_the_manifest() {
    let sums = read("ui/vendor/mermaid/SHA256SUMS");
    let mut checked = 0;
    for line in sums.lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let want = it.next().expect("digest");
        let name = it.next().expect("file name");
        assert_eq!(want.len(), 64, "sha256 for {name} is not 64 hex chars");
        assert!(want.chars().all(|c| c.is_ascii_hexdigit()), "sha256 for {name} is not hex");
        let bytes = fs::read(root().join("ui/vendor/mermaid").join(name))
            .unwrap_or_else(|e| panic!("ui/vendor/mermaid/{name}: {e}"));
        let got = format!("{:x}", Sha256::digest(&bytes));
        assert_eq!(got, want, "ui/vendor/mermaid/{name} does not match its SHA256SUMS line");
        checked += 1;
    }
    assert!(checked >= 2, "SHA256SUMS must cover the library and its LICENSE (found {checked})");
    let js = fs::metadata(root().join("ui/vendor/mermaid/mermaid.min.js")).expect("mermaid.min.js").len();
    assert!(js > 1_000_000, "ui/vendor/mermaid/mermaid.min.js is {js} bytes — a placeholder, not the upstream build");
    assert_has("ui/vendor/mermaid/VENDOR.md", &["11.17.2", "MIT", "securityLevel:\"strict\"", "no eval"]);
}

#[test]
fn loader_is_real_not_the_reject_stub() {
    let src = read("ui/plugins/api-functions.js");
    assert!(
        !src.contains("loadMermaid: () => Promise.reject"),
        "loadMermaid is back to upstream's reject stub — the vendored build is not reachable any more"
    );
    assert_has(
        "ui/plugins/api-functions.js",
        &[
            "function loadMermaid()",
            "loadScript(\"mermaid/mermaid.min.js\"",
            "startOnLoad: false, securityLevel: \"strict\"",
            "{ loadMathJax, loadPrism, loadMermaid }",
        ],
    );
}

#[test]
fn reading_view_draws_and_fails_soft() {
    assert_has(
        "ui/main.js",
        &[
            "function drawMermaid(P, src)",
            "pre > code.language-mermaid",
            "drawMermaid(g.preview, src);",
            "box.classList.add(\"bad\")",
            "if (n) pvSettled(P, src);",
        ],
    );
}

#[test]
fn live_preview_draws_the_block_and_caches() {
    assert_has(
        "ui/editor.js",
        &[
            "const mmdCache = new Map()",
            "const mmdPending = new Set()",
            "k === \"mermaid\"",
            "box.className = \"mermaid-block\"",
            "box.classList.add(\"pending\")",
        ],
    );
}

#[test]
fn css_covers_both_views_and_both_failure_modes() {
    assert_has(
        "ui/style.css",
        &[":is(.preview, .lp) .mermaid-block", ".mermaid-block.bad", ".mermaid-block.pending"],
    );
}

#[test]
fn csp_still_refuses_eval() {
    let cfg = read("src-tauri/tauri.conf.json");
    assert!(
        cfg.contains("script-src 'self' opensidian-plugin: 'wasm-unsafe-eval'"),
        "the script-src clause changed; mermaid must keep loading from 'self' under this CSP"
    );
    assert!(
        !cfg.contains("'unsafe-eval'"),
        "a bare 'unsafe-eval' appeared in the CSP — vendored mermaid does not need it (only 'wasm-unsafe-eval' is pinned)"
    );
}

#[test]
fn asset_delivery_stays_platform_neutral() {
    let cfg = read("src-tauri/tauri.conf.json");
    assert!(cfg.contains("\"frontendDist\": \"../ui\""), "frontendDist moved — mermaid bytes are no longer shipped from one tree");
    let mac = read("src-tauri/tauri.macos.conf.json");
    assert!(!mac.contains("\"csp\""), "tauri.macos.conf.json now overrides the CSP; the security surface must stay shared");
    assert!(!mac.contains("\"resources\""), "tauri.macos.conf.json now ships its own resources; mermaid must come from ../ui");
}

#[test]
fn third_party_names_the_library() {
    assert_has("THIRD-PARTY.md", &["### Mermaid 11.17.2", "MIT"]);
}
