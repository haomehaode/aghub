//! Local workspace helpers: Git CLI and Claude Code headless (`claude -p`).
//! Runs with `cwd` set to the registered project directory.
//! Uses `--permission-mode` (see Claude Code docs): default UI path uses
//! `bypassPermissions` so Claude can read/write freely; `plan` is
//! analysis-only. Sessions use `--session-id` / `-r` for multi-turn
//! context. Override with env `AGHUB_CLAUDE_PERMISSION_MODE`.

use serde::Serialize;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

/// Max directory entries returned by [`workspace_list_project_entries`].
const MAX_LIST_ENTRIES: usize = 2000;

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceDirEntry {
	pub name: String,
	/// Relative to project root, `/`-separated (no leading slash).
	pub path_relative: String,
	pub is_directory: bool,
}

fn normalize_rel_components(relative: &str) -> Result<PathBuf, String> {
	let trimmed = relative.trim().trim_start_matches(['/', '\\']);
	let mut out = PathBuf::new();
	for c in Path::new(trimmed).components() {
		match c {
			Component::Normal(x) => out.push(x),
			Component::CurDir => {}
			Component::ParentDir
			| Component::Prefix(_)
			| Component::RootDir => {
				return Err("invalid relative path".into());
			}
		}
	}
	Ok(out)
}

fn resolve_under_project(
	root: &Path,
	relative: &str,
) -> Result<PathBuf, String> {
	validate_project_dir(root)?;
	let tail = normalize_rel_components(relative)?;
	let candidate = root.join(&tail);
	let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
	let full_canon = candidate.canonicalize().map_err(|e| e.to_string())?;
	if !full_canon.starts_with(&root_canon) {
		return Err("path outside project root".into());
	}
	Ok(full_canon)
}

fn rel_path_posix(
	root_canon: &Path,
	full_canon: &Path,
) -> Result<String, String> {
	let rel = full_canon
		.strip_prefix(root_canon)
		.map_err(|_| "failed to strip project prefix".to_string())?;
	let s = rel.to_string_lossy().replace('\\', "/");
	Ok(if s.is_empty() { String::new() } else { s })
}

fn validate_project_dir(path: &Path) -> Result<(), String> {
	if !path.is_absolute() {
		return Err("project path must be absolute".into());
	}
	if !path.exists() {
		return Err("project path does not exist".into());
	}
	if !path.is_dir() {
		return Err("project path is not a directory".into());
	}
	Ok(())
}

fn run_git(project_path: &Path, args: &[&str]) -> Result<String, String> {
	let output = Command::new("git")
		.current_dir(project_path)
		.args(args)
		.output()
		.map_err(|e| {
			format!("Failed to run git: {e}. Is git installed and on PATH?")
		})?;
	let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
	let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
	if !output.status.success() {
		return Err(format!(
			"git failed ({}).\n{stdout}\n{stderr}",
			output.status
		));
	}
	Ok(stdout)
}

#[tauri::command]
pub fn workspace_git_status(project_path: String) -> Result<String, String> {
	let path = PathBuf::from(project_path);
	validate_project_dir(&path)?;
	run_git(&path, &["status", "--short", "--branch"])
}

#[tauri::command]
pub fn workspace_git_diff(project_path: String) -> Result<String, String> {
	let path = PathBuf::from(project_path);
	validate_project_dir(&path)?;
	run_git(&path, &["diff"])
}

#[tauri::command]
pub fn workspace_git_commit(
	project_path: String,
	message: String,
) -> Result<String, String> {
	let msg = message.trim();
	if msg.is_empty() {
		return Err("Commit message cannot be empty.".into());
	}
	let path = PathBuf::from(project_path);
	validate_project_dir(&path)?;
	run_git(&path, &["add", "-A"])?;
	run_git(&path, &["commit", "-m", msg])
}

fn claude_cli_candidates() -> Vec<OsString> {
	if let Ok(p) = std::env::var("AGHUB_CLAUDE_BIN") {
		let t = p.trim();
		if !t.is_empty() {
			return vec![t.into()];
		}
	}
	let mut v: Vec<OsString> = Vec::new();
	#[cfg(windows)]
	{
		// Same order as `where claude` when npm global is on PATH.
		v.push("claude.cmd".into());
		v.push("claude.exe".into());
		v.push("claude".into());
		// GUI apps often inherit a shorter PATH than your terminal; APPDATA
		// is still set, so npm's shim is a reliable fallback.
		if let Ok(appdata) = std::env::var("APPDATA") {
			let npm = PathBuf::from(appdata).join("npm");
			v.push(npm.join("claude.cmd").into_os_string());
			v.push(npm.join("claude").into_os_string());
		}
	}
	#[cfg(not(windows))]
	{
		v.push("claude".into());
	}
	v
}

