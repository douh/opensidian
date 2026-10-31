// SPDX-License-Identifier: GPL-3.0-or-later
//! The completion ENGINE — its seams, its layering and its intent.
//!
//! A completion popup is easy to write once and hard to keep: the trigger, the
//! candidate list, the keys and the insertion call are four decisions that
//! silently drift apart when they live in the same file as the editor, which is
//! what happened before ui/hint-core.js existed (two popups, two half-input
//! flows). The engine is therefore a separate, view-free layer with providers
//! behind a host interface, and these assertions name the boundaries a merge
//! must not erase:
//!
//!   L0  ui/mermaid-syntax.js   vocabulary + pure policy (tests/mermaid_hints.rs)
//!   L1  ui/hint-core.js        state machine, intent, async ownership  ← this file
//!   L2  ui/hint-*.js           one provider per syntax, host-only
//!   L3  ui/main.js             the host + the presenter (and nothing else)
//!
//! (The interactive half — a real keystroke really opens the right list and the
//! popup follows the caret — is driven end-to-end in Ed.selfTest on every
//! launch, and by the macOS probe for pixels.)

use std::fs;
use std::path::PathBuf;

fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..") }

fn read(rel: &str) -> String {
    let p = root().join(rel);
    fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {}", p.display(), e))
}

fn assert_has(file: &str, needles: &[&str]) {
    let src = read(file);
    for n in needles {
        assert!(src.contains(n), "{file} no longer contains {n:?} — see README-Mac.md (Completion: the hint engine)");
    }
}

fn assert_lacks(file: &str, needles: &[&str]) {
    let src = read(file);
    for n in needles {
        assert!(!src.contains(n), "{file} must not contain {n:?} — the layer boundary was crossed; see README-Mac.md");
    }
}

#[test]
fn the_engine_is_view_free_and_app_free() {
    // The engine may read the model only through the host it is handed. If it
    // ever reaches for a node, a pane or the vault, the layering is gone and
    // Ed.selfTest can no longer drive the real state machine.
    assert_lacks("ui/hint-core.js", &[
        "document", "addEventListener", "querySelector", "createElement",
        "getComputedStyle", "Ed.", "MmdHints", "notesCache", "acEl",
    ]);
    assert_has("ui/hint-core.js", &[
        "window.HintCore = {",
        "function create(host, opts) {",
        "function sense(input) {",
        "function key(e) {",
        "function pick(i) {",
        "function reanchor() {",
        "state: snapshot, subscribe, host",
    ]);
}

#[test]
fn the_layers_load_in_order() {
    // Vocabulary -> engine -> providers -> pane. The pane registers the host, so
    // main.js must stay last; a provider that loads before the engine is inert
    // (it returns early), which would be a silent feature loss.
    let html = read("ui/index.html");
    let order = ["mermaid-syntax.js", "hint-core.js", "hint-mermaid.js", "hint-wiki.js", "main.js"];
    let mut prev = 0usize;
    for f in order {
        let tag = format!("script src=\"{f}\"");
        let at = html.find(&tag).unwrap_or_else(|| panic!("index.html does not load {f}"));
        assert!(at > prev, "{f} must load AFTER the previous layer in index.html");
        prev = at;
    }
}

#[test]
fn the_providers_only_speak_the_host_interface() {
    // A provider answers match/trigger/offer/commit and nothing else: it never
    // names the editor, the vault or a node. That is what makes adding a syntax
    // (or fixing a completion) a one-file change.
    for f in ["ui/hint-mermaid.js", "ui/hint-wiki.js"] {
        assert_lacks(f, &["document", "Ed.", "notesCache", "acEl", "updateTitle"]);
        assert_has(f, &["HC.register({", "id: \"", "match(ctx)", "commit(it, ctx, host)"]);
    }
    assert_has("ui/hint-wiki.js", &[
        "const a = ctx.before.lastIndexOf(\"[[\");",
        "return q.indexOf(\"]]\") >= 0 ? null : { start: a, q };",
        "host.notes()", "host.current()", "host.text()", "host.readNote(", "host.heads(",
        "host.rank(", "host.replace(ctx.range,",
        // the async offer is dropped by the engine's token when the caret moved
        "typeof text.then === \"function\"",
    ]);
}

