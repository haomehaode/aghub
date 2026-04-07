//! Public skill pages on skills.sh (HTML), e.g.
//! `https://skills.sh/remotion-dev/skills/remotion-best-practices`.

use url::Url;

const DEFAULT_SITE: &str = "https://skills.sh";

/// Web origin for skill pages, from [`SKILLS_API_URL`] when set.
pub fn skills_site_origin() -> String {
	std::env::var("SKILLS_API_URL")
		.ok()
		.and_then(|s| Url::parse(&s).ok())
		.and_then(|u| u.host_str().map(|h| format!("{}://{}", u.scheme(), h)))
		.unwrap_or_else(|| DEFAULT_SITE.to_string())
}

/// Public skill page URL (`{site}/{source}/{slug}`).
pub fn skill_page_url(site: &str, source: &str, slug: &str) -> String {
	let site = site.trim_end_matches('/');
	let path =
		format!("{}/{}", source.trim_matches('/'), slug.trim_matches('/'));
	format!("{site}/{path}")
}

/// First Summary line (`<p><strong>…</strong></p>`) from skill page HTML.
pub fn extract_summary_from_skill_page(html: &str) -> Option<String> {
	const ANCHOR: &str = ">Summary</div>";
	let idx = html.find(ANCHOR)?;
	let tail = &html[idx + ANCHOR.len()..];
	let rel = tail.find("<p><strong>")?;
	let start = rel + "<p><strong>".len();
	let rest = &tail[start..];
	let end = rest.find("</strong>")?;
	let s = rest[..end].trim();
	if s.is_empty() {
		return None;
	}
	Some(s.to_string())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn extract_sample_like_remotion_page() {
		let html = r#"<div class="mb-3">Summary</div><div><div class="prose"><p><strong>Domain-specific knowledge base for building videos with Remotion and React.</strong></p>
<ul><li>More</li></ul></div></div>"#;
		let s = extract_summary_from_skill_page(html).expect("summary");
		assert!(s.contains("Remotion"));
	}

	#[test]
	fn skill_page_url_joins_source_and_slug() {
		let u = skill_page_url(
			"https://skills.sh",
			"remotion-dev/skills",
			"remotion-best-practices",
		);
		assert_eq!(
			u,
			"https://skills.sh/remotion-dev/skills/remotion-best-practices"
		);
	}
}
