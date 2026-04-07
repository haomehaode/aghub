//! MCP catalog search: default = official MCP Registry API; optional static JSON URL;
//! or internal git repository of `.mcp.json` files.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rocket::http::Status;
use rocket::serde::json::Json;
use serde::Deserialize;
use serde_json::Value;
use skill::sanitize_name;
use tempfile::TempDir;

use crate::dto::mcp::TransportDto;
use crate::dto::mcp_market::MarketMcp;
use crate::error::ApiError;
use crate::routes::market::clone_internal_repo;

const LOCAL_MCP_REPO_ENV: &str = "AGHUB_LOCAL_MCP_REPO";
const LOCAL_MCP_REPO_GIT_URL_ENV: &str = "AGHUB_LOCAL_MCP_REPO_GIT_URL";
const MCP_REGISTRY_URL_ENV: &str = "AGHUB_MCP_REGISTRY_URL";
/// Official MCP Registry (Model Context Protocol). See <https://modelcontextprotocol.io/registry>.
const OFFICIAL_MCP_REGISTRY_V1: &str =
	"https://registry.modelcontextprotocol.io/v0.1";

#[derive(Debug, Deserialize)]
struct CatalogServer {
	name: String,
	#[serde(default)]
	description: Option<String>,
	#[serde(default)]
	author: Option<String>,
	#[serde(default)]
	repo_url: Option<String>,
	#[serde(default)]
	repository_url: Option<String>,
	#[serde(default)]
	github_url: Option<String>,
	transport: TransportDto,
}

#[derive(Debug, Deserialize)]
struct CatalogWithServers {
	#[serde(default)]
	servers: Vec<CatalogServer>,
}

#[derive(Debug, Deserialize)]
struct OfficialListResponse {
	servers: Vec<OfficialServerEntry>,
	#[serde(default)]
	metadata: Option<OfficialMetadata>,
}

#[derive(Debug, Deserialize)]
struct OfficialServerEntry {
	server: Value,
}