#[test]
fn the_intent_is_saved_and_cycled() {
    // The user's intent is a setting, not a hidden preference: auto (typing may
    // open), manual (only Ctrl+Space), off (never). One palette row cycles it,
    // and the engine reads the saved value — a manual mode that still popped up
    // on typing would be the defect this setting exists to prevent.
    assert_has("ui/hint-core.js", &[
        "const KEY = \"os.hints\";",
        "const MODES = [\"auto\", \"manual\", \"off\"];",
        "localStorage.setItem(KEY, JSON.stringify(conf))",
        "if (use() !== \"auto\") return false;",        // typing opens only in auto
        "if (mod && space) {",                          // the explicit invoke
        "if (use() === \"off\") return false;",
    ]);
    assert_has("ui/main.js", &["\"hints:cycle-intent\"", "HintCore.settings({ mode: next });", "HintCore.MODES"]);
    assert_has("ui/census.js", &["hintTok()"]);
}

#[test]
fn every_pane_owns_one_engine_and_paints_it() {
    // State lives with the pane (one engine per pane, created in mkGroup), and
    // the view is written in exactly one function: paintHints. A click takes the
    // candidate through the engine, so mouse and keyboard share one accept path.
    assert_has("ui/main.js", &[
        "function hintHost(g) {",
        "g._hints = HintCore.create(hintHost(g));",
        "g._hints.subscribe(st => paintHints(g, st));",
        "function paintHints(g, st) {",
        "const open = !!(st && st.phase === \"open\" && st.items.length);",
        "d.onmousedown = e => { e.preventDefault(); g._hints.pick(i); };",
        "function hintsCloseAll(why) {",
    ]);
}

#[test]
fn the_engine_owns_the_keys_while_a_list_is_up() {
    // Up/Down move, the accept keys take, Escape ends, and Ctrl+Space is the
    // invoke. Everything else is the editor's — that is why typing feels like
    // typing. The engine returns "consumed" and the editor does the preventing,
    // so the engine stays testable without a synthetic event object.
    assert_has("ui/hint-core.js", &[
        "const n = st.items.length, mv = K.move.indexOf(c);",
        "if (K.dismiss.indexOf(c) >= 0) { close(c === \"Escape\" ? \"escape\" : \"dismiss\"); return true; }",
        "if (K.accept.indexOf(c) >= 0) { pick(st.sel); return true; }",
    ]);
    assert_has("ui/editor.js", &[
        "if (g._hints && g._hints.key(e)) { e.preventDefault(); e.stopPropagation(); return; }",
        "g._hints.sense({ typed: Ed.typedChar(u), moved: !!u.selectionSet, docChanged: true });",
        "if (!u.docChanged && g._hints && (u.geometryChanged || u.viewportChanged)) g._hints.reanchor();",
    ]);
}

#[test]
fn the_tab_gestures_are_separated_and_rebindable() {
    // ADR-7 (2026-10-30): one key must not carry three meanings silently. Tab
    // opens a list only where one CAN open (an explicit ask, so it also works
    // in manual mode), a quick second Tab takes the first candidate, Shift+Tab
    // ends the list without inserting, and with no list the key falls through
    // to the editor — a fence's line start keeps its indent. The four lists are
    // data in the saved setting, so anyone who wants the old behaviour (Tab =
    // indent everywhere) can rebind them instead of editing code.
    assert_has("ui/hint-core.js", &[
        "const KEYS = {",
        "open: [\"Tab\"],",
        "accept: [\"Enter\", \"Tab\"],",
        "dismiss: [\"Escape\", \"Shift+Tab\"],",
        "move: [\"ArrowDown\", \"ArrowUp\"],",
        "function chord(e) {",
        "(e.shiftKey ? \"Shift+\" : \"\") + k;",
        "if (use() !== \"off\" && K.open.indexOf(c) >= 0) {",
        "if (p) { offer(p, ctx, true); return true; }",
        "window.HintCore = {\n    SETTINGS_KEY: KEY, MODES, KEYS, DEFAULTS,",
    ]);
    // The old file shape (`accept` at the top level) is still read once, so an
    // existing install keeps its accept keys instead of silently resetting.
    assert_has("ui/hint-core.js", &["if (!o.keys && Array.isArray(o.accept)) out.keys.accept"]);
    // The interactive proof runs at every launch, not just here.
    assert_has("ui/editor.js", &[
        "fail(\"hint:tabopen\")", "fail(\"hint:tabtake\")", "fail(\"hint:tabcommit\")",
        "fail(\"hint:shiftaway\")", "fail(\"hint:ownindent\")",
    ]);
}

