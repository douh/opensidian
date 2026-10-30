// SPDX-License-Identifier: GPL-3.0-or-later
/* GENERATOR — turns the vendored mermaid flowchart grammar into the machine
   tables ui/hint-nav.js interprets (ui/hint-nav.json).

   WHY GENERATE, NOT HAND-WRITE: the "what may I type here?" answer for a
   ```mermaid fence is a property of mermaid's own grammar. A hand-written table
   drifts silently; a generated one is diffable and pinned: the JSON carries the
   sha256 of tools/vendor/flow-11.17.2.jison, and tests/hint_nav.rs recomputes it.
   The grammar is upstream (MIT, © 2015 Knut Sveidqvist); the tables are produced
   by jison 0.4.18 (MIT, © 2009-2014 Zachary Carter) at BUILD time only — jison
   is not shipped and the app never runs it.

   WHAT IS EMITTED:
     meta      grammar/version/sha256/licence (the pin)
     parser    LALR table, productions, terminals, symbols, defaultActions
     lex       conditions (which rules are live in each state), one RegExp
               source per rule, and one serialized action per rule
   ACTIONS are PROBED, not parsed out of the source: the compiled lexer exposes
   performAction(), so each rule is executed once against a stub that records
   pushState/popState/more and the returned token id (once with firstGraph()
   true and once false, which is how the four `graph` rules' conditional push is
   detected). That keeps the extractor independent of jison's code style and
   fails loudly on an action form it does not understand.

   USAGE:
     node tools/gen-hint-nav.js                  regenerate ui/hint-nav.json
     node tools/gen-hint-nav.js --check          regenerate in memory, compare
   jison must be resolvable (this repo ships no node_modules), so install it
   OUTSIDE the tree:
     npm i --prefix /tmp/hint-nav-tool jison@0.4.18
     NODE_PATH=/tmp/hint-nav-tool/node_modules node tools/gen-hint-nav.js
   The temp compiled parser is written to os.tmpdir() and removed afterwards.

   The JSON is compact on purpose: ~70 KB, mostly the 291x84 LALR table. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const GRAMMAR = path.join(__dirname, "vendor", "flow-11.17.2.jison");
const OUT = path.join(ROOT, "ui", "hint-nav.json");
const YY_STUB = () => undefined;

function fail(msg) {
  console.error("gen-hint-nav: " + msg);
  process.exit(1);
}

function loadJison() {
  try {
    return require("jison");
  } catch (_) {
    fail("jison is not resolvable. Build-time only, installed outside the tree:\n" +
      "  npm i --prefix /tmp/hint-nav-tool jison@0.4.18\n" +
      "  NODE_PATH=/tmp/hint-nav-tool/node_modules node tools/gen-hint-nav.js");
  }
}

/** Compile the grammar and hand back the generated parser object. */
function compile(grammar) {
  const Jison = loadJison();
  const gen = new Jison.Generator(grammar, { moduleType: "commonjs" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hint-nav-"));
  const file = path.join(dir, "flowParser.js");
  try {
    // generateModuleExpr() returns the bare `(function(){...})();` expression.
    let expr = gen.generateModuleExpr().trim();
    if (expr.endsWith(";")) expr = expr.slice(0, -1);
    fs.writeFileSync(file, "module.exports = " + expr + ";\n");
    return require(file);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

/** Run performAction for rule `i`, recording state changes and the token id. */
function probe(lexer, i) {
  const run = (firstGraph) => {
    const ops = [];
    let ret = 0;
    const stub = {
      conditionStack: ["INITIAL"], yytext: "A", match: "A", matched: "A", yyleng: 1, yylineno: 0, yylloc: {},
      pushState(s) { ops.push(["push", s]); },
      begin(s) { ops.push(["push", s]); },
      popState() { ops.push(["pop"]); },
      more() { ops.push(["more"]); },
      reject() { ops.push(["reject"]); },
      unput() {}, input() {}, less() {}, parseError() {},
      topState() { return "INITIAL"; },
    };
    const yy = {
      lex: { firstGraph: () => firstGraph },
      addVertex: YY_STUB, addLink: YY_STUB, setLink: YY_STUB, setClass: YY_STUB, addClass: YY_STUB,
      setDirection: YY_STUB, setAccTitle: YY_STUB, setAccDescription: YY_STUB, setTooltip: YY_STUB,
      addSubGraph: YY_STUB, updateLink: YY_STUB, updateLinkInterpolate: YY_STUB, setClickEvent: YY_STUB,
      destructLink: () => ({}), getDirection: () => "", getAccTitle: () => "",
      getAccDescription: () => "", getDiagramTitle: () => "",
    };
    const r = lexer.performAction.call(stub, yy, stub, i, "INITIAL");
    ret = typeof r === "string" ? r : (r || 0);
    return { ret, ops };
  };

  const on = run(true);
  const off = run(false);
  if (JSON.stringify(on.ret) !== JSON.stringify(off.ret)) {
    fail("rule " + i + " returns a different token depending on firstGraph() — teach the generator this form");
  }
  if (JSON.stringify(on.ops) !== JSON.stringify(off.ops)) {
    if (on.ops.length !== 1 || on.ops[0][0] !== "push" || off.ops.length !== 0) {
      fail("rule " + i + " has a firstGraph-dependent action the generator does not understand: " + JSON.stringify(on.ops));
    }
    on.ops = [["firstGraph", on.ops[0][1]]];
  }
  for (const op of on.ops) {
    if (op[0] === "reject" || op[0] === "more") fail("rule " + i + " uses " + op[0] + "(), which the runtime does not model");
  }
  return { ret: on.ret, ops: on.ops };
}

function build() {
  const grammar = fs.readFileSync(GRAMMAR, "utf8");
  const sha256 = crypto.createHash("sha256").update(grammar).digest("hex");
  const parser = compile(grammar);

  if (!parser || !parser.lexer || !parser.table) fail("jison produced no parser (lexer/table missing)");

  const conditions = {};
  for (const name of Object.keys(parser.lexer.conditions)) {
    conditions[name] = { rules: parser.lexer.conditions[name].rules.slice() };
  }
  const actions = [];
  for (let i = 0; i < parser.lexer.rules.length; i++) actions.push(probe(parser.lexer, i));

  // String returns are symbol-table lookups in jison's parser (e.g. "TEXT").
  // A rule may still name a token the grammar never mentions: 11.17.2's lexer
  // has a `\|` rule returning the dead `SEP` (no production accepts it, and the
  // `<*>"|"` PIPE rule shadows it in every condition). Such names get no id and
  // the runtime skips them, so record them in meta instead of guessing.
  const dead = [];
  for (const a of actions) {
    if (typeof a.ret === "string" && parser.symbols_[a.ret] === undefined) {
      if (!dead.includes(a.ret)) dead.push(a.ret);
    } else if (typeof a.ret === "number" && a.ret !== 0 && parser.terminals_[a.ret] === undefined) {
      fail("action returns unknown terminal id " + a.ret);
    }
  }

  return {
    meta: {
      grammar: "flow.jison",
      mermaid: "11.17.2",
      jison: "0.4.18",
      sha256,
      license: "MIT",
      generator: "tools/gen-hint-nav.js",
      deadTokens: dead,
    },
    parser: {
      table: parser.table,
      productions: parser.productions_,
      defaultActions: parser.defaultActions,
      terminals: parser.terminals_,
      symbols: parser.symbols_,
    },
    lex: {
      conditions,
      patterns: parser.lexer.rules.map((r) => r.source),
      actions,
    },
  };
}

function main() {
  const data = build();
  const json = JSON.stringify(data) + "\n";
  const check = process.argv.includes("--check");
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;

  if (check) {
    if (have !== json) fail("ui/hint-nav.json is stale — run node tools/gen-hint-nav.js");
    console.log("ui/hint-nav.json is current (" + json.length + " bytes)");
    return;
  }
  fs.writeFileSync(OUT, json);
  const cells = Object.values(data.parser.table).reduce((n, row) => n + Object.keys(row).length, 0);
  console.log("wrote ui/hint-nav.json " + json.length + " bytes | states " + Object.keys(data.parser.table).length +
    " | cells " + cells + " | productions " + data.parser.productions.length +
    " | terminals " + Object.keys(data.parser.terminals).length +
    " | lex rules " + data.lex.patterns.length + " | conditions " + Object.keys(data.lex.conditions).length);
  console.log("grammar sha256 " + data.meta.sha256 + " (mermaid " + data.meta.mermaid + ", jison " + data.meta.jison + ")");
}

main();
