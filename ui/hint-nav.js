// SPDX-License-Identifier: GPL-3.0-or-later
/* MERMAID GRAMMAR NAVIGATION (L0 data + interpreter) — the machine tables behind
   "what may follow here?" inside a ```mermaid flowchart fence.

   Completion used to decide its slots with line heuristics ("is the caret to the
   right of the last arrow column?", "does the word start a statement?"). Those
   are guesses about a grammar that already exists as executable data. The
   vendored 11.17.2 build ships flow.jison; tools/gen-hint-nav.js compiles it once
   with jison 0.4.18 and writes ui/hint-nav.json: the LALR table, the lexer
   conditions, one RegExp per rule and one serialized action per rule. This file
   interprets that data in the webview. It owns no Mermaid knowledge and no UI.

   TWO LAYERS, BOTH NEEDED:
     lexer  decides CHARACTER candidates. After `A--` the next `o`, `x`, `>` or
            `-` completes LINK; any other character starts edge text. The LALR
            table cannot answer that — the lexer already consumed the arrow.
     LALR   decides TOKEN expectations. After `A-->` the table asks for a node
            (NODE_STRING / STR / UNICODE_TEXT) or an edge label (PIPE).

   WHAT IT DELIBERATELY IS NOT:
     - it never builds a diagram: yy semantics are not run, and yytext VALUES are
       not used (two actions rewrite yytext; nav ignores values, never text).
     - it never throws at a caller: tokenize/drive answer with a verdict.
     - no DOM, no app globals, no eval/new Function (the CSP forbids eval).

   API (window.HintNav):
     load(data|json)      install ui/hint-nav.json; false when malformed
     ready()              data installed?
     meta()               pinned {mermaid, jison, sha256, license}
     tokenize(text)       [{id, name, text, cond}], plus .cond and .stack
     drive(tokens, opts)  { verdict: accept|prefix|error|dead|lexerror, state, expected }
     at(prefix)           NavState for a caret ending `prefix`:
                          {lex:{top,stack}, state, expected, complete, verdict}
     chars(prefix)        next-character classes: {link, text, push, bad, all}

   `prefix` must start at the fence body (not at the caret line): the lexer's
   condition stack (`graph` opens `dir`, `--` opens `edgeText`) and mermaid's
   firstGraph() make the state path-dependent.

   Regenerate after a mermaid bump: node tools/gen-hint-nav.js, then
   node tools/selftest-hint-nav.js. tests/hint_nav.rs pins the grammar sha256, so
   hand-editing the JSON fails the suite instead of teaching wrong syntax. */
