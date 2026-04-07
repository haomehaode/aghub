use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use rocket::http::Status;
use rocket::serde::json::Json;
use skill::{parse_skill_dir, sanitize_name, scan_skills, ScanOptions};
use skills_sh::{summary, Client, SearchParams};

use crate::dto::market::{MarketSkill, MarketSkillSummary};
use crate::error::ApiError;
use tempfile::TempDir;

const LOCAL_SKILLS_REPO_ENV: &str = "AGHUB_LOCAL_SKILLS_REPO";
const LOCAL_SKILLS_REPO_GIT_URL_ENV: &str = "AGHUB_LOCAL_SKILLS_REPO_GIT_URL";

pub(crate) fn clone_internal_repo(repo_url: &str) -> Result<TempDir, ApiError> {
	if repo_url.starts_with("ssh://") || repo_url.starts_with("git@") {
		let temp_dir = tempfile::tempdir().map_err(|e| {
			ApiError::new(
				Status::InternalServerError,
				format!("Failed to create temporary directory: {e}"),
				"TEMP_DIR_CREATE_FAILED",
			)
		})?;
		let status = std::process::Command::new("git")
			.args(["clone", "--depth", "1", repo_url])
			.arg(temp_dir.path())
			.status()
			.map_err(|e| {
				ApiError::new(
					Status::BadGateway,
					format!("Failed to execute git clone: {e}"),
					"LOCAL_SKILLS_GIT_CLONE_FAILED",
				)
			})?;
		if !status.success() {
			return Err(ApiError::new(
				Status::BadGateway,
				format!("git clone failed for repository: {repo_url}"),
				"LOCAL_SKILLS_GIT_CLONE_FAILED",
			));
		}
		return Ok(temp_dir);
	}

	aghub_git::clone_to_temp(aghub_git::CloneOptions::new(repo_url)).map_err(
		|e| {
			ApiError::new(
				Status::BadGateway,
				format!("Failed to clone local skills repository: {e}"),
				"LOCAL_SKILLS_GIT_CLONE_FAILED",
			)
		},
	)
}

/// Search skills from marketplace
/// `source` defaults to "skills-sh", extensible for future providers
#[get("/skills-market/search?<q>&<limit>&<source>&<repo_url>")]
pub async fn search_skill_market(
	q: &str,
	limit: Option<usize>,
	source: Option<&str>,
	repo_url: Option<&str>,
) -> Result<Json<Vec<MarketSkill>>, ApiError> {
	let provider = source.unwrap_or("skills-sh");

	match provider {
		"skills-sh" => search_skills_sh(q, limit).await,
		"local" => {
			let q = q.to_string();
			let repo_url = repo_url.map(str::to_string);
			tokio::task::spawn_blocking(move || {
				search_local_skills_repo(&q, limit, repo_url.as_deref())
			})
			.await
			.map_err(|e| {
				ApiError::new(
					Status::InternalServerError,
					format!("local skills search failed: {e}"),
					"LOCAL_SEARCH_TASK",
				)
			})?
		}
		_ => Err(ApiError::new(
			Status::BadRequest,
			format!("unknown market source: {provider}"),
			"UNKNOWN_MARKET_SOURCE",
		)),
	}
}

fn expand_tilde_segment(path: &str) -> PathBuf {
	let t = path.trim();
	if let Some(rest) = t.strip_prefix("~/") {
		return dirs::home_dir()
			.map(|h| h.join(rest))
			.unwrap_or_else(|| PathBuf::from(t));
	}
	PathBuf::from(t)
}

fn local_repo_roots_from_env(raw: String) -> Result<Vec<PathBuf>, ApiError> {

	let roots: Vec<PathBuf> = raw
		.split(',')
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(expand_tilde_segment)
		.collect();

	if roots.is_empty() {
		return Err(ApiError::new(
			Status::BadRequest,
			format!(
				"{LOCAL_SKILLS_REPO_ENV} is set but contains no valid paths."
			),
			"LOCAL_SKILLS_REPO_EMPTY",
		));
	}

	Ok(roots)
}

