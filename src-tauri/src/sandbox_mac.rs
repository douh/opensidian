// SPDX-License-Identifier: GPL-3.0-or-later
/* macOS App Sandbox — the only way this app reaches a folder outside its own
   container. packaging/macos/Opensidian.entitlements turns the sandbox on
   (app-sandbox, network.client, user-selected read-write, bookmarks.app-scope),
   and from then on a plain `open("/Users/…/Vault")` is EPERM: paths are not
   permissions. Two primitives are therefore all this module offers:

     1. choose_dir() — an NSOpenPanel on the main thread. The URL it returns
        carries a sandbox extension for the chosen folder, valid for the life
        of THIS process.
     2. a security-scoped bookmark — the same grant, in bytes, so the NEXT
        process can ask for it again (start_access). Bookmarks are app-scoped,
        which is what com.apple.security.files.bookmarks.app-scope permits; they
        live in ~/.opensidian.json under "vault_bookmarks" (main.rs owns the
        file, this module only makes and resolves the bytes).

   NO CRATE: AppKit/Foundation are reached through objc_msgSend, the same way
   the rest of the tree talks to system C. The message signatures below are
   spelled per call because on arm64 every argument goes in a register anyway,
   but the wrong return type still corrupts a register pair — so each helper
   names exactly one signature instead of casting ad hoc.

   Why a bookmark and not the path: an App Sandboxed launch starts in its
   container (~/Library/Containers/dev.koto.opensidian/Data); the real vault
   path is outside it and a path string grants nothing. A bookmark is the
   kernel-verifiable form of "the user picked this folder". A temporary
   exception (absolute-path.read-write "/") would grant every path and is
   deliberately NOT used — that would make the sandbox decoration.

   Registry: the NSURL from the panel or from a resolved bookmark is retained
   for the life of the process. A child path (a vault created inside a picked
   folder) is derived by appending components to that URL, which keeps the
   security scope; minting a fresh NSURL from the path alone would not. */

use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// set by the sandbox for every process that carries com.apple.security.app-sandbox
pub const CONTAINER_ENV: &str = "APP_SANDBOX_CONTAINER_ID";

/// true when THIS process runs under App Sandbox. An unsandboxed binary (a
/// `cargo test` run, the Linux build) answers false and all the helpers below
/// stay on their ordinary path, so nothing here changes a non-sandboxed boot.
pub fn sandboxed() -> bool {
    std::env::var_os(CONTAINER_ENV).is_some()
}

/// The boot decision, pure so it can be tested without a sandbox: a vault this
/// launch cannot reach (no bookmark, or the user revoked it) must be asked for
/// in an NSOpenPanel rather than opened and failed.
pub fn needs_panel(sandboxed: bool, resumed: bool) -> bool {
    sandboxed && !resumed
}

/// The key a bookmark is stored under: the canonical path, so `/x/../x/Vault`
/// and `/x/Vault` are one grant instead of two.
pub fn key(p: &Path) -> String {
    p.canonicalize().unwrap_or_else(|_| p.to_path_buf()).display().to_string()
}

/* ---------- base64 (the config file is JSON; a bookmark is binary) ---------- */

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (c.get(1).copied().unwrap_or(0) as u32) << 8 | c.get(2).copied().unwrap_or(0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut n = 0;
    let mut pad = 0;
    for b in s.bytes() {
        if b == b'=' {
            pad += 1;
            continue;
        }
        if pad > 0 {
            return None; // data after padding
        }
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32;
        acc = acc << 6 | v;
        n += 1;
        if n == 4 {
            out.push((acc >> 16) as u8);
            out.push((acc >> 8) as u8);
            out.push(acc as u8);
            acc = 0;
            n = 0;
        }
    }
    match n {
        0 => {}
        2 => out.push((acc >> 4) as u8),
        3 => {
            out.push((acc >> 10) as u8);
            out.push((acc >> 2) as u8);
        }
        _ => return None,
    }
    Some(out)
}

/* ---------- objc_msgSend plumbing ---------- */

