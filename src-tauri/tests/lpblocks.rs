// SPDX-License-Identifier: GPL-3.0-or-later
//! live preview fences (fenced code and ```mermaid) — the parsing half, pinned.
//!
//! Runs the REAL `Ed.fenceAt` out of ui/editor.js in JavaScriptCore — the
//! engine the webview itself runs it in (javascriptcore-rs is webkit2gtk's own
//! transitive dep, pinned `=` to the locked version: no new crate) — against a
//! document adapter that offers only `line(n).text`, the one thing the parser
//! reads. The widget that draws the block needs CodeMirror and a DOM; what
//! needs pinning here is CommonMark's decision: where a fence opens and
//! closes, which info word becomes the language, how the opening indent comes
//! off the body, and that an unclosed fence runs to the end of the document.
//! A refactor must not quietly turn a code block into a paragraph.
#![cfg(target_os = "linux")]

use javascriptcore::{ContextExt, ExceptionExt, ValueExt};
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..") }

fn js(s: &str) -> String { serde_json::to_string(s).unwrap() }

/// (name, source lines, 1-based opening line, expected JSON — `null` = no fence)
const CASES: &[(&str, &[&str], usize, &str)] = &[
    ("backtick fence", &["```js", "let a = 1;", "```"], 1,
     r#"{"e":3,"lang":"js","body":"let a = 1;","open":false}"#),
    ("tilde fence", &["~~~python", "x = 1", "~~~"], 1,
     r#"{"e":3,"lang":"python","body":"x = 1","open":false}"#),
    ("no info word", &["```", "plain", "```"], 1,
     r#"{"e":3,"lang":"","body":"plain","open":false}"#),
    ("unclosed runs to the end", &["```", "still here", "and here"], 1,
     r#"{"e":3,"lang":"","body":"still here\nand here","open":true}"#),
    ("four marks hold three", &["````", "```", "````"], 1,
     r#"{"e":3,"lang":"","body":"```","open":false}"#),
    ("opening indent comes off", &["  ```css", "  a { b: c }", "  ```"], 1,
     r#"{"e":3,"lang":"css","body":"a { b: c }","open":false}"#),
    ("shallow body line keeps its text", &["  ```js", " a", "   ```"], 1,
     r#"{"e":3,"lang":"js","body":"a","open":false}"#),
    ("four spaces is an indented code block", &["    ```js", "x", "    ```"], 1, "null"),
    ("inline code is not a fence", &["```js```"], 1, "null"),
    ("info string with a backtick is inline code", &["```a`b", "x", "```"], 1, "null"),
    ("mermaid", &["```mermaid", "graph TD; A-->B;", "```"], 1,
     r#"{"e":3,"lang":"mermaid","body":"graph TD; A-->B;","open":false}"#),
    ("trailing spaces close", &["```js", "x", "```   "], 1,
     r#"{"e":3,"lang":"js","body":"x","open":false}"#),
    ("longer close is a close", &["```js", "x", "`````"], 1,
     r#"{"e":3,"lang":"js","body":"x","open":false}"#),
    ("other marker does not close", &["```js", "x", "~~~"], 1,
     r#"{"e":3,"lang":"js","body":"x\n~~~","open":true}"#),
    ("shorter close does not close", &["```js", "x", "``"], 1,
     r#"{"e":3,"lang":"js","body":"x\n``","open":true}"#),
    ("after a text line", &["text", "```txt", "y", "```", "after"], 2,
     r#"{"e":4,"lang":"txt","body":"y","open":false}"#),
    ("info attributes, first word is the language", &["````js title=x", "  z", "````"], 1,
     r#"{"e":3,"lang":"js","body":"  z","open":false}"#),
];

#[test]
fn fence_table() {
    let ed = std::fs::read_to_string(root().join("ui/editor.js")).unwrap();
    let ctx = javascriptcore::Context::new();
    // editor.js's only load-time DOM touch is one selectionchange listener
    ctx.evaluate("var window = {}; var document = { addEventListener() {} };");
    ctx.evaluate(&ed);
    if let Some(e) = ctx.exception() { panic!("editor.js did not load: {}", e.to_str()); }
    assert_eq!(ctx.evaluate("typeof Ed.fenceAt").unwrap().to_str().as_str(), "function",
               "Ed.fenceAt missing from ui/editor.js");

    let mut fails = Vec::new();
    for (name, lines, n, want) in CASES {
        let arr = lines.iter().map(|l| js(l)).collect::<Vec<_>>().join(",");
        let src = format!(
            "(function(){{ var L = [{arr}];\
             var doc = {{ lines: L.length, line: function (n) {{ return {{ text: L[n - 1], from: 0, to: 0 }}; }} }};\
             return JSON.stringify(Ed.fenceAt(doc, {n}, doc.lines)); }})()",
            arr = arr, n = n);
        let got = ctx.evaluate(&src).map(|v| v.to_str().to_string()).unwrap_or_default();
        if got != *want { fails.push(format!("{name}: got {got} want {want}")); }
    }
    assert!(fails.is_empty(), "{} of {} fence cases failed:\n{}", fails.len(), CASES.len(), fails.join("\n"));
}