fn validate_claude_session_id(raw: &str) -> Result<(), String> {
	let t = raw.trim();
	if t.len() != 36 {
		return Err(
			"Chat session id must be a UUID (use a new chat if this error \
persists)."
				.into(),
		);
	}
	let hy = [8_usize, 13, 18, 23];
	let is_hex =
		|c: u8| matches!(c, b'0'..=b'9' | b'a'..=b'f' | b'A'..=b'F');
	for (i, &ch) in t.as_bytes().iter().enumerate() {
		if hy.contains(&i) {
			if ch != b'-' {
				return Err("Invalid session id.".into());
			}
		} else if !is_hex(ch) {
			return Err("Invalid session id.".into());
		}
	}
	Ok(())
}

fn normalize_claude_permission_mode(raw: &str) -> Result<String, String> {
	let m = raw.trim();
	if m.is_empty() {
		return Err("permission mode cannot be empty.".into());
	}
	let allowed = [
		"default",
		"acceptEdits",
		"plan",
		"auto",
		"dontAsk",
		"bypassPermissions",
	];
	if allowed.contains(&m) {
		return Ok(m.to_string());
	}
	Err(format!(
		"Invalid permission mode {m:?}. Expected one of {}.",
		allowed.join(", ")
	))
}

fn claude_permission_mode_from_env_or(
	fallback: &str,
) -> Result<String, String> {
	if let Ok(v) = std::env::var("AGHUB_CLAUDE_PERMISSION_MODE") {
		let t = v.trim();
		if !t.is_empty() {
			return normalize_claude_permission_mode(t);
		}
	}
	normalize_claude_permission_mode(fallback)
}

fn claude_stdout_as_text_fallback(jsonish: &str) -> Option<String> {
	let t = jsonish.trim();
	if !t.starts_with('{') {
		return None;
	}
	let v: serde_json::Value = serde_json::from_str(t).ok()?;
	if let Some(s) = v.get("result").and_then(|x| x.as_str()) {
		if !s.trim().is_empty() {
			return Some(s.to_string());
		}
	}
	None
}

fn claude_append_print_flags(cmd: &mut Command) {
	cmd.arg("--output-format").arg("text");
	// Extra stderr detail so headless runs are not silently empty when
	// Claude mostly logs to stderr. Disable with AGHUB_CLAUDE_VERBOSE=0.
	let verbose_on = match std::env::var("AGHUB_CLAUDE_VERBOSE") {
		Ok(ref v) => {
			let s = v.trim().to_lowercase();
			!(s.is_empty()
				|| s == "0" || s == "false" || s == "no")
		}
		Err(_) => true,
	};
	if verbose_on {
		cmd.arg("--verbose");
	}
}

fn interpret_claude_output(
	output: std::process::Output,
) -> Result<String, String> {
	let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
	let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

	let out_blank = stdout.trim().is_empty();
	let err_blank = stderr.trim().is_empty();

	if !output.status.success() {
		let combined = match (out_blank, err_blank) {
			(true, true) => String::new(),
			(false, true) => stdout,
			(true, false) => stderr,
			(false, false) => format!("{stdout}\n---\n{stderr}"),
		};
		return Err(format!(
			"Claude Code exited with {}.\n{combined}",
			output.status
		));
	}

	let merged = match (out_blank, err_blank) {
		(true, true) => String::new(),
		(false, true) => {
			if stdout.trim().starts_with('{') {
				claude_stdout_as_text_fallback(&stdout).unwrap_or(stdout)
			} else {
				stdout
			}
		}
		(true, false) => stderr,
		(false, false) => format!(
			"{stdout}\n\n--- Claude Code (stderr) ---\n{stderr}",
		),
	};

	if merged.trim().is_empty() {
		return Ok(String::new());
	}
	Ok(merged.trim_end().into())
}