#[link(name = "AppKit", kind = "framework")]
#[link(name = "Foundation", kind = "framework")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
}

type Send0 = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void;
type SendObj = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut c_void;
type SendCStr = unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_char) -> *mut c_void;
type SendBool = unsafe extern "C" fn(*mut c_void, *mut c_void, i8);
type SendI64Ret = unsafe extern "C" fn(*mut c_void, *mut c_void) -> i64;
type SendI8 = unsafe extern "C" fn(*mut c_void, *mut c_void) -> i8;
type SendPtr = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *const c_void;
type SendUsize = unsafe extern "C" fn(*mut c_void, *mut c_void) -> usize;
type SendData = unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_void, usize) -> *mut c_void;
type SendMkBookmark = unsafe extern "C" fn(*mut c_void, *mut c_void, u64, *mut c_void, *mut c_void, *mut *mut c_void) -> *mut c_void;
type SendResolve = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void, u64, *mut c_void, *mut i8, *mut *mut c_void) -> *mut c_void;

/// NSURLBookmarkCreationWithSecurityScope
const BOOKMARK_SECURITY_SCOPE: u64 = 1 << 11;
/// NSURLBookmarkResolutionWithSecurityScope
const RESOLVE_SECURITY_SCOPE: u64 = 1 << 10;
/// NSModalResponseOK
const MODAL_OK: i64 = 1;

unsafe fn class(name: &str) -> *mut c_void {
    let c = CString::new(name).unwrap_or_default();
    objc_getClass(c.as_ptr())
}

unsafe fn sel(name: &str) -> *mut c_void {
    let c = CString::new(name).unwrap_or_default();
    sel_registerName(c.as_ptr())
}

unsafe fn send0(obj: *mut c_void, name: &str) -> *mut c_void {
    let f: Send0 = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name))
}

unsafe fn send_obj(obj: *mut c_void, name: &str, arg: *mut c_void) -> *mut c_void {
    let f: SendObj = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name), arg)
}

unsafe fn send_cstr(obj: *mut c_void, name: &str, arg: *const c_char) -> *mut c_void {
    let f: SendCStr = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name), arg)
}

unsafe fn set_bool(obj: *mut c_void, name: &str, v: bool) {
    let f: SendBool = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name), v as i8)
}

unsafe fn send_i64_ret(obj: *mut c_void, name: &str) -> i64 {
    let f: SendI64Ret = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name))
}

unsafe fn send_i8(obj: *mut c_void, name: &str) -> i8 {
    let f: SendI8 = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name))
}

unsafe fn send_ptr(obj: *mut c_void, name: &str) -> *const c_void {
    let f: SendPtr = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name))
}

unsafe fn send_usize(obj: *mut c_void, name: &str) -> usize {
    let f: SendUsize = std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel(name))
}

unsafe fn data_new(bytes: &[u8]) -> *mut c_void {
    let f: SendData = std::mem::transmute(objc_msgSend as *const ());
    let d = send0(class("NSData"), "alloc");
    if d.is_null() {
        return d;
    }
    f(d, sel("initWithBytes:length:"), bytes.as_ptr().cast(), bytes.len())
}

/// `[NSError localizedDescription]`, for a failure line that says why
unsafe fn describe_error(err: *mut c_void) -> String {
    if err.is_null() {
        return "no NSError".into();
    }
    let desc = send0(err, "localizedDescription");
    let c = send_ptr(desc, "UTF8String") as *const c_char;
    if c.is_null() {
        return "unprintable NSError".into();
    }
    CStr::from_ptr(c).to_string_lossy().into_owned()
}

/// an autoreleased NSString, valid until the pool drains
unsafe fn nsstring(s: &str) -> *mut c_void {
    let c = CString::new(s).unwrap_or_default();
    send_cstr(class("NSString"), "stringWithUTF8String:", c.as_ptr())
}

unsafe fn nsurl_path(p: &Path) -> *mut c_void {
    use std::os::unix::ffi::OsStrExt;
    let c = match CString::new(p.as_os_str().as_bytes()) {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };
    let s = send_cstr(class("NSString"), "stringWithUTF8String:", c.as_ptr());
    send_obj(class("NSURL"), "fileURLWithPath:", s)
}

