#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { createInterface } from "readline";
import semver from "semver";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAURI_CONF_PATH = path.join(
	__dirname,
	"..",
	"crates/desktop/src-tauri/tauri.conf.json",
);

function getCurrentVersion() {
	const conf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, "utf-8"));
	return conf.version;
}

function updateVersion(newVersion) {
	const conf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, "utf-8"));
	conf.version = newVersion;
	fs.writeFileSync(TAURI_CONF_PATH, JSON.stringify(conf, null, "\t") + "\n");
}

function commitAndTag(version) {
	const tagName = `v${version}`;
	const commitMessage = `chore: release ${tagName}`;
	execSync(`git add ${TAURI_CONF_PATH}`, { stdio: "inherit" });
	execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit" });
	execSync(`git tag ${tagName}`, { stdio: "inherit" });
	console.log(`\n✓ Created commit and tag: ${tagName}`);
	console.log(`  Push with: git push origin ${tagName}`);
}

async function promptBumpType() {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		console.log("\nSelect version bump type:");
		console.log("  1) patch - bug fixes (0.1.0 → 0.1.1)");
		console.log("  2) minor - new features (0.1.0 → 0.2.0)");
		console.log("  3) major - breaking changes (0.1.0 → 1.0.0)");
		console.log("");

		rl.question("Enter choice [1-3]: ", (answer) => {
			rl.close();
			const choice = answer.trim();
			const types = { 1: "patch", 2: "minor", 3: "major" };
			resolve(types[choice] || null);
		});
	});
}

async function main() {
	const currentVersion = getCurrentVersion();
	console.log(`Current version: ${currentVersion}`);

	const bumpType = await promptBumpType();

	if (!bumpType) {
		console.error("Invalid choice. Exiting.");
		process.exit(1);
	}

	const newVersion = semver.inc(currentVersion, bumpType);
	console.log(`\nNew version: ${newVersion}`);

	updateVersion(newVersion);
	console.log(`✓ Updated tauri.conf.json`);

	commitAndTag(newVersion);
}

main().catch(console.error);
