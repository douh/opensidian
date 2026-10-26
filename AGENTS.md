# AGENTS.md — working on opensidian

Read this before changing anything. It is for coding agents and humans alike.

## What this is
opensidian is a desktop markdown notes app that opens Obsidian-style vaults
(plain `.md` files plus a `.obsidian/` config folder). Rust backend on
Tauri v2, plain-JS frontend, Linux first (AppImage, Flatpak, plain binary),
macOS since 2026-10 (`Opensidian.app`, `packaging/macos/make-app.sh`).
Licence: GPL-3.0-or-later for all of it, since the first commit.

**Docs.** `README.md` stays byte-identical to upstream — `git diff origin/main --
README.md` must be empty — so an upstream README edit is never a merge conflict.
Fork-only prose (macOS build and signing, App Sandbox, interface language, the
read-only MCP server) belongs in `README-Mac.md` (Simplified Chinese), never in
`README.md`. Work that is planned but not started lives in a local
`PLAN-<topic>.md` at the repo root and is NEVER committed — keep it out of `git
status` with `.git/info/exclude` (a per-clone list, so no `PLAN` line ends up in
`.gitignore` or in a merge).

## Platforms
One tree, two targets. Three pieces are Linux plumbing and are STUBBED off
Linux — never emulated, never replaced by a new crate:
- Landlock (`sandbox.rs`): no macOS equivalent; `enforce()` returns
  `NotEnforced`, `landlock_enabled()` is false, and the launch line says
  `landlock: off (not available on this platform)`.
- libsoup HTTPS on Linux vs `/usr/bin/curl` on macOS (`plugin_store.rs`
  `http_get`): same allowlist, one request per hop, same byte caps. macOS proxy
  comes from `*_proxy` when set, else `scutil --proxy` (a Finder launch inherits
  no environment). Plugins copied into the vault still load everywhere.
- The freedesktop Secret Service (`secrets.rs`): every op is an `unsupported:`
  error. macOS Keychain is not wired up.