/// the path a URL names, through fileSystemRepresentation so a non-UTF-8
/// folder name is not mangled
unsafe fn url_path(url: *mut c_void) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    if url.is_null() {
        return None;
    }
    let c = send_ptr(url, "fileSystemRepresentation") as *const c_char;
    if c.is_null() {
        return None;
    }
    Some(PathBuf::from(std::ffi::OsStr::from_bytes(CStr::from_ptr(c).to_bytes())))
}

unsafe fn pool_new() -> *mut c_void {
    let p = send0(class("NSAutoreleasePool"), "alloc");
    send0(p, "init")
}

unsafe fn pool_drain(p: *mut c_void) {
    if !p.is_null() {
        send0(p, "drain");
    }
}

/// retained security-scoped URLs of this process, keyed by canonical path.
/// usize rather than a raw pointer so the static stays Send; the URLs are
/// retained on purpose and live until exit (a grant is process-lifetime).
static URLS: Mutex<Vec<(PathBuf, usize)>> = Mutex::new(Vec::new());

unsafe fn remember_url(p: &Path, url: *mut c_void) {
    if url.is_null() {
        return;
    }
    send0(url, "retain"); // the pool may drain; the grant must not
    let k = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    if let Ok(mut g) = URLS.lock() {
        if let Some(e) = g.iter_mut().find(|(x, _)| *x == k) {
            e.1 = url as usize;
        } else {
            g.push((k, url as usize));
        }
    }
}

/// a URL that carries the sandbox extension for `p`: the registered URL of `p`
/// itself, else the closest registered ancestor plus the remaining components
/// (appending keeps the scope), else a scope-less file URL.
unsafe fn url_for_path(p: &Path) -> *mut c_void {
    let want = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let mut best: Option<(PathBuf, usize)> = None;
    if let Ok(g) = URLS.lock() {
        for (base, url) in g.iter() {
            if want.starts_with(base)
                && best.as_ref().map_or(true, |(b, _)| base.as_os_str().len() > b.as_os_str().len())
            {
                best = Some((base.clone(), *url));
            }
        }
    }
    let Some((base, url)) = best else {
        return nsurl_path(&want);
    };
    if base == want {
        return url as *mut c_void;
    }
    let mut cur = url as *mut c_void;
    if let Ok(rel) = want.strip_prefix(&base) {
        for c in rel.components() {
            let s = nsstring(&c.as_os_str().to_string_lossy());
            cur = send_obj(cur, "URLByAppendingPathComponent:", s);
            if cur.is_null() {
                return nsurl_path(&want);
            }
        }
    }
    cur
}

/// macOS: the folder panel. MUST run on the main thread (the modal loop is the
/// app's own event loop); choose_dir_at() is the command wrapping that rule.
pub fn choose_dir(message: &str, start: Option<&Path>) -> Option<PathBuf> {
    unsafe {
        let pool = pool_new();
        let panel = send0(class("NSOpenPanel"), "openPanel");
        if panel.is_null() {
            pool_drain(pool);
            return None;
        }
        // launched from a terminal the app is not frontmost; a modal panel
        // behind another app reads as "nothing happened"
        let app = send0(class("NSApplication"), "sharedApplication");
        set_bool(app, "activateIgnoringOtherApps:", true);
        set_bool(panel, "setCanChooseFiles:", false);
        set_bool(panel, "setCanChooseDirectories:", true);
        set_bool(panel, "setAllowsMultipleSelection:", false);
        set_bool(panel, "setCanCreateDirectories:", true);
        set_bool(panel, "setResolvesAliases:", true);
        if let Some(s) = start {
            send_obj(panel, "setDirectoryURL:", nsurl_path(s));
        }
        send_obj(panel, "setMessage:", nsstring(message));
        let answer = send_i64_ret(panel, "runModal");
        let out = if answer == MODAL_OK {
            let url = send0(panel, "URL");
            match url_path(url) {
                Some(p) => {
                    remember_url(&p, url);
                    eprintln!("[sandbox] panel chose {}", p.display());
                    Some(p)
                }
                None => {
                    eprintln!("[sandbox] panel answered OK but returned no path");
                    None
                }
            }
        } else {
            eprintln!("[sandbox] panel cancelled (answer {answer})");
            None
        };
        pool_drain(pool);
        out
    }
}

