// SPDX-License-Identifier: GPL-3.0-or-later
/* opensidian-mcp — a read-only MCP (stdio) server over a vault, so 豆包工作
   ("Doubao Work") can search and read the notes while the app stays the place
   where they are edited.

   Why a separate executable rather than a mode of the app: 豆包工作 plugs a
   local program in as "STDIO", giving it a command and arguments. That child
   is launched by 豆包工作, not by us, so it inherits nothing from the app —
   in particular it cannot use the App Sandbox's folder grant, which is a
   bookmark the GUI process resolved. A second binary is also the only way to
   have a different signature: the app carries com.apple.security.app-sandbox,
   this one deliberately does not, so it can read the folder the user names.
   Same trust model as any local MCP server (Notion's npx server, etc.): it
   runs with your user's rights, over one folder you point it at.

   READ-ONLY by design (first version): list_notes, read_note, search_notes.
   Nothing here writes into the vault, so 豆包工作 cannot corrupt a note or
   race the app's editor/watcher. Tools that write come after this is proven.

   Wire format: MCP stdio = one JSON-RPC 2.0 message per line on stdin, one
   response per line on stdout, diagnostics on stderr only. No Content-Length
   framing, no HTTP.

   Usage:
     opensidian-mcp <vault>          what 豆包工作's 参数 field holds
     opensidian-mcp --vault <vault>  same, spelled out
     OPENSIDIAN_VAULT=<vault>        fallback when no argument is given */

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

/// folders that are never notes: the app's own config, git metadata, trash and
/// dependency trees. Listings and searches skip them; read_note still refuses
/// to leave the vault, but does not otherwise police what a reader asks for.
const SKIP_DIRS: [&str; 4] = [".obsidian", ".git", ".trash", "node_modules"];
/// what counts as a note for list/search (the app's own files are .md; the
/// extra extensions are what people keep beside them and still call notes)
const NOTE_EXT: [&str; 3] = ["md", "markdown", "canvas"];
/// a single note bigger than this is not a note the model should pull whole
const MAX_READ: u64 = 2 * 1024 * 1024;
const DEFAULT_READ: u64 = 200 * 1024;
const MAX_LIST: usize = 2000;
const DEFAULT_LIST: usize = 500;
const MAX_HITS: usize = 100;
const DEFAULT_HITS: usize = 20;

fn main() {
    let vault = match vault_from_args() {
        Ok(Some(v)) => v,
        Ok(None) => {
            eprintln!("opensidian-mcp: usage: opensidian-mcp <vault> (or --vault <vault>, or OPENSIDIAN_VAULT)");
            std::process::exit(2);
        }
        Err(e) => {
            eprintln!("opensidian-mcp: {e}");
            std::process::exit(2);
        }
    };
    eprintln!("opensidian-mcp: vault {}", vault.display());
    serve(&vault);
}

/// resolve the vault argument: positional, --vault, or the environment. The
/// path is canonicalised once so every later containment check is exact.
fn vault_from_args() -> Result<Option<PathBuf>, String> {
    let mut args = std::env::args().skip(1);
    let mut raw: Option<String> = None;
    while let Some(a) = args.next() {
        match a.as_str() {
            "--vault" => raw = args.next(),
            "-h" | "--help" => return Ok(None),
            other if other.starts_with("--") => return Err(format!("unknown flag {other}")),
            other => raw = Some(other.to_string()),
        }
    }
    let raw = raw.or_else(|| std::env::var("OPENSIDIAN_VAULT").ok());
    let Some(raw) = raw.filter(|s| !s.trim().is_empty()) else {
        return Ok(None);
    };
    let p = PathBuf::from(raw.trim());
    let canon = p.canonicalize().map_err(|e| format!("vault {}: {e}", p.display()))?;
    if !canon.is_dir() {
        return Err(format!("vault {} is not a folder", canon.display()));
    }
    Ok(Some(canon))
}

/// the request loop: stdin lines in, stdout lines out, until EOF. A malformed
/// line answers -32700 with a null id (JSON-RPC); a notification (no id) is
/// never answered.
fn serve(vault: &Path) {
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout());
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("opensidian-mcp: stdin: {e}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(v) => handle(vault, &v),
            Err(e) => Some(error(null_id(), -32700, &format!("parse error: {e}"))),
        };
        if let Some(r) = reply {
            if write_line(&mut out, &r).is_err() {
                break;
            }
        }
    }
}