#[derive(Debug, Deserialize)]
struct OfficialMetadata {
	#[serde(rename = "nextCursor")]
	next_cursor: Option<String>,
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

fn local_mcp_repo_roots_from_env(raw: String) -> Result<Vec<PathBuf>, ApiError> {
	let roots: Vec<PathBuf> = raw
		.split(',')
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(expand_tilde_segment)
		.collect();

	if roots.is_empty() {
		return Err(ApiError::new(
			Status::BadRequest,
			format!("{LOCAL_MCP_REPO_ENV} is set but contains no valid paths."),
			"LOCAL_MCP_REPO_EMPTY",
		));
	}

	Ok(roots)
}

fn parse_catalog_json(data: &[u8]) -> Result<Vec<CatalogServer>, ApiError> {
	if let Ok(w) = serde_json::from_slice::<CatalogWithServers>(data) {
		if !w.servers.is_empty() {
			return Ok(w.servers);
		}
	}
	serde_json::from_slice::<Vec<CatalogServer>>(data).map_err(|e| {
		ApiError::new(
			Status::BadRequest,
			format!("Invalid MCP catalog JSON: {e}"),
			"MCP_CATALOG_PARSE",
		)
	})
}

fn catalog_to_market(
	entry: CatalogServer,
	source: String,
	by_name: &mut HashMap<String, MarketMcp>,
) {
	let name = entry.name.trim().to_string();
	if name.is_empty() {
		return;
	}
	let slug = sanitize_name(&name);
	let description = entry.description.and_then(|s| {
		let t = s.trim();
		if t.is_empty() {
			None
		} else {
			Some(t.to_string())
		}
	});
	let author = entry.author.and_then(|s| {
		let t = s.trim();
		if t.is_empty() {
			None
		} else {
			Some(t.to_string())
		}
	});
	let repo_url = entry
		.repo_url
		.or(entry.repository_url)
		.or(entry.github_url)
		.and_then(|s| {
			let t = s.trim();
			if t.is_empty() {
				None
			} else {
				Some(t.to_string())
			}
		});
	let m = MarketMcp {
		name: name.clone(),
		slug,
		source,
		author,
		description,
		repo_url,
		transport: entry.transport,
	};
	by_name.entry(name).or_insert(m);
}

fn mcp_install_name_from_registry(full_name: &str) -> String {
	full_name.replace('/', "-")
}

fn guess_author_from_registry_name(full_name: &str) -> Option<String> {
	let first = full_name.split('/').next()?;
	if let Some(rest) = first.strip_prefix("io.github.") {
		return Some(rest.to_string());
	}
	if let Some(rest) = first.strip_prefix("com.github.") {
		return Some(rest.to_string());
	}
	None
}

fn remote_headers_to_map(remote: &Value) -> Option<HashMap<String, String>> {
	let arr = remote.get("headers")?.as_array()?;
	let mut m = HashMap::new();
	for h in arr {
		let name = h.get("name")?.as_str()?;
		let value = h.get("value")?.as_str()?;
		m.insert(name.to_string(), value.to_string());
	}
	if m.is_empty() {
		None
	} else {
		Some(m)
	}
}

fn transport_from_official_server(server: &Value) -> Option<TransportDto> {
	if let Some(packages) = server.get("packages").and_then(|p| p.as_array()) {
		for pkg in packages {
			let transport = pkg.get("transport")?;
			let typ = transport.get("type")?.as_str()?;
			if typ != "stdio" {
				continue;
			}
			let registry_type = pkg
				.get("registryType")
				.or_else(|| pkg.get("registry_type"))
				.and_then(|v| v.as_str())?;
			let identifier = pkg.get("identifier")?.as_str()?;
			let version = pkg.get("version")?.as_str()?;
			match registry_type {
				"npm" => {
					return Some(TransportDto::Stdio {
						command: "npx".to_string(),
						args: vec![
							"-y".to_string(),
							format!("{identifier}@{version}"),
						],
						env: None,
						timeout: None,
					});
				}
				"pypi" => {
					return Some(TransportDto::Stdio {
						command: "uvx".to_string(),
						args: vec![format!("{identifier}=={version}")],
						env: None,
						timeout: None,
					});
				}
				_ => {}
			}
		}
	}

	if let Some(remotes) = server.get("remotes").and_then(|r| r.as_array()) {
		for remote in remotes {
			let typ = remote.get("type")?.as_str()?;
			let url = remote.get("url")?.as_str()?;
			let headers = remote_headers_to_map(remote);
			match typ {
				"sse" => {
					return Some(TransportDto::Sse {
						url: url.to_string(),
						headers,
						timeout: None,
					});
				}
				"streamable-http" | "http" => {
					return Some(TransportDto::StreamableHttp {
						url: url.to_string(),
						headers,
						timeout: None,
					});
				}
				_ => {}
			}
		}
	}

	None
}

fn market_mcp_from_official_server(server: &Value) -> Option<MarketMcp> {
	let full_name = server.get("name")?.as_str()?;
	let transport = transport_from_official_server(server)?;
	let install_name = mcp_install_name_from_registry(full_name);
	let slug = sanitize_name(&install_name);
	let description = server
		.get("description")
		.and_then(|v| v.as_str())
		.map(|s| s.trim().to_string())
		.filter(|s| !s.is_empty());
	let author = guess_author_from_registry_name(full_name);
	let repo_url = server
		.get("repository")
		.and_then(|v| v.get("url"))
		.and_then(|v| v.as_str())
		.map(|s| s.trim().to_string())
		.filter(|s| !s.is_empty());
	Some(MarketMcp {
		name: install_name,
		slug,
		source: "registry/modelcontextprotocol.io".to_string(),
		author,
		description,
		repo_url,
		transport,
	})
}

fn collect_mcp_json_files(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<PathBuf>) {
	if depth > max_depth {
		return;
	}
	let Ok(read) = std::fs::read_dir(dir) else {
		return;
	};
	for entry in read.flatten() {
		let p = entry.path();
		if p.is_dir() {
			collect_mcp_json_files(&p, depth + 1, max_depth, out);
			continue;
		}
		let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
			continue;
		};
		if name.ends_with(".mcp.json") || name == "mcp-catalog.json" {
			out.push(p);
		}
	}
}