/// a security-scoped bookmark for `p`, or None when this process holds no
/// grant for it (bookmark creation needs a security-scoped URL; the panel or
/// an earlier resolution put one into URLS)
pub fn bookmark(p: &Path) -> Option<Vec<u8>> {
    unsafe {
        let pool = pool_new();
        let url = url_for_path(p);
        let mut err: *mut c_void = std::ptr::null_mut();
        let f: SendMkBookmark = std::mem::transmute(objc_msgSend as *const ());
        let data = f(
            url,
            sel("bookmarkDataWithOptions:includingResourceValuesForKeys:relativeToURL:error:"),
            BOOKMARK_SECURITY_SCOPE,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut err,
        );
        let out = if data.is_null() {
            eprintln!("[sandbox] bookmark failed for {}: {}", p.display(), describe_error(err));
            None
        } else {
            let n = send_usize(data, "length");
            let b = send_ptr(data, "bytes");
            if n == 0 || b.is_null() {
                None
            } else {
                Some(std::slice::from_raw_parts(b as *const u8, n).to_vec())
            }
        };
        pool_drain(pool);
        out
    }
}

/// What resolving a saved bookmark produced. `stale` is macOS saying the file
/// moved since the bookmark was made — the grant still works, but the stored
/// bytes should be refreshed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Access {
    pub ok: bool,
    pub stale: bool,
}

/// resolve `bookmark` for `p` and start using it. The resolved NSURL is
/// retained in URLS, so it can later be re-minted for children of the folder.
/// A path this process already reached (panel or an earlier resolve) is a
/// no-op: resolving again would retain one more URL per call (the picker's
/// recents list asks on every open).
pub fn start_access(p: &Path, bookmark: &[u8]) -> Access {
    let k = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    if URLS.lock().map(|g| g.iter().any(|(x, _)| *x == k)).unwrap_or(false) {
        return Access { ok: true, stale: false };
    }
    unsafe {
        let pool = pool_new();
        let data = data_new(bookmark);
        let mut stale: i8 = 0;
        let mut err: *mut c_void = std::ptr::null_mut();
        let f: SendResolve = std::mem::transmute(objc_msgSend as *const ());
        let url = f(
            class("NSURL"),
            sel("URLByResolvingBookmarkData:options:relativeToURL:bookmarkDataIsStale:error:"),
            data,
            RESOLVE_SECURITY_SCOPE,
            std::ptr::null_mut(),
            &mut stale,
            &mut err,
        );
        let out = if url.is_null() {
            eprintln!("[sandbox] bookmark resolve failed for {}: {}", p.display(), describe_error(err));
            Access { ok: false, stale: false }
        } else {
            remember_url(p, url);
            let ok = send_i8(url, "startAccessingSecurityScopedResource") != 0;
            if !ok {
                eprintln!("[sandbox] startAccessingSecurityScopedResource refused for {}", p.display());
            }
            Access { ok, stale: stale != 0 }
        };
        if !data.is_null() {
            send0(data, "release");
        }
        pool_drain(pool);
        out
    }
}

/// `[NSThread isMainThread]`. A modal panel from any other thread would not run.
pub fn is_main_thread() -> bool {
    unsafe { send_i8(class("NSThread"), "isMainThread") != 0 }
}

/* ---------- boot probe (the one line that proves the sandbox is real) ---------- */

/// the user's real home, read from the password database: under App Sandbox
/// $HOME points INTO the container, so it cannot answer this
fn real_home() -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    unsafe {
        let pw = libc::getpwuid(libc::getuid());
        if pw.is_null() {
            return None;
        }
        let d = (*pw).pw_dir;
        if d.is_null() {
            return None;
        }
        Some(PathBuf::from(std::ffi::OsStr::from_bytes(CStr::from_ptr(d).to_bytes())))
    }
}