(function () {
  "use strict";

  const END = 1;                       // jison's end-of-input marker
  const MAX_TOKENS = 4096;             // budget: a fence, not a novel
  const MAX_STEPS = 8192;
  const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

  let D = null;                        // ui/hint-nav.json, installed by load()
  let RULES = null;                    // compiled RegExp per rule
  let ERROR_ID = 2;                    // jison's error symbol
  let EOF_ID = 0;                      // the grammar's <<EOF>> terminal, if any

  /* ---------- install ---------- */
  function load(data) {
    let d = data;
    if (typeof d === "string") {
      try { d = JSON.parse(d); } catch (_) { return false; }
    }
    if (!d || !d.parser || !d.lex || !d.meta) return false;
    const p = d.parser, l = d.lex;
    if (!p.table || !p.productions || !p.terminals || !p.symbols) return false;
    if (!Array.isArray(l.patterns) || !Array.isArray(l.actions) || !l.conditions) return false;
    let rules;
    try {
      rules = l.patterns.map((src) => new RegExp(src));
    } catch (_) {
      return false;                    // a corrupt table must not poison the pane
    }
    for (const name of Object.keys(l.conditions)) {
      for (const i of l.conditions[name].rules) if (!rules[i]) return false;
    }
    if (!l.actions.length || l.actions.length !== rules.length) return false;

    D = d;
    RULES = rules;
    ERROR_ID = typeof p.symbols.error === "number" ? p.symbols.error : 2;
    EOF_ID = typeof p.symbols.EOF === "number" ? p.symbols.EOF : 0;
    CACHE.clear();
    return true;
  }

  function ready() { return !!D; }
  function meta() { return D ? D.meta : null; }

  function idOf(name) {
    const id = D.parser.symbols[name];
    return typeof id === "number" ? id : 0;
  }
  function nameOf(id) {
    return D.parser.terminals[id] || String(id);
  }

  /* ---------- lexer: jison-lex semantics over the generated data ----------
     First matching rule wins (jison flex is off), rules are anchored (`^`),
     a rule that returns no token is skipped, and `done` is sticky — the EOF
     rule matches once on empty input, the next call returns END. */
  function makeLexer(text) {
    const lx = {
      input: String(text),
      cond: ["INITIAL"],
      stack: null,
      done: false,
      firstGraph: false,
      yytext: "",
      lexerror: "",
      top() { return this.cond[this.cond.length - 1]; },
      pushState(s) { this.cond.push(s); },
      popState() { const n = this.cond.length - 1; return n > 0 ? this.cond.pop() : this.cond[0]; },
      next() {
        if (this.done) return END;
        if (!this.input) this.done = true;
        this.yytext = "";
        const rules = D.lex.conditions[this.top()].rules;
        let m = null, ri = -1;
        for (let k = 0; k < rules.length; k++) {
          const x = RULES[rules[k]].exec(this.input);
          if (x && x.index === 0) { m = x; ri = rules[k]; break; }
        }
        if (!m) {
          if (this.input === "") return END;
          this.lexerror = this.input.slice(0, 12);
          return 0;
        }
        const a = D.lex.actions[ri];
        this.yytext = m[0];
        this.input = this.input.slice(m[0].length);
        for (let k = 0; k < a.ops.length; k++) {
          const op = a.ops[k];
          if (op[0] === "pop") this.popState();
          else if (op[0] === "push") this.pushState(op[1]);
          else if (op[0] === "firstGraph") {
            if (!this.firstGraph) { this.firstGraph = true; this.pushState(op[1]); }
          }
        }
        let ret = a.ret;
        // A name absent from the grammar (11.17.2's dead SEP/QUOTE, listed in
        // meta.deadTokens) has no id: 0 means "no token", the same path jison
        // takes for a rule that only changes state.
        if (typeof ret === "string") ret = idOf(ret);
        return ret || 0;
      },
      lex() {
        // jison's lex() skips rules that return no token, but a character no
        // rule matches is an error — without the flag this loop would spin on
        // the same unmatched input forever.
        let tok = this.next();
        while (tok === 0) {
          if (this.lexerror) return 0;
          tok = this.next();
        }
        return tok;
      },
    };
    return lx;
  }

  /** tokens = [{id,name,text,cond}]; the array also carries .cond and .stack. */
  function tokenize(text) {
    if (!D) return [];
    const lx = makeLexer(text);
    const out = [];
    for (let guard = 0; guard < MAX_TOKENS; guard++) {
      const r = lx.lex();
      if (r === END) break;
      if (r === 0) { out.push({ id: 0, name: "LEX_ERROR", text: lx.lexerror || "", cond: lx.top() }); break; }
      out.push({ id: r, name: nameOf(r), text: lx.yytext, cond: lx.top() });
    }
    out.cond = lx.top();
    out.stack = lx.cond.slice();
    if (lx.lexerror) out.lexerror = lx.lexerror;
    return out;
  }

  /* ---------- LALR driver ---------- */
  function expectedOf(state) {
    const row = D.parser.table[state] || {};
    const out = [];
    for (const key of Object.keys(row)) {
      const id = Number(key);
      if (D.parser.terminals[id] && id > ERROR_ID) out.push(D.parser.terminals[id]);
    }
    return out.sort();
  }

  function drive(tokens, opts) {
    if (!D) return { verdict: "dead" };
    const keepEof = !!(opts && opts.keepEof);
    const all = tokens || [];
    for (let i = 0; i < all.length; i++) if (all[i].id === 0) return { verdict: "lexerror", at: i };
    const stack = [0];
    let idx = 0, steps = 0, eofRead = false;
    const toks = all.filter((t) => t.id !== END && (keepEof || t.id !== EOF_ID));
    while (true) {
      if (++steps > MAX_STEPS) return { verdict: "error", reason: "budget" };
      const state = stack[stack.length - 1];
      let sym;
      if (idx < toks.length) sym = toks[idx].id;
      else if (keepEof && !eofRead) sym = END;   // the final reduce chain reads the marker again
      else {
        const expected = expectedOf(state);
        return expected.length ? { verdict: "prefix", state, expected } : { verdict: "dead", state };
      }
      const action = D.parser.table[state] && D.parser.table[state][sym];
      if (action === undefined) {
        if (sym === END) return { verdict: "error", state, at: "eof", expected: expectedOf(state) };
        return { verdict: "error", state, at: idx, got: toks[idx] && toks[idx].name, expected: expectedOf(state) };
      }
      if (Array.isArray(action) && Array.isArray(action[0])) return { verdict: "error", state, reason: "conflict" };
      const kind = Array.isArray(action) ? action[0] : 1;   // a bare number is a goto
      if (kind === 1) {
        stack.push(sym);
        stack.push(Array.isArray(action) ? action[1] : action);
        if (sym === END) eofRead = true;
        else idx++;
        continue;
      }
      if (kind === 2) {
        const prod = D.parser.productions[action[1]];
        if (!prod) return { verdict: "error", reason: "bad-production", index: action[1] };
        const lhs = prod[0], len = prod[1];
        stack.length -= 2 * len;
        const top = stack[stack.length - 1];
        const goto = D.parser.table[top] && D.parser.table[top][lhs];
        if (typeof goto !== "number") return { verdict: "error", reason: "bad-goto", lhs };
        stack.push(lhs);
        stack.push(goto);
        continue;
      }
      if (kind === 3) return { verdict: "accept" };
      return { verdict: "error", reason: "unknown-action" };
    }
  }

  /* ---------- one answer per caret ---------- */
  /** NavState for a caret that ends `prefix`; null without data. */
  function at(prefix) {
    if (!D) return null;
    const toks = tokenize(prefix);
    const d = drive(toks);
    const eof = drive(toks, { keepEof: true });
    return {
      source: D.meta,
      lex: { top: toks.cond, stack: toks.stack },
      state: d.state,
      expected: d.expected || [],
      complete: eof.verdict === "accept",
      verdict: toks.lexerror ? "lexerror" : d.verdict,
    };
  }

  /* ---------- next-character classes (cached) ----------
     Only meaningful where the caret sits at a token boundary (the editor asks
     it for the `A--` arrow slot). Each probe re-tokenizes prefix+char and keeps
     the first token id that the bare prefix did not already have: a LINK
     completion, an edge-text character, or — when no token appears and the
     condition moved — a silent state change (a quote opens `string`).

     Identity is token id only. yytext is a value nav never reads, and a
     character absorbed into the current token (the trailing space of `A--> `,
     the `>` of `A--o>`) must not be reported as a candidate; per-token
     conditions are not identity either, or a silent push would read as an EOF
     "token". Deciding by id keeps `A--` + `"` in `push` and `A--` + `a` in
     `text`. */
  const CACHE = new Map();
  const CACHE_MAX = 24;

  function sameToken(a, b) {
    return a && b && a.id === b.id;
  }

  function chars(prefix) {
    if (!D) return null;
    prefix = String(prefix);
    if (CACHE.has(prefix)) {
      const hit = CACHE.get(prefix);
      CACHE.delete(prefix);
      CACHE.set(prefix, hit);                       // LRU touch
      return hit;
    }
    const base = tokenize(prefix);                 // keeps .cond/.stack
    const baseCond = base.cond;
    const out = { link: [], text: [], push: {}, bad: [], all: {} };
    for (const ch of CHARS) {
      const toks = tokenize(prefix + ch);
      const head = toks;
      let diff = null;
      for (let i = 0; i < Math.max(base.length, head.length); i++) {
        if (!sameToken(base[i], head[i])) { diff = head[i] || null; break; }
      }
      const d = drive(toks);
      if (!diff) {
        if (toks.cond !== baseCond) out.push[ch] = toks.cond;
        else out.all[ch] = "NO_TOKEN";
        continue;
      }
      out.all[ch] = diff.name;
      if (diff.name === "LEX_ERROR" || d.verdict === "error" || d.verdict === "dead") { out.bad.push(ch); continue; }
      if (diff.name === "LINK") out.link.push(ch);
      else if (diff.name === "EDGE_TEXT") out.text.push(ch);
    }
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(prefix, out);
    return out;
  }

  window.HintNav = {
    load,
    ready,
    meta,
    tokenize,
    drive,
    at,
    chars,
  };
})();