fn search_local_mcp_repo(
	q: &str,
	limit: Option<usize>,
	repo_url_from_request: Option<&str>,
) -> Result<Json<Vec<MarketMcp>>, ApiError> {
	let mut _cloned: Option<TempDir> = None;
	let roots: Vec<PathBuf> = match std::env::var(LOCAL_MCP_REPO_ENV) {
		Ok(raw) => local_mcp_repo_roots_from_env(raw)?,
		Err(_) => {
			let repo_url = repo_url_from_request
				.map(str::trim)
				.filter(|s| !s.is_empty())
				.map(str::to_string)
				.or_else(|| std::env::var(LOCAL_MCP_REPO_GIT_URL_ENV).ok())
				.ok_or_else(|| {
					ApiError::new(
						Status::BadRequest,
						format!(
							"Set internal MCP repo in settings, or set \
							 {LOCAL_MCP_REPO_ENV}/{LOCAL_MCP_REPO_GIT_URL_ENV}."
						),
						"LOCAL_MCP_SOURCE_NOT_SET",
					)
				})?;
			let temp = clone_internal_repo(&repo_url)?;
			let root = temp.path().to_path_buf();
			_cloned = Some(temp);
			vec![root]
		}
	};

	let needle = q.trim().to_lowercase();
	let cap = limit.unwrap_or(500);
	let mut by_name: HashMap<String, MarketMcp> = HashMap::new();

	for root in roots {
		if !root.is_dir() {
			continue;
		}
		let canon_root = root.canonicalize().unwrap_or(root.clone());
		let mut files = Vec::new();
		collect_mcp_json_files(&root, 0, 14, &mut files);

		for file in files {
			let Ok(data) = std::fs::read(&file) else {
				continue;
			};
			let Ok(entries) = parse_catalog_json(&data) else {
				continue;
			};
			let rel = file
				.strip_prefix(&canon_root)
				.map(|p| p.display().to_string())
				.unwrap_or_else(|_| file.display().to_string());
			let rel_norm = rel.replace('\\', "/");
			let source = format!("local/{rel_norm}");
			for e in entries {
				catalog_to_market(e, source.clone(), &mut by_name);
			}
		}
	}

	let mut out: Vec<MarketMcp> = by_name
		.into_values()
		.filter(|m| mcp_entry_matches(&needle, m))
		.collect();
	out.sort_by(|a, b| a.name.cmp(&b.name));
	out.truncate(cap);
	drop(_cloned);
	Ok(Json(out))
}

fn mcp_entry_matches(needle: &str, m: &MarketMcp) -> bool {
	if needle.is_empty() {
		return true;
	}
	let n = needle;
	m.name.to_lowercase().contains(n)
		|| m.slug.to_lowercase().contains(n)
		|| m.source.to_lowercase().contains(n)
		|| m.author.as_deref().unwrap_or("").to_lowercase().contains(n)
		|| m.description.as_deref().unwrap_or("").to_lowercase().contains(n)
}

/// Search MCP catalog entries.
/// - `source=registry`: default = official API at registry.modelcontextprotocol.io; optional custom
///   JSON catalog URL via `registry_url` or `AGHUB_MCP_REGISTRY_URL`.
/// - `source=local`: scan `AGHUB_LOCAL_MCP_REPO` paths or clone `repo_url` / `AGHUB_LOCAL_MCP_REPO_GIT_URL`.
#[get("/mcp-market/search?<q>&<limit>&<source>&<repo_url>&<registry_url>")]
pub async fn search_mcp_market(
	q: &str,
	limit: Option<usize>,
	source: Option<&str>,
	repo_url: Option<&str>,
	registry_url: Option<&str>,
) -> Result<Json<Vec<MarketMcp>>, ApiError> {
	let provider = source.unwrap_or("registry");

	match provider {
		"registry" => search_mcp_registry(q, limit, registry_url).await,
		"local" => {
			let q = q.to_string();
			let repo = repo_url.map(str::to_string);
			tokio::task::spawn_blocking(move || {
				search_local_mcp_repo(&q, limit, repo.as_deref())
			})
			.await
			.map_err(|e| {
				ApiError::new(
					Status::InternalServerError,
					format!("local MCP search failed: {e}"),
					"LOCAL_MCP_SEARCH_TASK",
				)
			})?
		}
		_ => Err(ApiError::new(
			Status::BadRequest,
			format!("unknown MCP market source: {provider}"),
			"UNKNOWN_MCP_MARKET_SOURCE",
		)),
	}
}

