use std::process::Command;

use aghub_core::suppress_child_console;
use rocket::serde::json::Json;

use crate::dto::integrations::{
	CodeEditorType, OpenWithEditorRequest, ToolInfoDto, ToolPreferencesDto,
};

#[get("/integrations/code-editors")]
pub fn list_code_editors() -> Json<Vec<ToolInfoDto>> {
	let editors: Vec<ToolInfoDto> = CodeEditorType::all()
		.iter()
		.map(ToolInfoDto::from)
		.collect();
	Json(editors)
}

#[post("/integrations/open-with-editor", format = "json", data = "<request>")]
pub async fn open_with_editor(
	request: Json<OpenWithEditorRequest>,
) -> Result<(), String> {
	let req = request.into_inner();
	let target_path = normalize_editor_open_path(&req.path);
	let detected_path = ToolInfoDto::from(&req.editor).path;
	let cmd = detected_path.unwrap_or_else(|| req.editor.cli_command().to_string());

	run_open_command(&req.editor, &cmd, &target_path)
}

#[get("/integrations/preferences")]
pub fn get_preferences() -> Json<ToolPreferencesDto> {
	Json(ToolPreferencesDto::default())
}

fn build_open_command(cmd: &str, path: &str) -> Command {
	#[cfg(target_os = "macos")]
	{
		// macOS app bundle paths (e.g. /Applications/Cursor.app) are not
		// executable binaries, so open via LaunchServices instead.
		if cmd.ends_with(".app") {
			let mut child = Command::new("open");
			child.args(["-a", cmd, path]);
			return child;
		}
	}

	#[cfg(target_os = "linux")]
	{
		// Flatpak identifiers are stored as flatpak::<app-id>.
		if let Some(app_id) = cmd.strip_prefix("flatpak::") {
			let mut child = Command::new("flatpak");
			child.args(["run", app_id, path]);
			return child;
		}
	}

	let mut child = Command::new(cmd);
	child.arg(path);
	child
}

fn normalize_editor_open_path(path: &str) -> String {
	let p = std::path::Path::new(path);
	if p.is_file() {
		if let Some(parent) = p.parent() {
			return parent.to_string_lossy().to_string();
		}
	}
	path.to_string()
}

fn run_open_command(
	editor: &CodeEditorType,
	cmd: &str,
	path: &str,
) -> Result<(), String> {
	let mut attempts = Vec::new();
	attempts.push(build_open_command(cmd, path));

	#[cfg(target_os = "macos")]
	{
		if cmd.ends_with(".app") {
			if let Some(app_name) = std::path::Path::new(cmd)
				.file_stem()
				.and_then(|s| s.to_str())
				.filter(|s| !s.trim().is_empty())
			{
				let mut open_with_name_path = Command::new("open");
				open_with_name_path.args(["-a", app_name, path]);
				attempts.push(open_with_name_path);

				let mut open_with_name = Command::new("open");
				open_with_name.args(["-a", app_name]);
				attempts.push(open_with_name);
			}
		}
	}

	let cli = editor.cli_command();
	if cli != cmd {
		let mut cli_with_path = Command::new(cli);
		cli_with_path.arg(path);
		attempts.push(cli_with_path);
	}

	let mut last_err = String::new();
	for mut command in attempts {
		suppress_child_console(&mut command);
		match command.output() {
			Ok(output) if output.status.success() => return Ok(()),
			Ok(output) => {
				let stdout = String::from_utf8_lossy(&output.stdout);
				let stderr = String::from_utf8_lossy(&output.stderr);
				last_err = format!(
					"status: {}, stdout: {}, stderr: {}",
					output.status,
					stdout.trim(),
					stderr.trim()
				);
			}
			Err(e) => {
				last_err = e.to_string();
			}
		}
	}

	Err(format!(
		"Failed to open editor '{}' with path '{}'. Last attempt error: {}",
		cmd, path, last_err
	))
}