fn write_line(out: &mut impl Write, v: &Value) -> std::io::Result<()> {
    serde_json::to_writer(&mut *out, v)?;
    out.write_all(b"\n")?;
    out.flush()
}

fn null_id() -> Value {
    Value::Null
}

fn rpc_result(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

/// one inbound message -> one outbound message (None for notifications).
fn handle(vault: &Path, msg: &Value) -> Option<Value> {
    let method = msg.get("method")?.as_str()?;
    let id = msg.get("id").cloned();
    // no id: a notification (initialized, cancelled, ...) — never answer
    let id = id?;
    let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));
    let reply = match method {
        "initialize" => {
            // echo the client's protocol version when it names one: the tools
            // surface is stable across MCP revisions, and a client that gets
            // its own version back will not reject the session
            let version = params
                .get("protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("2025-06-18");
            rpc_result(
                id,
                json!({
                    "protocolVersion": version,
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "opensidian-mcp", "version": env!("CARGO_PKG_VERSION")},
                    "instructions": "Read-only access to one Opensidian vault. Use list_notes to see what is there, search_notes to find text, read_note to read a file. Note paths are relative to the vault."
                }),
            )
        }
        "ping" => rpc_result(id, json!({})),
        "tools/list" => rpc_result(id, json!({"tools": tools()})),
        "tools/call" => match call_tool(vault, &params) {
            Ok(text) => rpc_result(id, json!({"content": [{"type": "text", "text": text}], "isError": false})),
            Err(e) => rpc_result(id, json!({"content": [{"type": "text", "text": e}], "isError": true})),
        },
        other => error(id, -32601, &format!("method not found: {other}")),
    };
    Some(reply)
}

fn tools() -> Value {
    json!([
        {
            "name": "list_notes",
            "description": "List notes in the vault (relative paths, sorted). Use it to see what exists before reading.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "list only this relative folder; omit for the whole vault"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIST, "description": "max paths to return (default 500)"}
                },
                "additionalProperties": false
            }
        },
        {
            "name": "read_note",
            "description": "Read one note as UTF-8 text. Large files are truncated and say so.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "path relative to the vault, as list_notes returned"},
                    "max_bytes": {"type": "integer", "minimum": 1, "maximum": MAX_READ, "description": "truncate after this many bytes (default 200000)"}
                },
                "required": ["path"],
                "additionalProperties": false
            }
        },
        {
            "name": "search_notes",
            "description": "Case-insensitive substring search over note text. Returns file, line number and the matching line.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "text to look for (not a regex)"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_HITS, "description": "max matches (default 20)"},
                    "case_sensitive": {"type": "boolean", "description": "match case exactly (default false)"}
                },
                "required": ["query"],
                "additionalProperties": false
            }
        }
    ])
}

fn call_tool(vault: &Path, params: &Value) -> Result<String, String> {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
    match name {
        "list_notes" => list_notes(vault, &args),
        "read_note" => read_note(vault, &args),
        "search_notes" => search_notes(vault, &args),
        "" => Err("tools/call needs a tool name".into()),
        other => Err(format!("unknown tool: {other}")),
    }
}

fn list_notes(vault: &Path, args: &Value) -> Result<String, String> {
    let start = match args.get("folder").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
        Some(f) => resolve(vault, f)?,
        None => vault.to_path_buf(),
    };
    if !start.is_dir() {
        return Err(format!("{} is not a folder", rel(vault, &start)));
    }
    let limit = usize_arg(args, "limit", DEFAULT_LIST, MAX_LIST);
    let mut paths = Vec::new();
    walk(start, &mut |p| {
        if is_note(p) {
            paths.push(rel(vault, p));
        }
    });
    paths.sort();
    let total = paths.len();
    paths.truncate(limit);
    Ok(serde_json::to_string_pretty(&json!({
        "vault": vault.display().to_string(),
        "total": total,
        "shown": paths.len(),
        "notes": paths,
    }))
    .unwrap_or_default())
}

