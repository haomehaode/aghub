import { useQueryState } from "nuqs";
import { useState } from "react";
import { useLocation } from "wouter";
import {
	SkillsHeader,
	type MarketSearchSource,
} from "./components/skills-header";

export default function SkillsShPage() {
	const [, setLocation] = useLocation();
	const [searchQuery, setSearchQuery] = useState("");
	const [urlSource, setUrlSource] = useQueryState("source", {
		defaultValue: "skills-sh",
	});
	const marketSource: MarketSearchSource =
		urlSource === "local" ? "local" : "skills-sh";

	const handleSearch = () => {
		if (searchQuery.trim().length >= 2) {
			const q = encodeURIComponent(searchQuery.trim());
			const sourceQs =
				marketSource === "local" ? `&source=local` : "";
			setLocation(`/skills-sh/search?q=${q}${sourceQs}`);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-6">
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
				<SkillsHeader
					size="large"
					centered
					marketSource={marketSource}
					onMarketSourceChange={(s) => {
						void setUrlSource(s);
					}}
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					onSearch={handleSearch}
					showSearchButton={true}
				/>
			</div>
		</div>
	);
}
