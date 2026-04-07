import { useQueryState } from "nuqs";
import { useState } from "react";
import { useLocation } from "wouter";
import {
	McpHeader,
	type McpMarketSearchSource,
} from "./components/mcp-header";

export default function McpMarketPage() {
	const [, setLocation] = useLocation();
	const [searchQuery, setSearchQuery] = useState("");
	const [urlSource, setUrlSource] = useQueryState("source", {
		defaultValue: "registry",
	});
	const marketSource: McpMarketSearchSource =
		urlSource === "local" ? "local" : "registry";

	const handleSearch = () => {
		if (searchQuery.trim().length >= 2) {
			const q = encodeURIComponent(searchQuery.trim());
			const sourceQs =
				marketSource === "local" ? `&source=local` : "";
			setLocation(`/mcp-market/search?q=${q}${sourceQs}`);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-6">
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
				<McpHeader
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
