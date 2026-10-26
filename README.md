
<img width="2348" height="1424" alt="image" src="https://github.com/user-attachments/assets/3c26f344-e8cd-452f-891a-8f95f5d9f5bd" />

# Opensidian
Open-source and non-profit under GPLv3, vault-compatible cross-platform markdown notes app. It's based on Rust + Tauri v2 and under heavy development. We're looking for Linux distribution maintainers. Not affiliated with or endorsed by Obsidian or Dynalist Inc.; "Obsidian" is their trademark. Opensidian is a clean-room functional clone: it reimplements Obsidian's behaviour from the outside and contains none of its code.

The interface speaks English and Simplified Chinese, or follows the system language — switch it in **Settings ▸ General ▸ Language**, with the palette command *Switch interface language*, or by launching with `OPENSIDIAN_LOCALE=zh-CN`.

## Install

> **This fork.** `douh/opensidian` is a macOS-focused fork of
> [jpzk/opensidian](https://github.com/jpzk/opensidian). The downloads below and
> their signed `SHA256SUMS` are **upstream's** Linux releases; the fork publishes
> no signed builds, so on macOS build it from source (§ Build from source ▸
> macOS). **Settings ▸ General ▸ Check for updates** compares this build against
> the fork's own release list *and* an optional local build folder, shows the two
> answers separately, and only offers to reveal or download — it never claims a
> signature it cannot verify, and inside the App Sandbox it cannot install.

### Linux x86_64 — packages

Download one from the [v0.8.1 release](https://github.com/jpzk/opensidian/releases/tag/v0.8.1):

| Download | Choose it if | Tested on (fresh install, 2026-10-25) |
|---|---|---|
| [slim AppImage](https://github.com/jpzk/opensidian/releases/download/v0.8.1/opensidian-0.8.1-x86_64-slim.AppImage) | you want the smallest file and have WebKitGTK 4.1 | Fedora 44 (`sudo dnf install webkit2gtk4.1`), Ubuntu 26.04 LTS (`sudo apt install libwebkit2gtk-4.1-0`) |
| [portable AppImage](https://github.com/jpzk/opensidian/releases/download/v0.8.1/opensidian-0.8.1-x86_64-portable.AppImage) | you want nothing to install: WebKit is bundled (needs only the X11/GL/font libraries every desktop has) | Fedora 44, Ubuntu 26.04 LTS |
| [Flatpak](https://github.com/jpzk/opensidian/releases/download/v0.8.1/opensidian-0.8.1-x86_64.flatpak) | you want it sandboxed; pulls the GNOME 49 runtime from Flathub on first install | Fedora 44, Ubuntu 26.04 LTS (`flatpak` package installed) |
| [RPM](https://github.com/jpzk/opensidian/releases/download/v0.8.1/opensidian-0.8.1-x86_64.rpm) | you run Fedora and want a system package with a menu entry and icon; dnf pulls WebKitGTK 4.1 for you | Fedora 44 (`sudo dnf install ./opensidian-0.8.1-x86_64.rpm`) |
| [DEB](https://github.com/jpzk/opensidian/releases/download/v0.8.1/opensidian-0.8.1-x86_64.deb) | you run Debian or Ubuntu and want a system package with a menu entry and icon; apt pulls WebKitGTK 4.1 for you | Debian 13, Ubuntu 26.04 LTS (`sudo apt install ./opensidian-0.8.1-x86_64.deb`) |

### Nix & NixOS

```sh
nix profile add github:jpzk/opensidian
```

## Verify your download
`SHA256SUMS` is signed with key `A6E6 9ED6 BC47 79F3 2817  2148 4CC1 AFDE 15B6 4EA3`:

```sh
curl -LO https://github.com/jpzk/opensidian/releases/download/v0.8.1/SHA256SUMS \
     -LO https://github.com/jpzk/opensidian/releases/download/v0.8.1/SHA256SUMS.asc
gpg --keyserver hkps://keys.openpgp.org --recv-keys A6E69ED6BC4779F3281721484CC1AFDE15B64EA3
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c --ignore-missing SHA256SUMS
```

## Build from source
Tested 2026-10-03 on fresh Ubuntu 26.04 LTS and Fedora 44 with Rust 1.98.0
(build ~2.5 min on 4 cores, binary runs and renders on both).

1. System deps. Ubuntu/Debian:

   ```sh
   sudo apt install build-essential libssl-dev libwebkit2gtk-4.1-dev \
     libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
   ```

   Fedora:

   ```sh
   sudo dnf install gcc gcc-c++ make openssl-devel webkit2gtk4.1-devel \
     gtk3-devel libappindicator-gtk3-devel librsvg2-devel
   ```

2. Rust, if you don't have it (distro rustc is often older than 1.98):

   ```sh
   curl --proto '=https' -sSf https://sh.rustup.rs | sh -s -- --default-toolchain 1.98.0
   . "$HOME/.cargo/env"
   ```

3. Build:

   ```sh
   git clone https://github.com/jpzk/opensidian && cd opensidian/src-tauri
   cargo build --release --locked   # -> target/release/opensidian
   ```

### macOS

Tested 2026-10-25 on macOS 27.0.1 (arm64) with Rust 1.99.1. The system deps
above are Linux-only: macOS needs the Xcode command line tools for the linker
(`xcode-select --install`) and WebKit is part of the OS, so nothing else.

```sh
cd opensidian/src-tauri
cargo build --release --locked      # -> target/release/opensidian
./target/release/opensidian ~/Notes # a vault path; the window opens
cargo test --locked                 # the Landlock tests skip themselves here
```

To get something Finder can launch:

```sh
packaging/macos/make-app.sh         # -> src-tauri/target/macos/Opensidian.app
```

The bundle is ad-hoc signed, which is what every local Mac build is: it runs on
the machine that built it, and a copy that travels still needs a Developer ID
and notarisation to pass Gatekeeper elsewhere.

macOS gets the native frame: `src-tauri/tauri.macos.conf.json` turns decorations
back on with the overlay title bar, so close/minimise/zoom are real traffic
lights and the page runs under them (`ui/style.css` hides the Linux self-drawn
window strip and resize grips). Plugins also see the host they actually run on:
`os.platform()` and `process.platform` answer `darwin`, arch `arm64`/`x64`,
instead of the hardcoded `linux`. Installation image, if you want one:

```sh
hdiutil create -volname Opensidian -srcfolder Opensidian.app -ov -format UDZO Opensidian.dmg
```

The bundle runs inside the **App Sandbox**
(`packaging/macos/Opensidian.entitlements`, applied by `make-app.sh`). Writes
stay in `~/Library/Containers/dev.koto.opensidian`, and a vault folder is
reached through the native folder panel: that grant is kept as a security-scoped
bookmark in the container's `.opensidian.json`, so the next launch opens the
same vault without asking. Consequences worth knowing:

- a path on the command line (`opensidian ~/Notes`) is not a grant; the first
  launch takes it to the folder panel, and the folder you pick is remembered;
- preferences moved into the container, so an older `~/.opensidian.json` is not
  carried over — pick the vault once and it is remembered from then on;
- "open another vault" still works: one vault per process, and the grant is
  written to the config before the new process boots, which resolves it.

The boot log states it: `[sandbox] app-sandbox=on …`, a write inside the
container that lands, and a write to the real home that is refused. If the
second ever says `ALLOWED`, the confinement is gone.

Two things stay Linux-only for now, both plumbing rather than features:

- **Landlock sandbox** (`OPENSIDIAN_LANDLOCK=1`). A Linux LSM with no macOS
  equivalent, so a macOS launch reports `landlock: off (not available on this
  platform)` — on macOS the App Sandbox above is the confinement.
- **Secret storage.** The freedesktop Secret Service (gnome-keyring, KWallet,
  KeePassXC). Plugins that store API keys report it as unsupported; the macOS
  Keychain is not wired up yet.

**Plugin browser downloads** work on macOS through the system `/usr/bin/curl`
(one request per redirect hop, so the allowlist and byte caps still run on every
hop). curl does not read the macOS network settings by itself, so when neither a
`*_proxy` environment nor the app was launched by hand sets one, the system proxy
is read from `scutil --proxy` and passed as `--proxy` — a launch from Finder on a
proxied network therefore reaches GitHub the same way the browser does.

## Nix
The repo ships a flake (Nix 2.4+). It pins nixpkgs unstable and builds with
`--locked` against `src-tauri/Cargo.lock`, so the toolchain and every crate
are pinned.

```sh
nix run .     # build and run
nix build .   # -> result/bin/opensidian, with the desktop file installed
nix develop   # dev shell: rust-analyzer, clippy, rustfmt,
              # clippy, rustfmt and all native deps; then:
              #   cd src-tauri && cargo test --locked
```

On NixOS, the `spawn::tests::switch_alive_probe_reads_proc` test fails:
it hardcodes `/bin/true`, which does not exist there. The flock/landlock
integration tests also need a wider sandbox than the Nix build sandbox
grants, which is why the flake runs `cargo test` from the dev shell and
not as a flake check.

## MCP server (read-only)

The bundle ships `Contents/MacOS/opensidian-mcp`: a small read-only
[Model Context Protocol](https://modelcontextprotocol.io) server over one vault,
for any local MCP client (Claude Desktop, Cursor, a script of your own). It
speaks MCP over stdio — one JSON-RPC message per line, no HTTP — so
every client is configured with the same two values:

- command: `/Applications/Opensidian.app/Contents/MacOS/opensidian-mcp`
- args: the absolute vault path, e.g. `/Users/you/Notes` (or pass no argument and
  set `OPENSIDIAN_VAULT` in the environment instead)

Clients with a JSON config take an `mcpServers` entry:

```json
{
  "mcpServers": {
    "opensidian": {
      "command": "/Applications/Opensidian.app/Contents/MacOS/opensidian-mcp",
      "args": ["/Users/you/Notes"]
    }
  }
}
```

A client that only offers form fields wants the same three things: transport
**stdio** (not HTTP), the command above, and the vault path as its argument.
Reconnect or restart the client after adding it. On Linux the server is the
second binary of the same build (`target/release/opensidian-mcp`).

Tools: `list_notes` (relative paths, optional `folder`/`limit`), `read_note`
(UTF-8 text, truncated at 200 KB by default and marked as such), and
`search_notes` (case-insensitive substring, answering file + line + the matching
line). Nothing writes: it is a reader, `.obsidian/`, `.git/`, `.trash/` and
`node_modules/` are never listed or searched, and a path that escapes the vault
is refused.

The helper is deliberately outside the App Sandbox: the MCP client starts it, it
inherits nothing from the app, and it must be able to read the folder you name.
It runs with your user's rights, like any local MCP server, and only reads.
`make-app.sh` signs it before the app and without entitlements for exactly that
reason.

## Licence
GPL-3.0-or-later ([LICENSE](LICENSE)). Read [THIRD-PARTY.md](THIRD-PARTY.md) before redistributing.

## Themes
Most Obsidian community themes work as they are. Ships with **AnuPpuccin** (default), **Material Gruvbox**,
**Minimal** and **Solarized**, unmodified ([THIRD-PARTY.md](THIRD-PARTY.md)).

To add one, put its `manifest.json` and `theme.css` in `<vault>/.obsidian/themes/<Name>/` (folder name =
`"name"` in the manifest) and pick it in **Settings ▸ Appearance ▸ Themes**. CSS snippets go in
`.obsidian/snippets/`. Both reload live. A broken theme shows greyed out with the reason, and the app
stays on AnuPpuccin.

## Community plugins
Off by default. Each vault starts in restricted mode: no community plugin code runs.

**Turning it on.** Open **Settings ▸ Community plugins** and switch **Restricted mode** off. The
choice is per vault and is saved in `~/.opensidian.json` — inside the App Sandbox
container on macOS (§ macOS above) — outside the vault, so a vault you open
cannot turn its own plugins on.

**What that means.** With restricted mode off, the plugins you enable run code from the internet
with your user's rights, the same as in Obsidian. They can run programs, open network connections
and servers, send HTTP requests to any host, and open files and links with your system's default
apps. There is no per-plugin permission prompt. Enable only plugins you trust.

**Browse.** **Settings ▸ Community plugins ▸ Browse** lists the community plugins. You can search,
sort, and open a plugin to read its details and README. Install, Update and Uninstall download
only from GitHub over HTTPS. The sha256 of every installed file is recorded. Installing does not
enable a plugin; you enable it yourself. Copying a plugin folder into `<vault>/.obsidian/plugins/`
still works.

**Secrets.** Plugins that store secrets (API keys, tokens) use your system keyring through the
Secret Service: gnome-keyring, KWallet or KeePassXC. Secrets are never written to a file. Without
a running keyring, secret storage reports that it is unsupported and those plugins cannot save
secrets.

## Donate

Donation makes it possible! 

bc1qzyh8c8kr8aylywqacsjwau6frzwjqt3cpa603w (BTC)

## AI disclosure

opensidian was built predominantly with AI models. Nearly all of the code, the design docs, and this README were written by Claude (Anthropic's models, via Claude Code) working from prompts, reviews, and corrections by a single human maintainer. The human decided what to build and what the trust model must guarantee, read and pushed back on the output, and ran it; the models wrote most of the lines. Commit messages record the design rationale in the same way — many were drafted by the model and edited by the maintainer.