The macOS bundle runs inside the **App Sandbox**
(`packaging/macos/Opensidian.entitlements`, applied by `make-app.sh`), so a path
is not a permission:
- folders outside `~/Library/Containers/dev.koto.opensidian` are reached only
  through `src/sandbox_mac.rs`: an NSOpenPanel on the main thread, and the grant
  kept across launches as an app-scoped security-scoped bookmark in
  `~/.opensidian.json` under `vault_bookmarks` (the container's home).
- never add an `absolute-path.read-write` temporary exception to make a path
  "just work": it would hand the whole filesystem back and make this decorative.
- the boot gate is `boot_sandbox_gate` + `boot_sandbox_panel` in `main.rs`: a
  vault whose bookmark does not resume is asked for in the panel before the
  window exists. Linux, and any unsandboxed run (`cargo test`, the bare binary),
  answer `needs_panel(false, …)` and are untouched.
- the `[sandbox]` boot lines (container path, inside write ok, outside write
  denied) are the check; a silent `ALLOWED` means confinement is broken.

Two macOS-only wiring points, both keyed off the same truth:
- `src-tauri/tauri.macos.conf.json`: `decorations: true` + `titleBarStyle:
  Overlay`, so the frame is the system's (real traffic lights) and the page runs
  under it. `ui/style.css` `body.mac` hides the Linux self-drawn `#wframe` and
  `#wrz` and reserves the lights' corner; the flag comes from the next item.
- `main.rs host_js()`: injected as an initialization script before any page
  script and read by `ui/plugins/node-desktop.js`, so `os.platform()` /
  `process.platform` answer `darwin` (arch `arm64`) instead of a hardcoded
  `linux`. Never hardcode host facts in the JS shims again.

Everywhere else the Linux syscall has a POSIX/macOS form in place, keep them in
step: `/proc` liveness is libproc (`spawn::alive`), `renameat2(RENAME_NOREPLACE)`
is `renameatx_np(RENAME_EXCL)`, `O_PATH` is `O_SYMLINK` plus `O_NONBLOCK` (a
plain `O_RDONLY` on a FIFO blocks forever), `/proc/self/fd/N` chmod is `fchmod`
on the real fd, `pipe2` is `pipe` + `FD_CLOEXEC`, `prctl(PDEATHSIG)` and
`close_range` are skipped, `xdg-open` is `open`, and the umask is the 022
default (macOS cannot read it without setting it). Tests that need a second
filesystem mount a throwaway RAM disk on macOS and print a loud SKIP when they
cannot; `flock(1)` is not used at all — contention tests fork and take
`flock(2)` themselves.

## Layout
- `src-tauri/` — the Rust crate (`opensidian`).
  - `src/main.rs`: app wiring, the ~100 `#[tauri::command]`s, vault binding
    (`bind_vault`; the vault root is a `OnceLock`, set once per process).
  - `src/index.rs`: in-memory note index (search, graph, backlinks, tags).
  - `src/watcher.rs`: polling watcher that reconciles external edits.
  - `src/spawn.rs`, `src/spawner.rs`, `src/vaultlock.rs`, `src/cfgstore.rs`:
    one vault per process. "Open another vault" starts a new process; a flock
    per vault stops a second backend; `~/.opensidian.json` is shared by all
    processes, so writes go through cfgstore.
  - `src/sandbox.rs`: optional Landlock self-sandbox (`OPENSIDIAN_LANDLOCK=1`);
    `src/sandbox_mac.rs` (macOS-only): App Sandbox folder panel and bookmarks.
  - `src/bin/opensidian-mcp.rs`: the read-only MCP (stdio) server a local MCP
    client launches. It must stay OUT of the App Sandbox — make-app.sh signs it before
    the app, without entitlements, or it could not read the vault it is given.
    No writes: keep it a reader (list/read/search), never a second writer.
  - `src/themefs.rs`, `src/builtins.rs`: themes and CSS snippets are files in
    the vault. The bundled community themes in `themes/` are vendored
    **byte-exact** and pinned by sha256 in builtins.rs. Never edit them.
  - `src/settings.rs`, `src/migrate.rs`, `src/srcmode.rs`, `src/outline.rs`,
    `src/datefmt.rs`, `src/perf.rs`: settings table, rename migration from the
    old product name, source mode, outline, date formats, lag telemetry.
  - `tests/`: integration tests and fixtures (`cargo test` needs nothing else).
- `ui/` — the frontend, served as-is (no bundler, no npm).
  - `main.js` (app), `editor.js` (Live Preview / source editor core),
    `graph-gl.js` (WebGL graph), `otel.js` (frontend lag spans),
    `census.js` (test tokens, append-only), `style.css`, `fonts/` (OFL).
- `packaging/flatpak/` — manifest, desktop file, metainfo.
- `vault/` — a small sample vault.
- `scripts/ docs/ notes/ bin/` are gitignored. The maintainer's test harness
  and design notes live in a separate private repo and appear here as
  symlinks. Never commit anything under those paths.

## Build and test
System deps and toolchain: see README "Build from source" (Rust 1.98.0).

    cd src-tauri
    cargo build --release --locked
    cargo test --locked

Always `--locked`. The listtoggle tests run `ui/editor.js` in JavaScriptCore,
so the webkit dev packages must be installed for tests too.

## Rules
- **Clean room.** Compatibility comes from public file formats and observed
  behaviour only. Never copy Obsidian's code, CSS, values, assets or text, and
  never unpack or inspect its binaries. Every design value (sizes, spacing,
  colours) must be our own, with its reasoning written down.
- **Licence headers.** Every new `.rs .js .html .css .sh` file carries
  `SPDX-License-Identifier: GPL-3.0-or-later` near the top (the release check refuses
  files without it; `src-tauri/themes/` is exempt). Third-party material goes
  in THIRD-PARTY.md with author, pinned version and licence.
- **Dependencies.** No new crate unless unavoidable. Pin with `=`, prefer
  crates already in Cargo.lock, never a release younger than 6 weeks, and
  never an unpinned or auto-updated dependency. No npm, no Python tooling.
- **Commits.** Author and committer are `jpzk <jendrik@madewithtea.com>`.
  No `Co-Authored-By` or "Generated with" trailers. Commit messages explain
  why; keep them free of third-party values.
- **Never commit** `progress.md`, `.goalenv`, `x`, `target/`, screenshots,
  or helper `.sh` files outside `packaging/`.
- **Frontend.** No frameworks, no bundler. Tests read live CSS tokens, never
  hard-coded hex values. `ui/census.js` is append-only: one new line per token.
- **Vault safety.** Never write outside the bound vault and the user config.
  Unknown keys in `.obsidian/*.json` must round-trip unchanged.
- **Themes.** The bundled themes are seeded into a vault's
  `.obsidian/themes/` without overwriting user files. Changes to how a theme
  is chosen need a test fixture under `src-tauri/tests/fixtures/`.

## Releases
Version lives in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
`Cargo.lock` and the Flatpak metainfo; bump all four together. A release ships
the plain binary, the AppImage and the Flatpak, a `SHA256SUMS` file, and the
maintainer's detached GPG signature (key fingerprint in README "Verify your
download"). Tags are annotated (`vX.Y`). Agents never hold the signing key.

## When in doubt
Ask one focused question rather than guess. Prefer small, reviewable
changes with a test that fails before and passes after.
