use serde::Serialize;
use ts_rs::TS;

use crate::dto::mcp::TransportDto;

/// One MCP server entry from a public registry JSON or an internal git catalog file.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct MarketMcp {
	pub name: String,
	pub slug: String,
	/// e.g. `registry` or `local/path/to/file.mcp.json`
	pub source: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[ts(optional)]
	pub author: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[ts(optional)]
	pub description: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[ts(optional)]
	pub repo_url: Option<String>,
	pub transport: TransportDto,
}
