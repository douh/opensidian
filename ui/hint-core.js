// SPDX-License-Identifier: GPL-3.0-or-later
/* HINT ENGINE (L1) — one state machine behind every "what may I write here?"
   popup: the ```mermaid keywords and the `[[` link targets today, another
   syntax tomorrow.

   WHY A LAYER, NOT A PATCH: a completion list has four questions that must be
   answered in ONE place or they drift apart — (1) is this caret a place where
   a list may appear at all, (2) did the user do something that may OPEN one
   (typing) versus something that may only END one (a paste, an undo, a caret
   move), (3) what does the list say right now, and (4) what happens when a
   candidate is taken. This file owns (1)-(4). Providers answer the "what" for
   their own grammar; a pane answers the "where" and the "how it is painted".

   NO VIEW, NO APP STATE. The caret is read through the HOST the pane hands
   in, so the editor's self test drives the real state machine on a fake host
   at every launch (tests/hint_engine.rs keeps this file view-free).

   HOST (supplied by the pane):
     lines()                    the model, one string per line
     caret()                    { l, c } in model coords (0-based) or null
     fenceAt(l, lines)          the fence around line l, or null; start/end are
                                counted from 1 (the vendored fence walker)
     text()                     the whole model
     notes()                    vault note names
     current()                  the active note's name
     readNote(name)             another note's bytes (string or a thenable)
     heads(text)                ATX headings [{ text, level, line }]
     rank(query, word)          -1 = no match, lower = better
     replace(range, text)       { l, from, to } on ONE line -> the model

   PROVIDER (one per syntax; hint-mermaid.js and hint-wiki.js do it today):
     id, label, priority        priority: higher is asked first
     match(ctx)                 "does this caret belong to me?"
     trigger(typed, ctx)        "may THIS keystroke open my list?"
     offer(ctx, intent, host)   { items, range } | thenable | null
     commit(item, ctx, host)    ctx.range is the span that was offered
   items are { ins, label, badge }: ins is what a pick inserts, label and
   badge are what the popup shows.

   INTENT (the user's setting, localStorage "os.hints"):
     mode   auto    a typed character may open a list (default)
            manual  only an explicit ask opens one (Ctrl+Space, Tab)
            off     nothing opens
     keys   open    keys that open a list where one CAN open (default Tab)
            accept  keys that take the selection while it is up (Enter, Tab)
            dismiss keys that end it without inserting (Escape, Shift+Tab)
            move    keys that walk the list (ArrowDown, ArrowUp, in this order)
   plus per-provider on/off and a cap on rows. `create(host, { mode,
   providers })` overrides them for one engine only, which is how the self
   test proves all three intents without touching a saved preference.

   ADR-7 (decided 2026-10-30): Tab is the toggle, Shift+Tab dismisses, and a
   quick second Tab takes the first candidate — three gestures, three cases,
   every list rebindable in the setting above. The toggle only CLAIMS a key
   where a list can actually open; at a fence's line start, in prose or in a
   list the key falls through to the editor, so indent/outdent never
   disappear (Markdown and Mermaid rarely need Tab anyway).

   STATE: off | open. Events: sense (the editor saw a transaction), key (a
   keystroke arrived), reanchor (layout moved, repaint), close. Opening is
   reserved for a typed character (auto) or an explicit invoke. A caret move
   only REFRESHES a list that still describes the caret — it follows the
   cursor inside its span and disappears when the cursor leaves it; a paste,
   a delete or an undo only ENDS one. An asynchronous offer carries a
   generation token, so a late answer never paints a stale list. */
