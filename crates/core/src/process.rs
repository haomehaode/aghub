//! Helpers for spawning child processes from the GUI app.

use std::process::Command;

/// On Windows, set [`CREATE_NO_WINDOW`](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)
/// so CLI tools (`git`, `npx.cmd`, etc.) do not flash a console window.
/// No-op on other platforms.
pub fn suppress_child_console(cmd: &mut Command) {
	#[cfg(windows)]
	{
		use std::os::windows::process::CommandExt;
		const CREATE_NO_WINDOW: u32 = 0x0800_0000;
		cmd.creation_flags(CREATE_NO_WINDOW);
	}
}