fn run_claude_blocking(
	project_path: PathBuf,
	session_id: String,
	continue_session: bool,
	permission_mode: String,
	prompt: String,
) -> Result<String, String> {
	validate_claude_session_id(&session_id)?;
	let perm = claude_permission_mode_from_env_or(&permission_mode)?;

	let candidates = claude_cli_candidates();
	let tried: Vec<String> = candidates
		.iter()
		.map(|c| c.to_string_lossy().into_owned())
		.collect();
	for exe in &candidates {
		let mut cmd = Command::new(exe);
		cmd.current_dir(&project_path);
		// Match IDE extension: respect ~/.claude and project `.claude/`.
		cmd.arg("--setting-sources").arg("user,project");
		cmd.arg("--permission-mode").arg(&perm);
		if continue_session {
			cmd.arg("-r").arg(&session_id);
		} else {
			cmd.arg("--session-id").arg(&session_id);
		}
		claude_append_print_flags(&mut cmd);
		cmd.arg("-p").arg(&prompt);

		match cmd.output() {
			Ok(output) => return interpret_claude_output(output),
			Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
			Err(e) => {
				return Err(format!(
					"Failed to start Claude Code ({:?}): {e}",
					exe.to_string_lossy()
				));
			}
		}
	}
	Err(format!(
		"Could not find Claude Code CLI (tried: {}). \
Install it from Anthropic, or set AGHUB_CLAUDE_BIN to the full path \
(e.g. npm global: %APPDATA%\\npm\\claude.cmd on Windows). \
Desktop apps often see a shorter PATH than your terminal.",
		tried.join(", ")
	))
}

#[tauri::command]
pub async fn workspace_run_claude_code(
	project_path: String,
	session_id: String,
	continue_session: bool,
	permission_mode: String,
	prompt: String,
) -> Result<String, String> {
	let prompt = prompt.trim().to_string();
	if prompt.is_empty() {
		return Err("Prompt cannot be empty.".into());
	}
	let path = PathBuf::from(&project_path);
	validate_project_dir(&path)?;
	tokio::task::spawn_blocking(move || {
		run_claude_blocking(
			path,
			session_id,
			continue_session,
			permission_mode,
			prompt,
		)
	})
	.await
	.map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub fn workspace_list_project_entries(
	project_path: String,
	relative_dir: String,
) -> Result<Vec<WorkspaceDirEntry>, String> {
	let root = PathBuf::from(&project_path);
	validate_project_dir(&root)?;
	let dir = resolve_under_project(&root, &relative_dir)?;
	if !dir.is_dir() {
		return Err("not a directory".into());
	}
	let root_canon = root.canonicalize().map_err(|e| e.to_string())?;

	let mut entries: Vec<WorkspaceDirEntry> = Vec::new();
	for rd in fs::read_dir(&dir).map_err(|e| e.to_string())? {
		let rd = rd.map_err(|e| e.to_string())?;
		let meta = rd.metadata().map_err(|e| e.to_string())?;
		let name = rd.file_name().to_string_lossy().into_owned();
		let full_canon = rd.path().canonicalize().map_err(|e| e.to_string())?;
		if !full_canon.starts_with(&root_canon) {
			continue;
		}
		let path_relative = rel_path_posix(&root_canon, &full_canon)?;
		entries.push(WorkspaceDirEntry {
			name,
			path_relative,
			is_directory: meta.is_dir(),
		});
		if entries.len() >= MAX_LIST_ENTRIES {
			break;
		}
	}

	entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
		(true, false) => std::cmp::Ordering::Less,
		(false, true) => std::cmp::Ordering::Greater,
		_ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
	});

	Ok(entries)
}

#[tauri::command]
pub fn workspace_read_project_file(
	project_path: String,
	relative_path: String,
) -> Result<String, String> {
	let root = PathBuf::from(&project_path);
	let path = resolve_under_project(&root, &relative_path)?;
	if !path.is_file() {
		return Err("not a file".into());
	}
	let bytes = fs::read(&path).map_err(|e| e.to_string())?;
	String::from_utf8(bytes)
		.map_err(|_| "file is not valid UTF-8 (binary files not shown)".into())
}

/// Read a UTF-8 text file from an absolute path (e.g. user-picked via dialog).
#[tauri::command]
pub fn workspace_read_text_file(path: String) -> Result<String, String> {
	let p = PathBuf::from(path.trim());
	if !p.is_absolute() {
		return Err("path must be absolute".into());
	}
	let meta = p.metadata().map_err(|e| e.to_string())?;
	if !meta.is_file() {
		return Err("not a file".into());
	}
	let bytes = fs::read(&p).map_err(|e| e.to_string())?;
	String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".into())
}
