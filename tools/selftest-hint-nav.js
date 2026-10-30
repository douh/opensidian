// SPDX-License-Identifier: GPL-3.0-or-later
/* SELFTEST — ui/hint-nav.json + ui/hint-nav.js, no dependencies, no network.

   The Rust suite (src-tauri/tests/hint_nav.rs) pins the data: grammar sha256,
   table sizes, runtime purity, script order. It cannot, however, tell whether
   the interpreter actually ANSWERS like mermaid's grammar. This script does
   that, in plain Node, by asking the same questions the completion UI asks:

     A--        which characters continue the arrow?   (lexer layer)
     A-->       which tokens may come next?            (LALR layer)
     A-->B      is a caret here mid-rule?              (drive, without EOF)
     A-->B\n    is the fence so far a complete flow?   (drive, with EOF)

   Expected values were cross-checked against jison 0.4.18 + flow.jison 11.17.2
   during the port (see PLAN-mermaid-grammar.md §9); they are the oracle, not a
   restatement of the tables.

   USAGE: node tools/selftest-hint-nav.js   (exit 1 on the first failed case) */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "ui", "hint-nav.json");
const RUNTIME = path.join(ROOT, "ui", "hint-nav.js");

let checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) {
    console.error("FAIL " + what);
    process.exit(1);
  }
}
function eq(got, want, what) {
  ok(JSON.stringify(got) === JSON.stringify(want), what + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want));
}

/* ---------- load ---------- */
global.window = {};
require(RUNTIME);
const Nav = global.window.HintNav;
ok(Nav && typeof Nav.at === "function", "ui/hint-nav.js exposes window.HintNav");

const raw = fs.readFileSync(DATA, "utf8");
ok(Nav.load(raw), "ui/hint-nav.json loads");
const meta = Nav.meta();
eq(meta.sha256, "b95d5a12271ece39b9be35fdc082801ed73c179e54f2903b472452394991e384", "grammar sha256 is pinned");
eq([meta.mermaid, meta.jison, meta.license], ["11.17.2", "0.4.18", "MIT"], "meta names upstream versions");
const d = JSON.parse(raw);
eq(Object.keys(d.parser.table).length, 291, "LALR states");
eq(d.parser.productions.length, 190, "productions");
eq(Object.keys(d.parser.terminals).length, 84, "terminals");
eq(d.lex.patterns.length, 122, "lexer rules");
eq(Object.keys(d.lex.conditions).length, 21, "lexer conditions");
eq(meta.deadTokens, ["SEP", "QUOTE"], "lexer tokens the grammar never accepts are declared");

/* ---------- layer 1: characters after `A--` ---------- */
const owner = "graph TD\nA--";
const ch = Nav.chars(owner);
eq(ch.link.slice().sort(), ["-", ">", "x", "o"].sort(), "A-- : o/x/>/- complete LINK");
ok(ch.text.includes("a") && ch.text.includes("A"), "A-- : letters start edge text");
eq(ch.all[" "], "NO_TOKEN", "A--<space> is absorbed into the arrow token, no candidate");
eq(ch.push, { '"': "string" }, "A-- : only the quote moves the lexer state silently");
eq(ch.push['"'], "string", "A--\" opens the string condition without a token");
ok(!ch.bad.includes('"'), "A--\" is not an error");
eq(ch.bad, [], "A-- : every printable character has a rule in this state");
eq(Nav.chars(owner), ch, "chars() caches per prefix");

/* ---------- layer 2: tokens after `A-->` ---------- */
const tok = Nav.tokenize("graph TD\nA-->");
eq(tok.map((t) => t.name), ["GRAPH", "DIR", "NEWLINE", "NODE_STRING", "LINK", "EOF"],
  "A--> tokenizes to the arrow token, not a state");
const at = Nav.at("graph TD\nA-->");
eq(at.expected, ["AMP", "BRKT", "COLON", "COMMA", "DEFAULT", "DOWN", "MINUS", "MULT",
  "NODE_STRING", "NUM", "PIPE", "TESTSTR", "UNICODE_TEXT"], "A--> expects a node or an edge label");
eq(at.lex.top, "INITIAL", "A--> returns to INITIAL");
eq(at.complete, false, "A--> alone is not a diagram");

/* ---------- edge label ---------- */
const label = Nav.at("graph TD\nA-->|");
for (const want of ["TEXT", "STR", "MD_STR", "UNICODE_TEXT"]) {
  ok(label.expected.includes(want), "A-->| expects label " + want);
}
ok(!label.expected.includes("PIPE"), "A-->| has already taken the opening pipe");
const inside = Nav.at("graph TD\nA-->|x");
ok(inside.expected.includes("PIPE"), "A-->|x closes the label with a pipe");
const done = Nav.at("graph TD\nA-->|x|");
eq(done.verdict, "prefix", "A-->|x| is a valid prefix");

/* ---------- whole statements ---------- */
eq(Nav.drive(Nav.tokenize("graph TD\nA-->B"), { keepEof: true }).verdict, "accept", "A-->B is a complete flow");
eq(Nav.at("graph TD\nA-->B").complete, true, "A-->B complete via at()");
eq(Nav.at("graph TD\nA-->|x|B").complete, true, "A-->|x|B complete via at()");
eq(Nav.at("graph TD\nA-- text -->B").complete, true, "A-- text -->B complete via at()");
eq(Nav.at("graph TD\nA-->B\n").complete, true, "trailing newline keeps the diagram complete");

/* ---------- mid-rule vs mistake ---------- */
const mid = Nav.drive(Nav.tokenize("graph TD\nA-->B\nA--"));
eq(mid.verdict, "prefix", "A-- on a new line waits for its arrow");
ok(mid.expected.length > 0, "A-- mid-rule still has expectations");
const err = Nav.drive(Nav.tokenize("graph TD\nA-->B C"));
eq(err.verdict, "error", "two node ids in a row is an error, not a guess");
const lexerr = Nav.at("graph TD\nA-->B\u{1F600}");
eq(lexerr.verdict, "lexerror", "a character with no rule is a lexerror, not a throw");
eq(Nav.at("graph TD\nA-->B)").verdict, "lexerror", "stray punctuation ends the token stream instead of spinning");

/* ---------- mermaid quirks we must keep ---------- */
eq(Nav.tokenize("graph TD\ngraph LR").slice(-4).map((t) => t.name), ["GRAPH", "SPACE", "NODE_STRING", "EOF"],
  "only the first `graph` opens the direction state (the second is no DIR)");
eq(Nav.tokenize("flowchart LR\nA-->B").map((t) => t.name).slice(0, 2), ["GRAPH", "DIR"],
  "flowchart LR is a direction, not a node");

/* ---------- malformed input must not poison the pane ---------- */
ok(Nav.load("{") === false, "broken JSON is refused");
eq(Nav.ready(), true, "a refused load keeps the working data");
ok(Nav.load({ parser: {}, lex: {} }) === false, "an incomplete table is refused");
eq(Nav.tokenize("graph TD\nA--").length > 0, true, "the previous table still answers");

console.log("selftest-hint-nav: " + checks + " checks passed (" + raw.length + " bytes of data)");
