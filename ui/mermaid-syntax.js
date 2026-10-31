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

  /* ---------- ADR-8: the context layer ----------
     A caret inside a fence gets a PASSIVE panel: which diagram this is, what
     kind of place the caret stands in, and the words that are legal there. It
     never inserts (that is the list's job, and the list is key-driven), so the
     panel may appear where prose lives (a node label, an edge caption) without
     rewriting anything.

     The items are ALWAYS drawn from TYPES or KW — the same strings
     tests/mermaid_hints.rs checks against the vendored bundle — so the panel
     cannot teach a word Mermaid rejects. `place` is an i18n key (ui/i18n.js
     holds the translation); nothing here knows about a language. */
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

  /* {type, place, items} for a caret ending `prefix`, with the body above it.
     Empty of a directive => the whole type list (that IS the newcomer's first
     question). `type` is the directive as typed (`graph` stays `graph`). */
  function helpOf(prev, prefix) {
    const p = String(prefix == null ? "" : prefix);
    if (/^\s*%%/.test(p)) return null;                     // a comment line stays quiet
    let d = typeOf(prev);
    if (!d || !KW[d.key]) d = typeOf([p.replace(/^\s+/, "")]);
    if (!d || !KW[d.key]) {
      // no `place`: the heading already says "Choose a diagram type", and a
      // second line repeating it only ate a chip row (measured 2026-10-31)
      return { type: "", place: "",
               items: TYPES.map(([id, arg]) => ({ ins: arg ? id + " " + arg : id, label: id, badge: arg || "" })) };
    }
    const depth = depthOf(d.key, prev);
    const items = (KW[d.key] || [])
      .filter(k => depth > 0 || INNER.indexOf(k) < 0)
      .map(k => ({ ins: k, label: k, badge: "" }));
    return { type: d.id, place: depth > 0 ? "Inside a block" : "Top-level statement", items };
  }

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

  window.MmdHints = { TYPES, KW, ALIAS, wordChar, statementStart, wordAt, fenceOf, typeOf, suggest, helpOf, errText };
})();
