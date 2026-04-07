use crate::{eprintln_verbose, ResourceType};
use aghub_core::manager::ConfigManager;
use anyhow::{Context, Result};
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct SkillView {
	name: String,
	enabled: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	source_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	description: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	author: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	version: Option<String>,
	#[serde(skip_serializing_if = "Vec::is_empty")]
	tools: Vec<String>,
	/// Agent identifier (only set when using --agent all)
	#[serde(skip_serializing_if = "Option::is_none")]
	agent: Option<&'static str>,
}

#[derive(Serialize)]
pub(crate) struct McpView {
	name: String,
	enabled: bool,
	#[serde(rename = "type")]
	transport_type: String,
	/// Agent identifier (only set when using --agent all)
	#[serde(skip_serializing_if = "Option::is_none")]
	agent: Option<&'static str>,
}

pub(crate) fn skill_to_view(
	s: &aghub_core::models::Skill,
	agent: Option<&'static str>,
) -> SkillView {
	SkillView {
		name: s.name.clone(),
		enabled: s.enabled,
		source_path: s.source_path.clone(),
		description: s.description.clone(),
		author: s.author.clone(),
		version: s.version.clone(),
		tools: s.tools.clone(),
		agent,
	}
}

pub(crate) fn mcp_to_view(
	m: &aghub_core::models::McpServer,
	agent: Option<&'static str>,
) -> McpView {
	McpView {
		name: m.name.clone(),
		enabled: m.enabled,
		transport_type: match &m.transport {
			aghub_core::models::McpTransport::Stdio { .. } => {
				"stdio".to_string()
			}
			aghub_core::models::McpTransport::Sse { .. } => "sse".to_string(),
			aghub_core::models::McpTransport::StreamableHttp { .. } => {
				"streamable-http".to_string()
			}
		},
		agent,
	}
}

pub fn execute(manager: &ConfigManager, resource: ResourceType) -> Result<()> {
	let config = manager.config().context("No configuration loaded")?;

	match resource {
		ResourceType::Skills => {
			let views: Vec<SkillView> = config
				.skills
				.iter()
				.map(|s| skill_to_view(s, None))
				.collect();
			eprintln_verbose!("Found {} skills", views.len());
			println!("{}", serde_json::to_string_pretty(&views)?);
		}
		ResourceType::Mcps => {
			let views: Vec<McpView> =
				config.mcps.iter().map(|m| mcp_to_view(m, None)).collect();
			eprintln_verbose!("Found {} MCP servers", views.len());
			println!("{}", serde_json::to_string_pretty(&views)?);
		}
	}

	Ok(())
}

pub fn execute_all(
	resources: Vec<aghub_core::all_agents::AgentResources>,
	resource: ResourceType,
) -> Result<()> {
	// Flatten output: each resource has an `agent` field indicating which agent it belongs to
	match resource {
		ResourceType::Skills => {
			let views: Vec<SkillView> = resources
				.into_iter()
				.flat_map(|r| {
					let agent_id = r.agent_id;
					r.skills
						.into_iter()
						.map(move |s| skill_to_view(&s, Some(agent_id)))
				})
				.collect();
			eprintln_verbose!("Found {} skills across all agents", views.len());
			println!("{}", serde_json::to_string_pretty(&views)?);
		}
		ResourceType::Mcps => {
			let views: Vec<McpView> = resources
				.into_iter()
				.flat_map(|r| {
					let agent_id = r.agent_id;
					r.mcps
						.into_iter()
						.map(move |m| mcp_to_view(&m, Some(agent_id)))
				})
				.collect();
			eprintln_verbose!(
				"Found {} MCP servers across all agents",
				views.len()
			);
			println!("{}", serde_json::to_string_pretty(&views)?);
		}
	}
	Ok(())
}