#[test]
fn a_late_answer_never_paints_a_stale_list() {
    // Reading another note for `[[note#` takes a round trip; the caret keeps
    // moving. Every offer carries a generation token, so only the newest answer
    // is allowed to paint.
    assert_has("ui/hint-core.js", &[
        "const gen = ++st.gen;",
        "if (gen !== st.gen) return false;",
        // closing now also clears the ADR-8 layer, so a closed engine repaints
        // when either surface had something to show
        "if (was || had) publish();",
    ]);
}

#[test]
fn the_context_layer_is_passive_and_follows_the_caret() {
    // ADR-8 (2026-10-31): inside mermaid ground a second surface says what the
    // diagram is and which words are legal where the caret stands. It owns no
    // key, inserts nothing and never opens a list: it is recomputed by the
    // engine on every caret move (`syncHelp` from `sense`), published in the
    // snapshot, painted by one function, and suppressed while a list is up
    // (the list already says what may be taken). The intent still wins: only
    // `auto` raises it, `manual`/`off` stay quiet.
    assert_has("ui/hint-core.js", &[
        "function syncHelp() {",
        "if (use() === \"auto\" && st.phase !== \"open\") { // a list already says what may be taken",
        "help: st.help ? { id: st.help.id, type: st.help.type, place: st.help.place,",
        "function follow() { syncHelp(); return !!st.help; }",
        "const r = step(input);",
        "// the panel is anchored to the caret too",
        "follow, key, pick",
    ]);
    // Nothing in the layer may write: no pick path for `help` at all.
    assert_lacks("ui/hint-core.js", &["helpPick", "st.help.items[i]"]);
    assert_has("ui/hint-mermaid.js", &["panel(ctx) {", "return M.helpOf("]);
    assert_has("ui/main.js", &[
        "function paintHelp(g, st) {",
        "g.helpEl = q(\".mmdhelp\");",
        "g._hints.subscribe(st => paintHelp(g, st));",
        "[hinthelp:",
        "head.textContent = h.type || i18n.t(\"Choose a diagram type\");",
        "place.textContent = i18n.t(h.place);",
        // a pointer-dead card cannot be scrolled, so its height follows the room
        // the caret leaves (a fixed 240px cap cut the type chooser's last row)
        "box.style.maxHeight = Math.max(80, g.content.clientHeight - top - 12)",
    ]);
    // passive by construction: no pointer target (the card floats over text the
    // user may still be clicking into) and no vocabulary of its own to insert
    assert_has("ui/style.css", &[".mmdhelp {", "pointer-events: none", ".mh-words {"]);
    // and the layer is proven on every launch, not only here
    assert_has("ui/editor.js", &[
        "fail(\"help:types\")", "fail(\"help:vocab\")", "fail(\"help:block\")",
        "fail(\"help:list\")", "fail(\"help:intent\")",
    ]);
}

#[test]
fn the_app_checks_the_engine_on_every_load() {
    // Ed.selfTest drives the REAL state machine on a fake host at startup: typing
    // opens, Enter takes, a space/paste/caret move ends, manual and off honour
    // the intent, and a stale answer is dropped. A regression shows up as
    // [edt:hint:...] in the title instead of waiting for a user to type.
    assert_has("ui/editor.js", &[
        "fail(\"hint:absent\")", "fail(\"hint:open\")", "fail(\"hint:take\")",
        "fail(\"hint:space\")", "fail(\"hint:paste\")", "fail(\"hint:manual\")",
        "fail(\"hint:offintent\")", "fail(\"hint:follow\")", "fail(\"hint:move\")",
        "fail(\"hint:wiki\")", "fail(\"hint:head\")", "fail(\"hint:stale\")",
    ]);
}