fn search_local_skills_repo(
	q: &str,
	limit: Option<usize>,
	repo_url_from_request: Option<&str>,
) -> Result<Json<Vec<MarketSkill>>, ApiError> {
	let mut cloned_repo = None;
	let roots = match std::env::var(LOCAL_SKILLS_REPO_ENV) {
		Ok(raw) => local_repo_roots_from_env(raw)?,
		Err(_) => {
			let repo_url = repo_url_from_request
				.map(str::trim)
				.filter(|s| !s.is_empty())
				.map(str::to_string)
				.or_else(|| std::env::var(LOCAL_SKILLS_REPO_GIT_URL_ENV).ok())
				.ok_or_else(|| {
					ApiError::new(
						Status::BadRequest,
						format!(
							"Set local skills repo in settings, or set \
							 {LOCAL_SKILLS_REPO_ENV}/{LOCAL_SKILLS_REPO_GIT_URL_ENV}."
						),
						"LOCAL_SKILLS_SOURCE_NOT_SET",
					)
				})?;
			let temp_dir = clone_internal_repo(&repo_url)?;
			let root = temp_dir.path().to_path_buf();
			cloned_repo = Some(temp_dir);
			vec![root]
		}
	};
	let needle = q.trim().to_lowercase();
	let cap = limit.unwrap_or(500);

	let scan_opts = ScanOptions {
		max_depth: 16,
		full_depth: true,
		respect_gitignore: true,
	};

	let mut by_name: HashMap<String, (MarketSkill, String)> = HashMap::new();

	for root in roots {
		if !root.is_dir() {
			continue;
		}

		let canon_root = root.canonicalize().unwrap_or(root.clone());
		let dirs = match scan_skills(&root, scan_opts.clone(), vec![]) {
			Ok(d) => d,
			Err(_) => continue,
		};

		for skill_dir in dirs {
			let Ok(parsed) = parse_skill_dir(&skill_dir) else {
				continue;
			};

			let Ok(canon_skill) = skill_dir.canonicalize() else {
				continue;
			};

			let rel = canon_skill
				.strip_prefix(&canon_root)
				.map(|p| p.display().to_string())
				.unwrap_or_else(|_| canon_skill.display().to_string());
			let rel_norm = rel.replace('\\', "/");
			let source = format!("local/{rel_norm}");
			let slug = sanitize_name(&parsed.name);
			let path_str = canon_skill.display().to_string();

			let desc = parsed.description.trim();
			let description = if desc.is_empty() {
				None
			} else {
				Some(desc.to_string())
			};

			let entry = MarketSkill {
				name: parsed.name.clone(),
				slug,
				source,
				installs: 0,
				author: parsed.author.clone(),
				description,
				local_path: Some(path_str),
			};

			let desc_lc = parsed.description.to_lowercase();
			by_name.entry(parsed.name).or_insert((entry, desc_lc));
		}
	}

	let mut out: Vec<MarketSkill> = by_name
		.into_values()
		.filter(|(s, desc_lc)| {
			needle.is_empty() || local_skill_matches(&needle, s, desc_lc)
		})
		.map(|(s, _)| s)
		.collect();

	out.sort_by(|a, b| a.name.cmp(&b.name));
	out.truncate(cap);
	drop(cloned_repo);

	Ok(Json(out))
}

fn local_skill_matches(needle: &str, s: &MarketSkill, desc_lc: &str) -> bool {
	let n = needle;
	s.name.to_lowercase().contains(n)
		|| s.slug.to_lowercase().contains(n)
		|| s.source.to_lowercase().contains(n)
		|| s.author.as_deref().unwrap_or("").to_lowercase().contains(n)
		|| desc_lc.contains(n)
}

fn skills_sh_summary_fetch_disabled() -> bool {
	std::env::var("AGHUB_SKILLS_SH_FETCH_SUMMARY")
		.map(|v| {
			v == "0"
				|| v.eq_ignore_ascii_case("false")
				|| v.eq_ignore_ascii_case("off")
		})
		.unwrap_or(false)
}

async fn fetch_skills_sh_page_summary(
	http: &reqwest::Client,
	site: &str,
	source: &str,
	slug: &str,
) -> Option<String> {
	let url = summary::skill_page_url(site, source, slug);
	let resp = http.get(url).send().await.ok()?;
	if !resp.status().is_success() {
		return None;
	}
	let html = resp.text().await.ok()?;
	summary::extract_summary_from_skill_page(&html)
}

async fn search_skills_sh(
	q: &str,
	limit: Option<usize>,
) -> Result<Json<Vec<MarketSkill>>, ApiError> {
	let client = Client::new().map_err(|e| {
		ApiError::new(
			Status::InternalServerError,
			e.to_string(),
			"MARKET_CLIENT_ERROR",
		)
	})?;

	let mut params = SearchParams::new(q);
	if let Some(l) = limit {
		params = params.with_limit(l);
	}

	let results = client.search(&params).await.map_err(|e| {
		ApiError::new(Status::BadGateway, e.to_string(), "MARKET_SEARCH_ERROR")
	})?;

	Ok(Json(
		results
			.into_iter()
			.map(|r| {
				// Parse author safely from "github/author" or "github/author/repo"
				let author = if r.source.starts_with("github/") {
					r.source.split('/').nth(1).map(String::from)
				} else {
					None
				};
				let description = r.description.and_then(|s| {
					let t = s.trim();
					if t.is_empty() {
						None
					} else {
						Some(t.to_string())
					}
				});
				MarketSkill {
					name: r.name,
					slug: r.slug,
					source: r.source,
					installs: r.installs,
					author,
					description,
					local_path: None,
				}
			})
			.collect(),
	))
}

/// Fetch one skill page summary (skills.sh HTML). Search stays fast; UI loads
/// this on demand.
#[get("/skills-market/skill-summary?<source>&<slug>")]
pub async fn skill_market_summary(
	source: &str,
	slug: &str,
) -> Result<Json<MarketSkillSummary>, ApiError> {
	let source = source.trim();
	let slug = slug.trim();
	if source.is_empty() || slug.is_empty() {
		return Err(ApiError::new(
			Status::BadRequest,
			"source and slug are required".to_string(),
			"MARKET_SUMMARY_BAD_REQUEST",
		));
	}

	let site = summary::skills_site_origin();
	let page_url = summary::skill_page_url(&site, source, slug);

	if skills_sh_summary_fetch_disabled() {
		return Ok(Json(MarketSkillSummary {
			summary: None,
			page_url,
		}));
	}

	let Ok(http) = reqwest::Client::builder()
		.timeout(Duration::from_secs(10))
		.user_agent(concat!(
			"aghub-api/",
			env!("CARGO_PKG_VERSION"),
			" (+https://github.com/akarachen/aghub)"
		))
		.build()
	else {
		return Ok(Json(MarketSkillSummary {
			summary: None,
			page_url,
		}));
	};

	let summary_text =
		fetch_skills_sh_page_summary(&http, &site, source, slug).await;

	Ok(Json(MarketSkillSummary {
		summary: summary_text,
		page_url,
	}))
}
