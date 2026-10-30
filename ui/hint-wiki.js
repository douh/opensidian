// SPDX-License-Identifier: GPL-3.0-or-later
/* WIKI-LINK provider (L2) — the `[[` half of the hint engine: note names,
   `[[note#` headings, `[[note#^` block ids. It replaces the bespoke showAc
   state that lived in main.js until the engine arrived; the behaviour is the
   same (R10.4) and the pitfalls it learned are kept:

     - the fragment is read from the caret LEFT, on ONE line, and a `]]`
       before the caret means the link is closed — no list,
     - the replacement span starts at the `[[` and ends at the caret, so a pick
       yields `[[name]]` (or `[[note#heading]]` / `[[note#^id]]`),
     - `[[#` targets the CURRENT note, `[[note#` another one, whose bytes come
       from the host (a round trip, hence the thenable: the engine's generation
       token drops an answer the caret has outrun),
     - it speaks ONLY the host interface: notes/current/readNote/heads/rank/
       replace. No editor, no vault, no view. */
(function () {
  "use strict";

  const HC = window.HintCore;
  if (!HC) return;
  const MAX = 8;                            // a glance, not a menu

  /* The unclosed fragment left of the caret, or null. */
  function fragOf(ctx) {
    const a = ctx.before.lastIndexOf("[[");
    if (a < 0) return null;
    const q = ctx.before.slice(a + 2);
    return q.indexOf("]]") >= 0 ? null : { start: a, q };
  }

  HC.register({
    id: "wiki",
    label: "Link",
    priority: 10,
    match(ctx) { return !!fragOf(ctx); },
    /* Any printable character extends the fragment — `[`, a letter, `/`, `#`,
       `^`. A space does not: it ends the word like everywhere else. */
    trigger(typed) { return typeof typed === "string" && typed.length === 1 && !/\s/.test(typed); },
    offer(ctx, intent, host) {
      const f = fragOf(ctx);
      if (!f) return null;
      const range = { l: ctx.l, from: f.start, to: ctx.c };
      const hi = f.q.indexOf("#");
      if (hi >= 0) return sub(f.q.slice(0, hi), f.q.slice(hi + 1), range, host);
      const items = host.notes()
        .map(n => [host.rank(f.q, n), n])
        .filter(([s]) => s >= 0)
        .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
        .slice(0, MAX)
        .map(([, n]) => ({ ins: n, label: n, badge: "" }));
      return { items, range };
    },
    commit(it, ctx, host) { host.replace(ctx.range, "[[" + it.ins + "]]"); },
  });

  /* [[note# -> that note's headings (level badge); [[note#^ -> its block ids;
     [[# -> this note. `note` is "" for the current note. */
  function sub(note, frag, range, host) {
    const target = note ? find(note, host) : host.current();
    if (!target) return null;
    const text = target === host.current() ? host.text() : host.readNote(target);
    if (text && typeof text.then === "function") return text.then(t => wrap(note, frag, range, host, t));
    return wrap(note, frag, range, host, text);
  }
  function wrap(note, frag, range, host, text) {
    if (text == null) return null;
    if (frag.charAt(0) === "^") {
      const items = String(text).split("\n")
        .map(l => (l.trimEnd().match(/ \^([A-Za-z0-9-]+)$/) || [])[1]).filter(Boolean)
        .filter(id => host.rank(frag.slice(1), id) >= 0)
        .map(id => ({ ins: note + "#^" + id, label: "^" + id, badge: "" }));
      return { items: items.slice(0, MAX), range };
    }
    const items = host.heads(text).filter(h => host.rank(frag, h.text) >= 0)
      .map(h => ({ ins: note + "#" + h.text, label: h.text, badge: "H" + h.level }));
    return { items: items.slice(0, MAX), range };
  }
  function find(note, host) {
    return host.notes().find(n => n === note || n.endsWith("/" + note)) || null;
  }
})();