/// One line per boot: which sandbox this process is in, and whether a write
/// inside the container lands while a write to the real home is refused. A
/// sandbox that silently stopped confining would show up as "ALLOWED" here.
pub fn boot_probe() {
    let on = sandboxed();
    let container = std::env::var(CONTAINER_ENV).unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    eprintln!(
        "[sandbox] app-sandbox={} container={} home={}",
        if on { "on" } else { "off" },
        if container.is_empty() { "-" } else { &container },
        if home.is_empty() { "-" } else { &home }
    );
    if !on {
        return;
    }
    let inside = PathBuf::from(&home).join(format!(".opensidian-probe-{}", std::process::id()));
    match std::fs::write(&inside, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(&inside);
            eprintln!("[sandbox] write inside the container: ok");
        }
        Err(e) => eprintln!("[sandbox] write inside the container: FAILED ({})", errno(&e)),
    }
    if let Some(real) = real_home() {
        let outside = real.join(format!(".opensidian-probe-{}", std::process::id()));
        match std::fs::write(&outside, b"ok") {
            Ok(()) => {
                let _ = std::fs::remove_file(&outside);
                eprintln!("[sandbox] write outside ({}) : ALLOWED — writes are not confined", real.display());
            }
            Err(e) => eprintln!("[sandbox] write outside ({}) : denied ({}), as intended", real.display(), errno(&e)),
        }
    }
}

fn errno(e: &std::io::Error) -> String {
    match e.raw_os_error() {
        Some(n) => n.to_string(),
        None => e.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_round_trips_every_byte_and_every_length() {
        for n in 0..48usize {
            let bytes: Vec<u8> = (0..n).map(|i| (i * 37 + 11) as u8).collect();
            assert_eq!(b64_decode(&b64_encode(&bytes)).as_deref(), Some(bytes.as_slice()), "n={n}");
        }
        assert_eq!(b64_encode(b"Man"), "TWFu");
        assert_eq!(b64_encode(b"Ma"), "TWE=");
        assert_eq!(b64_encode(b"M"), "TQ==");
        assert_eq!(b64_decode("TWFu").as_deref(), Some(&b"Man"[..]));
        assert_eq!(b64_decode("TQ==").as_deref(), Some(&b"M"[..]));
    }

    #[test]
    fn base64_refuses_damaged_input() {
        assert_eq!(b64_decode("TW=F"), None, "padding inside the stream");
        assert_eq!(b64_decode("T"), None, "one sextet is not a byte");
        assert_eq!(b64_decode("TWF*"), None, "non-alphabet byte");
        // a hand-edited config must not produce half a bookmark
        assert_eq!(b64_decode("!!!!"), None);
    }

    /// the boot rule: ask only when sandboxed AND the stored grant did not work
    #[test]
    fn panel_is_asked_only_for_an_unreachable_vault() {
        assert!(needs_panel(true, false), "sandboxed, no usable bookmark -> panel");
        assert!(!needs_panel(true, true), "sandboxed, resumed -> open it");
        assert!(!needs_panel(false, false), "not sandboxed -> never a panel");
        assert!(!needs_panel(false, true));
    }

    /// the config key is the canonical path, so two spellings are one grant
    #[test]
    fn bookmark_key_is_canonical() {
        let d = std::env::temp_dir().join(format!("osb-key-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("Vault")).unwrap();
        assert_eq!(key(&d.join("Vault")), key(&d.join("Vault/../Vault")));
        let _ = std::fs::remove_dir_all(&d);
    }

    /// an unsandboxed test process must not claim to be sandboxed
    #[test]
    fn a_test_process_is_not_sandboxed() {
        assert!(!sandboxed(), "cargo test runs the unsandboxed binary; {CONTAINER_ENV} must be unset");
        assert_eq!(CONTAINER_ENV, "APP_SANDBOX_CONTAINER_ID");
    }
}
