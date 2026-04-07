use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct MarketSkill {
	pub name: String,
	pub slug: String,
	pub source: String,
	pub installs: u64,
	pub author: Option<String>,
	/// Short summary from SKILL.md (local) or the registry when available.
	#[serde(skip_serializing_if = "Option::is_none")]
	#[ts(optional)]
	pub description: Option<String>,
	/// Absolute path for installing from a local skills repository scan.
	#[serde(skip_serializing_if = "Option::is_none")]
	#[ts(optional)]
	pub local_path: Option<String>,
}

/// On-demand summary from a skills.sh skill page (HTML parse).
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct MarketSkillSummary {
	pub summary: Option<String>,
	pub page_url: String,
}
