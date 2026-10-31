// SPDX-License-Identifier: GPL-3.0-or-later
/* mermaid syntax hints — the vocabulary a ```mermaid fence may use, plus the
   pure functions the hint engine's mermaid provider
   (ui/hint-mermaid.js) asks on every keystroke. Written against the vendored
   build's own grammar: every string
   between the HINTS markers below is asserted to occur in
   ui/vendor/mermaid/mermaid.min.js (src-tauri/tests/mermaid_hints.rs), so a
   typo, an invented keyword or a vocabulary drift fails the suite instead of
   teaching a user syntax that Mermaid rejects.

   `zenuml` is deliberately absent: the vendored 11.17.2 parse graph carries no
   zenuml parser, so offering it would be a promise the bytes cannot keep.
   ER cardinalities (`||--o{`, `}o--||`) are absent too — the minified lexer
   assembles those from fragments, so there is no literal to verify them
   against, and an unverifiable suggestion is exactly what this file refuses.

   Completion is LOCAL on purpose: it knows where the caret is inside the fence,
   which directive opened it and the word being typed. It never rewrites a line
   and never inserts more than that word (plus a direction for flowchart): the
   editor groups one typing burst into one undo step, so a completion that
   expanded into a template would make one Ctrl+Z undo lines nobody watched
   appear. Insertion goes through the host's `replace` (the editor model) either
   way, so a suggestion is edited like typed text — same undo, same dirty flag.

   This file is L0: data and pure functions, no caret, no view. The provider
   (ui/hint-mermaid.js) decides WHEN these answers are asked. */