(function () {
  "use strict";

  const KEY = "os.hints";                       // the saved intent; see settings()
  const MODES = ["auto", "manual", "off"];
  /* Rebinding is the point, so the defaults are named once (see ADR-7 above).
     `move` is ordered: index 0 walks down, index 1 walks up. */
  const KEYS = {
    open: ["Tab"],
    accept: ["Enter", "Tab"],
    dismiss: ["Escape", "Shift+Tab"],
    move: ["ArrowDown", "ArrowUp"],
  };
  const DEFAULTS = { mode: "auto", keys: KEYS, max: 8, providers: {} };
  let conf = null;                              // parsed once, mutated only by settings()
  const PROVIDERS = [];                         // asked in priority order, higher first
  let seq = 0;

  /* ---------- intent (settings) ---------- */
  /* One spelling for every binding, so a list can say "Shift+Tab" while a
     KeyboardEvent still reports key "Tab" with shiftKey true. Ctrl and Cmd
     share the spelling: the fork binds the same chords on both platforms. */
  function chord(e) {
    const k = e.key === " " ? "Space" : e.key;
    return (e.altKey ? "Alt+" : "") + (e.ctrlKey || e.metaKey ? "Ctrl+" : "") +
           (e.shiftKey ? "Shift+" : "") + k;
  }

  function keys(o) {
    const out = { open: KEYS.open.slice(), accept: KEYS.accept.slice(),
                  dismiss: KEYS.dismiss.slice(), move: KEYS.move.slice() };
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(out))
      if (Array.isArray(o[k])) out[k] = o[k].filter(x => typeof x === "string" && x);
    return out;
  }

  /* `clean` is the schema: anything else on disk (an old key, a bad mode, a
     string where a boolean belongs) is dropped rather than half-honoured. */
  function clean(o) {
    const out = { mode: DEFAULTS.mode, keys: keys(o && o.keys), max: DEFAULTS.max, providers: {} };
    if (!o || typeof o !== "object") return out;
    if (MODES.indexOf(o.mode) >= 0) out.mode = o.mode;
    // v0.1 kept the accept keys at the top level; honour that file once
    if (!o.keys && Array.isArray(o.accept)) out.keys.accept = o.accept.filter(k => typeof k === "string" && k);
    if (typeof o.max === "number" && o.max > 0) out.max = Math.min(32, Math.round(o.max));
    if (o.providers && typeof o.providers === "object")
      for (const k of Object.keys(o.providers))
        if (typeof o.providers[k] === "boolean") out.providers[k] = o.providers[k];
    return out;
  }
  function settings(patch) {
    if (!conf) {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (_) { raw = null; }
      let o = null;
      try { o = raw ? JSON.parse(raw) : null; } catch (_) { o = null; }
      conf = clean(o);
    }
    if (patch) {
      conf = clean(Object.assign({}, conf, patch,
        { providers: Object.assign({}, conf.providers, (patch && patch.providers) || {}) }));
      try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch (_) { /* a session without storage still runs */ }
    }
    return clean(conf);                         // a copy: callers read, never mutate
  }
  function mode() { return settings().mode; }
  function enabled(id) { return settings().providers[id] !== false; }   // on unless turned off

  /* ---------- provider registry ---------- */
  function register(p) {
    if (!p || typeof p.id !== "string" || !p.id) return false;
    if (typeof p.match !== "function" || typeof p.offer !== "function" || typeof p.commit !== "function") return false;
    unregister(p.id);                           // re-registering replaces (self test, hot reload)
    p.priority = typeof p.priority === "number" ? p.priority : 0;
    p._seq = ++seq;
    PROVIDERS.push(p);
    PROVIDERS.sort((a, b) => b.priority - a.priority || a._seq - b._seq);
    return true;
  }
  function unregister(id) {
    for (let i = PROVIDERS.length - 1; i >= 0; i--) if (PROVIDERS[i].id === id) PROVIDERS.splice(i, 1);
  }

  /* ---------- one engine per pane ---------- */
  function create(host, opts) {
    opts = opts || {};
    const fixed = MODES.indexOf(opts.mode) >= 0 ? opts.mode : null;      // self test / shadow panes
    const use = () => fixed || mode();
    const on = p => (opts.providers && typeof opts.providers[p.id] === "boolean"
      ? opts.providers[p.id] : enabled(p.id));
    const st = { phase: "off", provider: null, ctx: null, items: [], sel: 0, range: null,
                 gen: 0, manual: false, why: "new" };
    const subs = [];

    /* The state a presenter paints. `at` is the caret the offer describes —
       enough for a census to say WHERE a list is up without shipping the lines. */
    function snapshot() {
      const c = st.ctx;
      return { phase: st.phase, id: st.provider ? st.provider.id : null,
               items: st.items.slice(), sel: st.sel,
               range: st.range ? { l: st.range.l, from: st.range.from, to: st.range.to } : null,
               manual: st.manual, mode: use(), why: st.why,
               at: c ? { l: c.l, c: c.c, fence: c.fence ? c.fence.lang : null } : null };
    }
    function publish() {
      const s = snapshot();
      for (const f of subs.slice()) { try { f(s); } catch (_) { /* a broken pane must not break the engine */ } }
    }
    function subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      subs.push(fn);
      return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
    }

    /* What is around the caret, in one object every provider shares. */
    function context(typed) {
      if (!host || typeof host.lines !== "function") return null;
      const lines = host.lines() || [];
      const p = typeof host.caret === "function" ? host.caret() : null;
      if (!p || !lines.length) return null;
      const l = Math.max(0, Math.min(p.l, lines.length - 1));
      const line = lines[l] == null ? "" : String(lines[l]);
      const c = Math.max(0, Math.min(p.c, line.length));
      return { l, c, lines, line, before: line.slice(0, c),
               typed: typed == null ? null : typed,
               fence: typeof host.fenceAt === "function" ? host.fenceAt(l, lines) : null };
    }

    function owner(ctx) {
      for (const p of PROVIDERS) {
        if (!on(p)) continue;
        let m = false;
        try { m = !!p.match(ctx); } catch (_) { m = false; }
        if (m) return p;
      }
      return null;
    }

    /* Ask the provider and publish its answer. A thenable is allowed (reading
       another note takes a round trip); `gen` is the ownership token, so an
       answer that arrives after the caret moved is dropped, not painted. */
    function offer(p, ctx, manual) {
      const gen = ++st.gen;
      st.provider = p; st.ctx = ctx; st.manual = manual; st.why = "offer";
      let r = null;
      try { r = p.offer(ctx, { typed: ctx.typed, manual, mode: use() }, host); } catch (_) { r = null; }
      if (r && typeof r.then === "function") {
        try {
          r.then(v => apply(v, gen), () => { if (gen === st.gen) close("error"); });
        } catch (_) { close("error"); }
        return true;
      }
      apply(r, gen);
      return true;
    }
    function apply(r, gen) {
      if (gen !== st.gen) return false;          // a later keystroke owns this caret now
      const items = r && Array.isArray(r.items) ? r.items.slice(0, settings().max) : [];
      if (!items.length || !r.range) return close("empty");
      st.phase = "open"; st.items = items; st.sel = 0; st.range = r.range; st.why = "open";
      publish();
      return true;
    }

    function close(why) {
      const was = st.phase === "open";
      st.gen++;                                  // any pending answer is stale from here on
      st.phase = "off"; st.provider = null; st.ctx = null;
      st.items = []; st.sel = 0; st.range = null; st.manual = false;
      st.why = why || "close";
      if (was) publish();
      return true;
    }

    /* A caret move may keep a list that still describes the caret. */
    function inside(r, c) {
      return !!r && r.l === c.l && c.c >= r.from && c.c <= r.to;
    }

    /* The editor's one call per transaction. `typed` is the character the user
       just inserted (or null: a paste, a delete, an undo, our own insertion);
       `moved` says the selection was set. Nothing opens without a typed
       character — that is the whole input flow, stated once. */
    function sense(input) {
      input = input || {};
      const typed = typeof input.typed === "string" && input.typed.length ? input.typed.slice(-1) : null;
      const ctx = context(typed);
      if (!ctx) return close("caret");
      if (st.phase !== "open") {
        if (!typed) return false;                // only typing may open (auto), or key() explicitly
        if (use() !== "auto") return false;      // manual: the invoke owns it; off: never
        const p = owner(ctx);
        if (!p || !p.trigger(typed, ctx)) return false;
        offer(p, ctx, false);
        return true;
      }
      const p = owner(ctx);
      if (!p) return close("left");              // the caret left this provider's ground
      if (!typed) {                              // a bare caret move
        if (!inside(st.range, ctx)) return close("moved");
        offer(p, ctx, st.manual);                // still in the span: the list follows the cursor
        return true;
      }
      if (p.id !== (st.provider && st.provider.id)) {   // the caret moved onto another provider
        close("switch");
        offer(p, ctx, false);
        return true;
      }
      st.manual = false;
      offer(p, ctx, false);                      // the word grew: re-filter
      return true;
    }

    /* The keys the engine owns. Returning true means "the editor must not see
       this key" — the caller does the preventing, so the engine stays testable
       without an event object. Nothing is claimed unless the engine can act:
       a toggle with no list to open is the editor's key. */
    function key(e) {
      if (!e) return false;
      const K = settings().keys, c = chord(e);
      const mod = !!(e.ctrlKey || e.metaKey), space = e.key === " " || e.code === "Space";
      if (mod && space) {                        // the explicit intent, any mode but off
        if (use() === "off") return false;
        const ctx = context(null), p = ctx && owner(ctx);
        if (p) offer(p, ctx, true);
        return true;                             // Ctrl+Space is ours either way: it must not insert a space
      }
      if (st.phase !== "open") {
        /* ADR-7: the toggle only claims a key where a list CAN open. At a
           fence's line start, in prose or in a list the key falls through, so
           the editor's indent/outdent survive. */
        if (use() !== "off" && K.open.indexOf(c) >= 0) {
          const ctx = context(null), p = ctx && owner(ctx);
          if (p) { offer(p, ctx, true); return true; }
        }
        return false;
      }
      const n = st.items.length, mv = K.move.indexOf(c);
      if (mv >= 0 && n) {
        st.sel = (st.sel + (mv === 0 ? 1 : n - 1)) % n;
        publish();
        return true;
      }
      if (K.dismiss.indexOf(c) >= 0) { close(c === "Escape" ? "escape" : "dismiss"); return true; }
      if (K.accept.indexOf(c) >= 0) { pick(st.sel); return true; }
      return false;
    }

    /* Taking a candidate: close FIRST, so the insertion's own transaction can
       never reopen the list, then let the provider land it through the host
       (one undo step, the dirty flag, the save path — the model, not the view). */
    function pick(i) {
      if (st.phase !== "open") return false;
      const it = st.items[i], p = st.provider, ctx = st.ctx;
      if (!it || !p || !ctx) return false;
      const c = Object.assign({}, ctx, { range: st.range });
      close("accept");
      try { p.commit(it, c, host); } catch (_) { return false; }
      return true;
    }

    /* Layout moved (scroll, resize, a row rewrapped): repaint at the caret. */
    function reanchor() { if (st.phase === "open") publish(); return st.phase === "open"; }

    return { sense, key, pick, accept: () => pick(st.sel), close, reanchor,
             state: snapshot, subscribe, host };
  }

  window.HintCore = {
    SETTINGS_KEY: KEY, MODES, KEYS, DEFAULTS,
    register, unregister, providers: () => PROVIDERS.slice(),
    create, settings, mode, enabled,
  };
})();
