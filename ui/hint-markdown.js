// SPDX-License-Identifier: GPL-3.0-or-later
/* MARKDOWN provider (L2) — ADR-10: the syntax guide outside fences.

   The mermaid layer answers inside a ```mermaid body; this one answers in the
   note itself, and it answers the same shape (a tree whose last level is the
   text a chip lands). It owns NO list and NO key: the list half of the engine
   stays with mermaid and the wiki `[[`, so this file only implements `panel`
   (what this place may be) and `panelCommit` (what a chip lands). Everything it
   knows lives in ui/markdown-syntax.js (L0); here is only the wiring.

   The ground is chosen by L0, not by this file: a blank line or the start of a
   line that has no block marker yet. Prose, a fence body, and a line that is
   already a heading/list/quote/table stay quiet — a guide that talks over the
   sentence being written would be noise, not help.

   `panelCommit` inserts at the caret through the host's model `replace`: one
   line, one undo step, the normal dirty flag and save path, exactly like the
   mermaid chips. No DOM, no editor, no vault. */
(function () {
  "use strict";

  const HC = window.HintCore, MD = window.MdHints;
  if (!HC || !MD) return;                    // the engine (and the data) load first; otherwise inert

  HC.register({
    id: "markdown",
    label: "Markdown",
    priority: 5,                             // the widest grammar: asked after mermaid (20) and wiki (10)
    /* No list. The engine asks a provider for a list only if it has all three
       list functions; this one has a panel instead (see register). Keeping the
       three absent is what makes "the guide never opens on typing" structural
       rather than a promise. */
    panel(ctx) {
      if (ctx.fence) return null;            // code body: the fence's own language, never Markdown
      return MD.helpOf(ctx.before, ctx.line.slice(ctx.c), ctx.fence);
    },
    panelCommit(it, ctx, host) {
      if (!it || typeof it.ins !== "string" || !it.ins) return false;
      host.replace({ l: ctx.l, from: ctx.c, to: ctx.c }, it.ins);
      return true;
    },
  });
})();
