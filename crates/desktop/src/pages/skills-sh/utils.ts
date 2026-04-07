import type { MarketSkill } from "../../generated/dto";

const DEFAULT_SKILLS_SITE = "https://skills.sh";

export function skillsShSkillPageUrl(skill: MarketSkill): string | null {
	if (skill.source.startsWith("local/")) {
		return null;
	}
	const source = skill.source.trim().replace(/^\/+|\/+$/g, "");
	const slug = skill.slug.trim().replace(/^\/+|\/+$/g, "");
	if (!source || !slug) {
		return null;
	}
	return `${DEFAULT_SKILLS_SITE}/${source}/${slug}`;
}