(function () {
  "use strict";

  /* HINTS-BEGIN — data only; every quoted string here is a vocabulary claim. */
  const TYPES = [                 // [directive, optional direction] — insertion order = display order
    ["flowchart", "TD"], ["sequenceDiagram", ""], ["classDiagram", ""],
    ["stateDiagram-v2", ""], ["erDiagram", ""], ["gantt", ""], ["pie", ""],
    ["mindmap", ""], ["timeline", ""], ["journey", ""], ["gitGraph", ""],
    ["quadrantChart", ""], ["requirementDiagram", ""],
    ["C4Context", ""], ["C4Container", ""], ["C4Component", ""], ["C4Dynamic", ""], ["C4Deployment", ""],
    ["sankey-beta", ""], ["xychart-beta", ""], ["block-beta", ""], ["packet-beta", ""],
    ["kanban", ""], ["architecture-beta", ""], ["radar-beta", ""], ["treemap-beta", ""],
  ];
  const KW = {
    flowchart: ["subgraph", "end", "-->", "-.->", "---", "direction", "style", "classDef", "class", "click",
      "linkStyle", "href"],
    sequence: ["participant", "actor", "activate", "deactivate", "note", "loop", "alt", "else", "opt", "par",
      "and", "critical", "break", "rect", "box", "autonumber", "create", "destroy"],
    class: ["class", "namespace", "callback", "link", "cssClass", "style", "direction"],
    state: ["state", "direction", "note", "classDef", "class"],
    er: ["PK", "FK", "UK"],
    gantt: ["title", "dateFormat", "axisFormat", "tickInterval", "excludes", "todayMarker", "section", "task",
      "done", "active", "crit", "milestone", "after", "until"],
    pie: ["title", "showData", "textPosition"],
    journey: ["title", "section", "task"],
    git: ["commit", "branch", "checkout", "merge", "cherry-pick", "tag", "id", "type"],
    mindmap: ["::icon", ":::class"],
    timeline: ["title", "section"],
    quadrant: ["title", "x-axis", "y-axis", "quadrant-1", "quadrant-2", "quadrant-3", "quadrant-4", "point"],
    requirement: ["requirement", "functionalRequirement", "performanceRequirement", "interfaceRequirement",
      "physicalRequirement", "designConstraint", "element", "id", "text", "risk", "verifyMethod"],
    c4: ["Person", "System", "System_Boundary", "Container", "Container_Boundary", "Component", "Rel",
      "Rel_Back", "BiRel"],
    xychart: ["title", "x-axis", "y-axis", "bar", "line"],
    block: ["columns", "block", "space"],
    packet: ["title", "end"],
    architecture: ["service", "group", "junction", "in", "out"],
    radar: ["axis", "curve", "max", "min", "showLegend"],
  };
  const ALIAS = {                 // directive -> keyword table; `graph` is flowchart's legacy name
    graph: "flowchart", "stateDiagram-v2": "state", stateDiagram: "state",
    sequenceDiagram: "sequence", classDiagram: "class", "classDiagram-v2": "class",
    erDiagram: "er", gitGraph: "git", quadrantChart: "quadrant",
    requirementDiagram: "requirement",
    C4Context: "c4", C4Container: "c4", C4Component: "c4", C4Dynamic: "c4", C4Deployment: "c4",
    "xychart-beta": "xychart", "block-beta": "block", "packet-beta": "packet",
    "architecture-beta": "architecture", "radar-beta": "radar",
    "sankey-beta": "sankey", "treemap-beta": "treemap", treemap: "treemap",
  };
  /* HINTS-END */

  const FIRST = /^\s*([A-Za-z][A-Za-z0-9-]*)/;      // the directive word of a body line
  const WORD = /[A-Za-z][A-Za-z0-9-]*$/;            // the word under the caret
  const CHAR = /[A-Za-z0-9_-]/;                     // a character that extends a word
  const MAX = 10;                                   // the popup is a glance, not a menu

  /* INPUT-FLOW policy, pure so it can be asserted: a hint appears only while
     the user TYPES a word (main.js asks with the last doc change), and only
     where a Mermaid statement can begin — the line start after indentation.
     Everything else (node labels `A[Start`, edge labels `|open|`, titles, a
     `[[` fragment) is prose, and prose gets no popup. */
  function wordChar(ch) { return typeof ch === "string" && ch.length === 1 && CHAR.test(ch); }
  function statementStart(before) { return /^[ \t]*$/.test(String(before == null ? "" : before)); }

  /* The fence around `line`, or null. Delegates the grammar to Ed.fenceAt
     (editor.js) — the SAME function the live-preview blocks and the tests use,
     so a fence the renderer treats as a block can never be a fence the
     completer does not see. Walks one fence at a time (`i = end + 1`), so the
     cost is the number of fences above the caret, not the number of lines. */
  function fenceOf(doc, line, hi) {
    if (typeof Ed === "undefined" || !Ed.fenceAt) return null;
    let i = 1;
    while (i <= hi && i <= line) {
      const f = Ed.fenceAt(doc, i, hi);
      if (!f) { i++; continue; }
      if (line <= f.e) return { start: i, end: f.e, lang: f.lang, unclosed: !!f.open };
      i = f.e + 1;
    }
    return null;
  }

  /* Which diagram is being written: the first body line that is neither blank
     nor a `%%` comment. Returns { id, key } — `id` as typed (so a hint can say
     what the fence says), `key` the keyword table ("flowchart" for `graph`). */
  function typeOf(prev) {
    for (const l of prev) {
      const t = l.trim();
      if (!t || t.startsWith("%%")) continue;
      const m = FIRST.exec(t);
      if (!m) return null;
      const id = m[1];
      return { id, key: ALIAS[id] || id };
    }
    return null;
  }

  /* The word abutting the caret, with the column it starts at — the span a
     picked candidate replaces. `null` when the caret sits on whitespace, which
     is how "the word ended" reaches the provider's `match`. */
  function wordAt(prefix) {
    const m = WORD.exec(String(prefix == null ? "" : prefix));
    return m ? { word: m[0], from: m.index } : null;
  }

  /* Candidates for the caret at `prefix` (the text before it on its line), with
     the body lines `prev` above it. `word`/`from` describe the span the popup
     replaces; `items` are {ins, label, badge}. An empty word at the top of a
     fence lists the diagram types (discovery); an empty word after a directive
     lists that diagram's keywords. */
  function suggest(prev, prefix) {
    const w = wordAt(prefix);
    const word = w ? w.word : "";
    const from = w ? w.from : String(prefix == null ? "" : prefix).length;
    if (/^\s*%%/.test(prefix)) return { word, from, items: [] };    // comment lines get no noise
    const d = typeOf(prev);
    const q = word.toLowerCase();
    let items;
    if (!d) {
      items = TYPES.filter(([id]) => id !== word && id.toLowerCase().startsWith(q))
        .map(([id, arg]) => ({ ins: arg ? id + " " + arg : id, label: id, badge: arg || "" }));
    } else {
      items = (KW[d.key] || []).filter(k => k !== word && k.toLowerCase().startsWith(q))
        .map(k => ({ ins: k, label: k, badge: "" }));
    }
    return { word, from, items: items.slice(0, MAX) };
  }

  /* ---------- ADR-8 / ADR-9: the context layer ----------
     A caret inside a fence gets a panel that is a TREE, not one flat row: which
     diagram this is, what kind of place the caret stands in (level 2), what
     kind of statement may begin there (level 3), and the words for it (level 4).

     Level 3/4 for `flowchart` come from the grammar itself: ui/hint-nav.json
     holds the lexer + LALR tables the vendored build ships (compiled by
     tools/gen-hint-nav.js), so the answer at the caret is "the grammar expects
     LINK / subgraph / direction_lr HERE", not a guess from the keyword list.
     The data is passed in as `nav` (the provider hands window.HintNav over) —
     this file stays free of app globals and the self test can drive the mapping
     with a fake. Without the tables, or for every other diagram, the verified
     keyword list is grouped into statements / blocks / directives.

     The items are ALWAYS drawn from TYPES, KW or the grammar's own terminals —
     the same strings tests/mermaid_hints.rs checks against the vendored bundle
     — so the panel cannot teach a word Mermaid rejects. `place` and section
     names are i18n keys (ui/i18n.js holds the translations); nothing here
     knows about a language. */
  const OPENERS = {                 // typeKey -> what opens a nested body, and what closes it
    flowchart: { open: /^subgraph\b/, close: /^end\b/ },
    sequence: { open: /^(?:loop|alt|opt|par|critical|break|rect|box)\b/, close: /^end\b/ },
    class: { open: /\{\s*$/, close: /^\}\s*$/ },
    state: { open: /\{\s*$/, close: /^\}\s*$/ },
    er: { open: /\{\s*$/, close: /^\}\s*$/ },
  };
  /* `end` closes a block, `else`/`and` switch one, so they are offered only
     INSIDE one — at the top level they are a syntax error. */
  const INNER = ["end", "else", "and"];

  /* Brace/unbalanced nesting of the block that encloses the caret, counted over
     the body above it (the caret's own line cannot close or open it). */
  function depthOf(key, prev) {
    const b = OPENERS[key];
    if (!b) return 0;
    let d = 0;
    for (const raw of prev) {
      const t = raw.trim();
      if (b.close.test(t)) d = Math.max(0, d - 1);
      else if (b.open.test(t)) d++;
    }
    return d;
  }

  /* {type, place, sections, items} for a caret ending `prefix`, with the body
     above it. Empty of a directive => the whole type list (that IS the
     newcomer's first question). `type` is the directive as typed (`graph` stays
     `graph`). `items` is the flat union of the sections (census, tests). */

  /* Level 3: the kind of statement. The heading of a group is an i18n key. */
  const SECTION = {
    stmt: "Statements", block: "Blocks", dir: "Directives",
    arrow: "Arrow style", node: "Nodes", shape: "Shapes",
    edge: "Links", label: "Edge labels",
  };
  /* Keywords that read like a setting rather than a statement. `class` is a
     statement in classDiagram and a style directive in flowchart, so the two
     diagrams that disagree get an override instead of a wrong caption. */
  const DIRECTIVE = /^(?:direction|style|classDef|class|click|linkStyle|href|cssClass|namespace|callback|link|title|dateFormat|axisFormat|tickInterval|excludes|todayMarker|showData|textPosition|autonumber|accTitle|accDescr|::)/;
  const SEC_OVERRIDE = { class: { class: "stmt", namespace: "stmt", callback: "stmt", link: "stmt" } };

  function secOf(key, k) {
    const o = SEC_OVERRIDE[key];
    if (o && o[k]) return o[k];
    if (INNER.indexOf(k) >= 0) return "block";
    return DIRECTIVE.test(k) ? "dir" : "stmt";
  }

  /* The verified keyword table, grouped. `end`/`else`/`and` are a syntax error
     at the top level, so they are offered only inside a block. */
  function kwSections(key, depth) {
    const bags = { stmt: [], block: [], dir: [] };
    for (const k of (KW[key] || [])) {
      if (depth === 0 && INNER.indexOf(k) >= 0) continue;
      bags[secOf(key, k)].push({ ins: k, label: k });
    }
    const out = [];
    for (const id of ["stmt", "block", "dir"])
      if (bags[id].length) out.push({ name: SECTION[id], items: bags[id] });
    return out;
  }

  /* The grammar's terminals, said in a user's words. Flowchart only: that is
     the one diagram whose tables are shipped. `ins` is the text a tap lands
     (null = the token is prose, shown but not tappable). */
  const NAVTOK = {
    NODE_STRING: ["node", "B", "B"],
    UNICODE_TEXT: ["node", "B", "B"],
    NUM: ["node", "B", "B"],
    AMP: ["node", "&", "&"],
    BRKT: ["shape", "[", "[ … ]"],
    PS: ["shape", "(", "( … )"],
    SQS: ["shape", "[", "[ … ]"],
    CYLINDERSTART: ["shape", "[(", "[("],
    DOUBLECIRCLESTART: ["shape", "((", "(("],
    DIAMOND_START: ["shape", "{", "{ … }"],
    STADIUMSTART: ["shape", "([", "(["],
    SUBROUTINESTART: ["shape", "[[", "[["],
    TRAPSTART: ["shape", "[/", "[/"],
    INVTRAPSTART: ["shape", "[\\", "[\\"],
    LINK: ["edge", "-->", "-->"],
    MINUS: ["edge", "--", "--"],
    MULT: ["edge", "==", "=="],
    START_LINK: ["edge", "--", "--"],
    PIPE: ["label", "|text|", "|text|"],
    subgraph: ["block", "subgraph", "subgraph"],
    end: ["block", "end", "end"],
    STYLE: ["dir", "style", "style"],
    CLASSDEF: ["dir", "classDef", "classDef"],
    CLICK: ["dir", "click", "click"],
    LINKSTYLE: ["dir", "linkStyle", "linkStyle"],
    direction_lr: ["dir", "direction LR", "direction LR"],
    direction_tb: ["dir", "direction TB", "direction TB"],
    direction_bt: ["dir", "direction BT", "direction BT"],
    direction_rl: ["dir", "direction RL", "direction RL"],
    direction_td: ["dir", "direction TD", "direction TD"],
  };

  /* The grammar's answer for the caret, as sections. `at` says which terminals
     the parser expects; `chars` says which CHARACTERS still complete the
     arrow being typed (`A--` + o/x/>/-), which the table alone cannot answer
     because the lexer already swallowed the arrow. Returns the sections, `false`
     when the caret is inside PROSE — a node's label (`A[…`), a link's label
     (`|…|`) or free edge text (`A -- te|xt`), where the user writes words and a
     token list would only be pasted into a sentence — or null when there is
     nothing useful (the type chooser's job, a dead prefix, a token nobody can
     name), which lets the caller fall back to the keyword groups. */
  function navSections(prev, prefix, nav) {
    if (!nav || typeof nav.at !== "function") return null;
    const pre = (prev.length ? prev.join("\n") + "\n" : "") + prefix;
    let a = null, c = null;
    try { a = nav.at(pre); } catch (_) { return null; }
    try { c = typeof nav.chars === "function" ? nav.chars(pre) : null; } catch (_) { c = null; }
    if (!a || a.verdict !== "prefix") return null;
    const cond = a.lex && a.lex.top;
    if (cond === "text") return false;                       // a label being typed: prose
    const bags = {};
    const push = (sec, ins, label) => {
      const b = bags[sec] || (bags[sec] = []);
      if (!b.some(x => x.ins === ins)) b.push({ ins, label });
    };
    if (c && Array.isArray(c.link))
      for (const ch of c.link) push("arrow", ch, "--" + ch);
    const edgeText = cond === "edgeText";                 // after `A--`: arrow characters only
    if (edgeText && !(bags.arrow && bags.arrow.length)) return false;   // free edge text: prose
    if (!edgeText)
      for (const t of (a.expected || [])) {
        const m = NAVTOK[t];
        if (m) push(m[0], m[1], m[2]);
      }
    const out = [];
    for (const id of ["arrow", "node", "shape", "edge", "label", "block", "dir"])
      if (bags[id] && bags[id].length) out.push({ name: SECTION[id], items: bags[id] });
    return out.length ? out : null;
  }

  function helpOf(prev, prefix, nav) {
    const p = String(prefix == null ? "" : prefix);
    if (/^\s*%%/.test(p)) return null;                     // a comment line stays quiet
    let d = typeOf(prev);
    if (!d || !KW[d.key]) d = typeOf([p.replace(/^\s+/, "")]);
    if (!d || !KW[d.key]) {
      // no `place`: the heading already says "Choose a diagram type", and a
      // second line repeating it only ate a chip row (measured 2026-10-31)
      const items = TYPES.map(([id, arg]) => ({ ins: arg ? id + " " + arg : id, label: id, badge: arg || "" }));
      return { type: "", place: "", sections: [{ name: "", items }], items };
    }
    const depth = depthOf(d.key, prev);
    let sections = d.key === "flowchart" ? navSections(prev, p, nav) : null;
    if (sections === false) return null;                   // prose: the layer has nothing to say
    if (!sections) sections = kwSections(d.key, depth);
    const items = [];
    for (const s of sections)
      for (const it of s.items) if (!items.some(x => x.ins === it.ins)) items.push(it);
    return { type: d.id, place: depth > 0 ? "Inside a block" : "Top-level statement", sections, items };
  }

  /* Does this item attach to the word before it (`A` + `-->`), or does it need
     a space (`A` + `direction LR`)? A tap at the caret uses this, so a chip
     never fuses two words into one node. */
  const ATTACH = /^[-=~<>&|:;,.)\]}]/;
  function joins(ins) { return !ATTACH.test(String(ins == null ? "" : ins)); }

  /* Mermaid's parse failure as ONE copyable line. The error object differs
     between diagrams (jison errors carry `.str` and `.hash.loc`, throw-errors
     carry `.message`), so every shape we have seen is read defensively; the
     line number is only claimed when the parser gave one. Plain text — the
     caller puts it in a textContent node, never innerHTML. */
  function errText(e) {
    let raw = "";
    try {
      raw = String((e && (e.str || e.message)) || e || "");
    } catch (_) { raw = ""; }
    /* jison's `str` is "Parse error on line N:" followed by the elided snippet
       ("...") and the useful tail ("Expecting 'X'"). Prefixes and the elision
       are noise, so each line is cleaned and the first line that survives wins —
       which is the tail, not the boilerplate. The line number comes from
       `.hash.loc` when the parser gave one, and is never invented when it did
       not; mermaid's own "on line 3" is not repeated. */
    const lines = raw.split("\n").map(clean).filter(Boolean);
    let msg = lines[0] || "parse error";
    const loc = e && e.hash && e.hash.loc;
    if (loc && loc.first_line && !/line \d+/i.test(msg)) msg = "line " + loc.first_line + ": " + msg;
    return msg.length > 160 ? msg.slice(0, 157) + "…" : msg;
  }

  function clean(s) {
    return s.trim()
      .replace(/^parse ?error\s*/i, "")
      .replace(/^on line \d+\s*:?\s*/i, "")
      .replace(/^error\s*:?\s*/i, "")
      .replace(/^:\s*/, "")
      .replace(/^\.{3}\s*/, "")                       // jison elides the head of the offending line
      .trim();
  }

  window.MmdHints = { TYPES, KW, ALIAS, wordChar, statementStart, wordAt, fenceOf, typeOf, suggest,
                      helpOf, joins, SECTION, NAVTOK, errText };
})();