fn read_note(vault: &Path, args: &Value) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "read_note needs \"path\"".to_string())?;
    let p = resolve(vault, path)?;
    if !p.is_file() {
        return Err(format!("{path} is not a file in this vault"));
    }
    let max = usize_arg(args, "max_bytes", DEFAULT_READ as usize, MAX_READ as usize);
    let meta = std::fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    let take = meta.len().min(max as u64);
    let mut buf = vec![0u8; take as usize];
    use std::io::Read;
    std::fs::File::open(&p)
        .and_then(|mut f| f.read_exact(&mut buf))
        .map_err(|e| format!("{path}: {e}"))?;
    let mut text = String::from_utf8_lossy(&buf).into_owned();
    if meta.len() > take {
        text.push_str(&format!("\n\n[truncated at {take} of {} bytes]", meta.len()));
    }
    Ok(text)
}

fn search_notes(vault: &Path, args: &Value) -> Result<String, String> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .filter(|q| !q.trim().is_empty())
        .ok_or_else(|| "search_notes needs a non-empty \"query\"".to_string())?;
    let limit = usize_arg(args, "limit", DEFAULT_HITS, MAX_HITS);
    let case_sensitive = args.get("case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false);
    let needle = if case_sensitive { query.to_string() } else { query.to_lowercase() };
    let mut files = Vec::new();
    walk(vault.to_path_buf(), &mut |p| {
        if is_note(p) {
            files.push(p.to_path_buf());
        }
    });
    files.sort();
    let mut hits = Vec::new();
    let mut capped = false;
    for f in files {
        if hits.len() >= limit {
            capped = true;
            break;
        }
        let Ok(meta) = std::fs::metadata(&f) else { continue };
        if meta.len() > MAX_READ {
            continue; // a note this large is not something to scan on a call
        }
        let Ok(bytes) = std::fs::read(&f) else { continue };
        let text = String::from_utf8_lossy(&bytes);
        for (i, line) in text.lines().enumerate() {
            let hay = if case_sensitive { line.to_string() } else { line.to_lowercase() };
            if hay.contains(&needle) {
                hits.push(json!({
                    "path": rel(vault, &f),
                    "line": i + 1,
                    "text": clip(line),
                }));
                if hits.len() >= limit {
                    capped = true;
                    break;
                }
            }
        }
    }
    Ok(serde_json::to_string_pretty(&json!({
        "query": query,
        "count": hits.len(),
        "capped": capped,
        "matches": hits,
    }))
    .unwrap_or_default())
}

/// resolve a client path inside the vault. Absolute paths and `..` escapes are
/// refused, and canonicalising both ends also catches symlinks that point out.
fn resolve(vault: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let raw = rel_path.trim();
    if raw.is_empty() {
        return Err("path is empty".into());
    }
    let p = Path::new(raw);
    if p.is_absolute() {
        return Err("path must be relative to the vault".into());
    }
    let joined = vault.join(p);
    let canon = joined
        .canonicalize()
        .map_err(|e| format!("{raw}: {e}"))?;
    if !canon.starts_with(vault) {
        return Err("path escapes the vault".into());
    }
    Ok(canon)
}

/// recursive walk that skips SKIP_DIRS; errors are skipped, not fatal (one
/// unreadable folder must not fail a listing)
fn walk(dir: PathBuf, f: &mut impl FnMut(&Path)) {
    let Ok(rd) = std::fs::read_dir(&dir) else { return };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if p.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk(p, f);
        } else if p.is_file() {
            f(&p);
        }
    }
}

fn is_note(p: &Path) -> bool {
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    NOTE_EXT.contains(&ext.as_str())
}

fn rel(vault: &Path, p: &Path) -> String {
    p.strip_prefix(vault)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/")
}

fn clip(line: &str) -> String {
    const MAX: usize = 300;
    if line.chars().count() <= MAX {
        return line.to_string();
    }
    let mut s: String = line.chars().take(MAX).collect();
    s.push('…');
    s
}

