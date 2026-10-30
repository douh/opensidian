// SPDX-License-Identifier: GPL-3.0-or-later
/* mermaid syntax hints — the vocabulary a ```mermaid fence may use, plus the
   two pure functions the editor asks on every keystroke (main.js showAc ->
   mmdContext). Written against the vendored build's own grammar: every string
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
   appear. Insertion goes through the editor model either way (Ed.acInsertText),
   so a suggestion is edited like typed text — same undo, same dirty flag. */
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
  const MAX = 10;                                   // the popup is a glance, not a menu

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

  /* Candidates for the caret at `prefix` (the text before it on its line), with
     the body lines `prev` above it. `word`/`from` describe the span the popup
     replaces; `items` are {ins, label, badge}. An empty word at the top of a
     fence lists the diagram types (discovery); an empty word after a directive
     lists that diagram's keywords. */
  function suggest(prev, prefix) {
    const m = WORD.exec(prefix);
    const word = m ? m[0] : "";
    const from = m ? m.index : prefix.length;
    if (/^\s*%%/.test(prefix)) return { word, from, items: [] };    // comment lines get no noise
    const d = typeOf(prev);
    const w = word.toLowerCase();
    let items;
    if (!d) {
      items = TYPES.filter(([id]) => id !== word && id.toLowerCase().startsWith(w))
        .map(([id, arg]) => ({ ins: arg ? id + " " + arg : id, label: id, badge: arg || "" }));
    } else {
      items = (KW[d.key] || []).filter(k => k !== word && k.toLowerCase().startsWith(w))
        .map(k => ({ ins: k, label: k, badge: "" }));
    }
    return { word, from, items: items.slice(0, MAX) };
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

  window.MmdHints = { TYPES, KW, ALIAS, fenceOf, typeOf, suggest, errText };
})();
