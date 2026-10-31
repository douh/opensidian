// SPDX-License-Identifier: GPL-3.0-or-later
/* MERMAID provider (L2) — the ```mermaid half of the hint engine.

   Everything it knows lives in ui/mermaid-syntax.js (L0): the vocabulary of the
   vendored 11.17.2 build, the fence walker the renderer also uses, and the
   "may a statement begin here?" policy. This file only answers the engine's
   three questions for that vocabulary:

     match    the caret is in a mermaid fence body, on a WORD, at the start of
              a statement. A node label (`A[Start`), edge text (`|open|`), a
              title or the ``` lines themselves are prose here, and prose gets
              no popup.
     trigger  the keystroke that typed that word character. A space, a bracket
              or a return ends the word — `match` stops holding, and the engine
              closes the list before the next key.
     offer    `M.suggest` on the fence body above the caret; the span it
              replaces is the word's columns on THIS line (line-anchored, the
              way the model inserts: one line, one undo step).
     commit   that span, through the host's model `replace` — never a DOM edit.

   It never sees a view, a pane or the vault: it is handed a context and a
   host, and returns candidates. */
(function () {
  "use strict";

  const HC = window.HintCore, M = window.MmdHints;
  if (!HC || !M) return;                    // the engine (and the vocabulary) load first; otherwise inert

  HC.register({
    id: "mermaid",
    label: "Mermaid",
    priority: 20,                           // the narrow grammar: asked before a wider one
    match(ctx) {
      const f = ctx.fence;
      if (!f || f.lang !== "mermaid") return false;
      const n = ctx.l + 1;                  // M.fenceOf counts lines from 1
      if (n <= f.start || (!f.unclosed && n >= f.end)) return false;   // the ``` lines stay quiet
      const w = M.wordAt(ctx.before);
      if (!w) return false;                 // the caret sits on whitespace: the word has ended
      return M.statementStart(ctx.before.slice(0, w.from));
    },
    trigger(typed) { return M.wordChar(typed); },
    /* ADR-8: the passive syntax layer. It answers for the whole fence body
       rather than for the word under the caret, and it is available wherever
       that caret is INSIDE the body — the ``` lines stay quiet, because a
       directive inserted on a fence line would edit the fence itself. */
    panel(ctx) {
      const f = ctx.fence;
      if (!f || f.lang !== "mermaid") return null;
      const n = ctx.l + 1;                  // M.fenceOf counts lines from 1
      if (n <= f.start || (!f.unclosed && n >= f.end)) return null;
      return M.helpOf(ctx.lines.slice(f.start, ctx.l), ctx.before);
    },
    offer(ctx) {
      const f = ctx.fence, w = M.wordAt(ctx.before);
      if (!f || !w) return null;
      const sug = M.suggest(ctx.lines.slice(f.start, ctx.l), ctx.before);   // body above the caret
      return { items: sug.items, range: { l: ctx.l, from: ctx.c - w.word.length, to: ctx.c } };
    },
    commit(it, ctx, host) { host.replace(ctx.range, it.ins); },
  });
})();