/// an integer tool argument, clamped to the documented range. A client that
/// sends 0, a negative or a huge number still gets a bounded answer.
fn usize_arg(args: &Value, key: &str, default: usize, max: usize) -> usize {
    let n = args.get(key).and_then(|v| v.as_u64()).map(|n| n as usize).unwrap_or(default);
    n.clamp(1, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static N: AtomicUsize = AtomicUsize::new(0);

    fn vault(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "osb-mcp-{tag}-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join(".obsidian")).unwrap();
        std::fs::create_dir_all(d.join("notes/ideas")).unwrap();
        std::fs::write(d.join("index.md"), "# Home\n\nA note about coffee.\n").unwrap();
        std::fs::write(d.join("notes/ideas/tea.md"), "Tea and COFFEE both.\n").unwrap();
        std::fs::write(d.join(".obsidian/app.json"), "{\"x\":1}").unwrap();
        std::fs::write(d.join("notes/skip.txt"), "not a note").unwrap();
        d.canonicalize().unwrap()
    }

    fn call(v: &Path, name: &str, args: Value) -> String {
        call_tool(v, &json!({"name": name, "arguments": args})).unwrap()
    }

    #[test]
    fn initialize_echoes_the_client_version_and_advertises_tools() {
        let v = vault("init");
        let r = handle(
            &v,
            &json!({"jsonrpc":"2.0","id":7,"method":"initialize","params":{"protocolVersion":"2026-01-01"}}),
        )
        .unwrap();
        assert_eq!(r["id"], 7);
        assert_eq!(r["result"]["protocolVersion"], "2026-01-01");
        assert!(r["result"]["capabilities"]["tools"].is_object());
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn notifications_are_never_answered() {
        let v = vault("note");
        assert!(handle(&v, &json!({"jsonrpc":"2.0","method":"notifications/initialized"})).is_none());
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn list_notes_skips_config_and_non_notes() {
        let v = vault("list");
        let out = call(&v, "list_notes", json!({}));
        let j: Value = serde_json::from_str(&out).unwrap();
        let notes: Vec<String> = j["notes"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
        assert_eq!(notes, vec!["index.md", "notes/ideas/tea.md"]);
        assert_eq!(j["total"], 2);
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn list_notes_can_be_scoped_to_a_folder() {
        let v = vault("folder");
        let j: Value = serde_json::from_str(&call(&v, "list_notes", json!({"folder":"notes"}))).unwrap();
        assert_eq!(j["notes"], json!(["notes/ideas/tea.md"]));
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn read_note_returns_text_and_refuses_escapes() {
        let v = vault("read");
        let text = call(&v, "read_note", json!({"path":"notes/ideas/tea.md"}));
        assert!(text.contains("Tea and COFFEE"));
        let err = call_tool(&v, &json!({"name":"read_note","arguments":{"path":"../../etc/passwd"}})).unwrap_err();
        assert!(err.contains("escapes") || err.contains("No such"), "{err}");
        let abs = call_tool(&v, &json!({"name":"read_note","arguments":{"path":"/etc/hosts"}})).unwrap_err();
        assert!(abs.contains("relative"), "{abs}");
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn read_note_truncates_and_says_so() {
        let v = vault("trunc");
        std::fs::write(v.join("big.md"), "x".repeat(4000)).unwrap();
        let text = call(&v, "read_note", json!({"path":"big.md","max_bytes":100}));
        assert!(text.starts_with(&"x".repeat(100)));
        assert!(text.contains("[truncated at 100 of 4000 bytes]"), "{text}");
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn search_is_case_insensitive_by_default_and_reports_lines() {
        let v = vault("search");
        let j: Value = serde_json::from_str(&call(&v, "search_notes", json!({"query":"coffee"}))).unwrap();
        assert_eq!(j["count"], 2);
        let paths: Vec<&str> = j["matches"].as_array().unwrap().iter().map(|m| m["path"].as_str().unwrap()).collect();
        assert_eq!(paths, vec!["index.md", "notes/ideas/tea.md"]);
        assert_eq!(j["matches"][0]["line"], 3);
        // only index.md has the lowercase word; "COFFEE" in tea.md must not match
        let exact: Value = serde_json::from_str(&call(&v, "search_notes", json!({"query":"coffee","case_sensitive":true}))).unwrap();
        assert_eq!(exact["count"], 1);
        assert_eq!(exact["matches"][0]["path"], "index.md");
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn unknown_tool_and_method_fail_in_band() {
        let v = vault("err");
        let err = call_tool(&v, &json!({"name":"nope"})).unwrap_err();
        assert!(err.contains("unknown tool"), "{err}");
        let r = handle(&v, &json!({"jsonrpc":"2.0","id":1,"method":"nope"})).unwrap();
        assert_eq!(r["error"]["code"], -32601);
        let _ = std::fs::remove_dir_all(&v);
    }

    #[test]
    fn limits_are_clamped_not_trusted() {
        let v = vault("clamp");
        let out = call(&v, "list_notes", json!({"limit": 0}));
        let j: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(j["shown"], 1, "0 clamps to 1, not to every note");
        let _ = std::fs::remove_dir_all(&v);
    }
}