async fn search_official_mcp_registry(
	client: &reqwest::Client,
	q: &str,
	cap: usize,
) -> Result<Vec<MarketMcp>, ApiError> {
	let needle = q.trim().to_lowercase();
	let mut collected: Vec<MarketMcp> = Vec::new();
	let mut seen: HashMap<String, ()> = HashMap::new();
	let mut cursor: Option<String> = None;
	let mut pages = 0u32;

	while collected.len() < cap && pages < 40 {
		pages += 1;
		let page_limit = 100.min(cap.saturating_sub(collected.len()).max(1));

		let mut req = client
			.get(format!("{OFFICIAL_MCP_REGISTRY_V1}/servers"))
			.query(&[("version", "latest"), ("limit", &page_limit.to_string())]);

		if !q.trim().is_empty() {
			req = req.query(&[("search", q.trim())]);
		}
		if let Some(ref c) = cursor {
			req = req.query(&[("cursor", c.as_str())]);
		}

		let resp = req.send().await.map_err(|e| {
			ApiError::new(
				Status::BadGateway,
				format!("Official MCP registry request failed: {e}"),
				"MCP_OFFICIAL_REGISTRY_FETCH",
			)
		})?;

		if !resp.status().is_success() {
			return Err(ApiError::new(
				Status::BadGateway,
				format!(
					"Official MCP registry returned HTTP {}",
					resp.status().as_u16()
				),
				"MCP_OFFICIAL_REGISTRY_HTTP",
			));
		}

		let bytes = resp.bytes().await.map_err(|e| {
			ApiError::new(
				Status::BadGateway,
				format!("Official MCP registry body: {e}"),
				"MCP_OFFICIAL_REGISTRY_BODY",
			)
		})?;

		let parsed: OfficialListResponse = serde_json::from_slice(&bytes).map_err(|e| {
			ApiError::new(
				Status::BadGateway,
				format!("Official MCP registry JSON: {e}"),
				"MCP_OFFICIAL_REGISTRY_PARSE",
			)
		})?;

		if parsed.servers.is_empty() {
			break;
		}

		for entry in parsed.servers {
			if let Some(m) = market_mcp_from_official_server(&entry.server) {
				if seen.contains_key(&m.name) {
					continue;
				}
				if mcp_entry_matches(&needle, &m) {
					seen.insert(m.name.clone(), ());
					collected.push(m);
					if collected.len() >= cap {
						break;
					}
				}
			}
		}

		if collected.len() >= cap {
			break;
		}

		cursor = parsed
			.metadata
			.and_then(|m| m.next_cursor)
			.filter(|s| !s.is_empty());
		if cursor.is_none() {
			break;
		}
	}

	collected.truncate(cap);
	Ok(collected)
}

async fn fetch_custom_mcp_catalog(
	url: &str,
	q: &str,
	limit: Option<usize>,
) -> Result<Json<Vec<MarketMcp>>, ApiError> {
	let client = reqwest::Client::builder()
		.timeout(Duration::from_secs(25))
		.user_agent(concat!(
			"aghub-api/",
			env!("CARGO_PKG_VERSION"),
			" (+https://github.com/akarachen/aghub)"
		))
		.build()
		.map_err(|e| {
			ApiError::new(
				Status::InternalServerError,
				e.to_string(),
				"MCP_REGISTRY_HTTP_BUILD",
			)
		})?;

	let resp = client.get(url).send().await.map_err(|e| {
		ApiError::new(
			Status::BadGateway,
			format!("Failed to fetch MCP catalog: {e}"),
			"MCP_REGISTRY_FETCH",
		)
	})?;

	if !resp.status().is_success() {
		return Err(ApiError::new(
			Status::BadGateway,
			format!(
				"MCP catalog returned HTTP {}",
				resp.status().as_u16()
			),
			"MCP_REGISTRY_HTTP_STATUS",
		));
	}

	let bytes = resp.bytes().await.map_err(|e| {
		ApiError::new(
			Status::BadGateway,
			format!("Failed to read MCP catalog body: {e}"),
			"MCP_REGISTRY_BODY",
		)
	})?;

	let entries = parse_catalog_json(&bytes)?;
	let needle = q.trim().to_lowercase();
	let cap = limit.unwrap_or(500);
	let mut by_name: HashMap<String, MarketMcp> = HashMap::new();
	for e in entries {
		catalog_to_market(e, "registry/custom".to_string(), &mut by_name);
	}

	let mut out: Vec<MarketMcp> = by_name
		.into_values()
		.filter(|m| mcp_entry_matches(&needle, m))
		.collect();
	out.sort_by(|a, b| a.name.cmp(&b.name));
	out.truncate(cap);
	Ok(Json(out))
}

async fn search_mcp_registry(
	q: &str,
	limit: Option<usize>,
	registry_url: Option<&str>,
) -> Result<Json<Vec<MarketMcp>>, ApiError> {
	let custom_url = registry_url
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(str::to_string)
		.or_else(|| std::env::var(MCP_REGISTRY_URL_ENV).ok());

	if let Some(url) = custom_url {
		return fetch_custom_mcp_catalog(&url, q, limit).await;
	}

	let client = reqwest::Client::builder()
		.timeout(Duration::from_secs(45))
		.user_agent(concat!(
			"aghub-api/",
			env!("CARGO_PKG_VERSION"),
			" (+https://github.com/akarachen/aghub)"
		))
		.build()
		.map_err(|e| {
			ApiError::new(
				Status::InternalServerError,
				e.to_string(),
				"MCP_OFFICIAL_REGISTRY_HTTP_BUILD",
			)
		})?;

	let cap = limit.unwrap_or(500);
	let mut out = search_official_mcp_registry(&client, q, cap).await?;
	out.sort_by(|a, b| a.name.cmp(&b.name));
	Ok(Json(out))
}
