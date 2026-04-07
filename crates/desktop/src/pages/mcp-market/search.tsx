import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { Button, Spinner } from "@heroui/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TableComponents } from "react-virtuoso";
import { TableVirtuoso } from "react-virtuoso";
import { useLocation } from "wouter";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "../../components/ui/empty";
import type { MarketMcp } from "../../generated/dto";
import { useApi } from "../../hooks/use-api";
import { getIntegrationPreferences } from "../../lib/store";
import { mcpMarketSearchInfiniteQueryOptions } from "../../requests/mcp-market";
import {
	McpHeader,
	type McpMarketSearchSource,
} from "./components/mcp-header";
import { McpInstallModal } from "./components/mcp-install-modal";
import { McpSummaryModal } from "./components/mcp-summary-modal";
import { useMcpInstall } from "./hooks/use-mcp-install";

const BATCH_SIZE = 20;
const FETCH_SIZE = 100;
const ROW_HEIGHT = 48;

const tableComponents: TableComponents<MarketMcp> = {
	Table: ({ style, ...props }) => (
		<table
			className="w-full table-fixed caption-bottom text-sm"
			style={style}
			{...props}
		/>
	),
	TableHead: (props) => (
		<thead className="border-b border-border" {...props} />
	),
	TableBody: (props) => <tbody {...props} />,
	TableRow: ({ style, ...props }) => (
		<tr
			className="border-b border-border"
			style={{ height: ROW_HEIGHT, ...style }}
			{...props}
		/>
	),
};

export default function McpMarketSearchPage() {
	const { t } = useTranslation();
	const api = useApi();
	const [, setLocation] = useLocation();
	const { data: integrationPreferences } = useQuery({
		queryKey: ["integration-preferences"],
		queryFn: getIntegrationPreferences,
	});

	const {
		installModalOpen,
		selectedMcp,
		selectedAgents,
		setSelectedAgents,
		installResults,
		isInstalling,
		mcpAgents,
		handleInstallClick,
		handleInstall,
		handleCloseInstallModal,
	} = useMcpInstall();

	const [urlQuery, setUrlQuery] = useQueryState("q");
	const [urlSource, setUrlSource] = useQueryState("source", {
		defaultValue: "registry",
	});
	const marketSource: McpMarketSearchSource =
		urlSource === "local" ? "local" : "registry";
	const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
	const [summaryMcp, setSummaryMcp] = useState<MarketMcp | null>(null);

	const submittedQuery = urlQuery ?? "";

	const {
		data,
		isFetching,
		isError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery({
		...mcpMarketSearchInfiniteQueryOptions({
			api,
			query: submittedQuery,
			source: marketSource,
			repoUrl: integrationPreferences?.localMcpRepoGitUrl,
			enabled: submittedQuery.length >= 2,
		}),
	});

	useEffect(() => {
		if (submittedQuery.length < 2) {
			const back =
				marketSource === "local"
					? "/mcp-market?source=local"
					: "/mcp-market";
			setLocation(back);
		}
	}, [submittedQuery.length, marketSource, setLocation]);

	const searchResults = useMemo(() => data?.pages.flat() ?? [], [data]);

	const displayedResults = useMemo(
		() => searchResults.slice(0, visibleCount),
		[searchResults, visibleCount],
	);

	const hasMore = visibleCount < searchResults.length;

	const handleEndReached = useCallback(() => {
		if (hasMore && !isFetching) {
			setVisibleCount((c) =>
				Math.min(c + BATCH_SIZE, searchResults.length),
			);
			const remaining = searchResults.length - visibleCount;
			if (remaining < FETCH_SIZE && hasNextPage && !isFetchingNextPage) {
				void fetchNextPage();
			}
		}
	}, [
		hasMore,
		isFetching,
		searchResults.length,
		visibleCount,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	]);

	if (submittedQuery.length < 2) {
		return null;
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-6">
			<div className="shrink-0 pb-4">
				<div className="flex flex-col gap-2">
					<div className="w-full min-w-0">
						<SearchHeader
							key={`${submittedQuery}-${marketSource}`}
							size="compact"
							initialQuery={submittedQuery}
							marketSource={marketSource}
							onMarketSourceChange={(s) => {
								void setUrlSource(s);
								setVisibleCount(BATCH_SIZE);
							}}
							onSearch={(query) => {
								setUrlQuery(query);
								setVisibleCount(BATCH_SIZE);
							}}
							showSearchButton={true}
						/>
					</div>
				</div>
			</div>

			{isError && marketSource === "local" ? (
				<div className="flex flex-1 items-center justify-center">
					<Empty className="border-0 max-w-md">
						<EmptyHeader>
							<EmptyMedia>
								<MagnifyingGlassIcon className="size-8 text-muted" />
							</EmptyMedia>
							<EmptyTitle className="text-sm font-normal text-muted text-center">
								{t("localMcpMarketSearchError")}
							</EmptyTitle>
						</EmptyHeader>
					</Empty>
				</div>
			) : isError && marketSource === "registry" ? (
				<div className="flex flex-1 items-center justify-center">
					<Empty className="border-0 max-w-md">
						<EmptyHeader>
							<EmptyMedia>
								<MagnifyingGlassIcon className="size-8 text-muted" />
							</EmptyMedia>
							<EmptyTitle className="text-sm font-normal text-muted text-center">
								{t("mcpMarketRegistryError")}
							</EmptyTitle>
						</EmptyHeader>
					</Empty>
				</div>
			) : isFetching && searchResults.length === 0 ? (
				<div className="flex items-center justify-center py-12">
					<Spinner size="lg" />
				</div>
			) : searchResults.length === 0 ? (
				<div className="flex flex-1 items-center justify-center">
					<Empty className="border-0">
						<EmptyHeader>
							<EmptyMedia>
								<MagnifyingGlassIcon className="size-8 text-muted" />
							</EmptyMedia>
							<EmptyTitle className="text-sm font-normal text-muted">
								{t("noResults")}
							</EmptyTitle>
						</EmptyHeader>
					</Empty>
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-hidden">
					<TableVirtuoso
						data={displayedResults}
						endReached={handleEndReached}
						fixedItemHeight={ROW_HEIGHT}
						style={{ height: "100%" }}
						components={tableComponents}
						itemContent={(_index, row) => (
							<>
								<td className="p-2 align-middle">
									<span className="font-medium">{row.name}</span>
								</td>
								<td className="p-2 align-middle">
									<span className="text-muted text-sm truncate block max-w-full">
										{row.source}
									</span>
								</td>
								<td className="p-2 align-middle">
									<span className="text-muted text-sm line-clamp-2">
										{row.description ?? "—"}
									</span>
								</td>
								<td className="p-2 align-middle">
									<Button
										size="sm"
										variant="tertiary"
										onPress={() => setSummaryMcp(row)}
									>
										{t("viewSkillIntro")}
									</Button>
								</td>
								<td className="p-2 align-middle">
									<Button
										size="sm"
										variant="tertiary"
										onPress={() => handleInstallClick(row)}
									>
										{t("install")}
									</Button>
								</td>
							</>
						)}
					>
						<thead>
							<tr>
								<th className="h-12 px-2 text-left align-middle font-medium w-[22%]">
									{t("name")}
								</th>
								<th className="h-12 px-2 text-left align-middle font-medium w-[28%]">
									{t("source")}
								</th>
								<th className="h-12 px-2 text-left align-middle font-medium w-[36%]">
									{t("description")}
								</th>
								<th className="h-12 px-2 text-left align-middle font-medium w-[14%]">
									{t("skillIntro")}
								</th>
								<th className="h-12 px-4 align-middle w-[10%]" />
							</tr>
						</thead>
						<tfoot>
							{isFetchingNextPage && (
								<tr>
									<td colSpan={5} className="py-3 text-center">
										<Spinner size="sm" />
									</td>
								</tr>
							)}
						</tfoot>
					</TableVirtuoso>
				</div>
			)}

			<McpInstallModal
				isOpen={installModalOpen}
				selectedMcp={selectedMcp}
				selectedAgents={selectedAgents}
				onSelectedAgentsChange={setSelectedAgents}
				installResults={installResults}
				isInstalling={isInstalling}
				mcpAgents={mcpAgents}
				onClose={handleCloseInstallModal}
				onInstall={handleInstall}
			/>
			<McpSummaryModal
				isOpen={summaryMcp !== null}
				entry={summaryMcp}
				onClose={() => setSummaryMcp(null)}
			/>
		</div>
	);
}

function SearchHeader({
	size,
	initialQuery,
	marketSource,
	onMarketSourceChange,
	onSearch,
	showSearchButton,
}: {
	size: "large" | "compact";
	initialQuery: string;
	marketSource: McpMarketSearchSource;
	onMarketSourceChange: (source: McpMarketSearchSource) => void;
	onSearch: (query: string) => void;
	showSearchButton: boolean;
}) {
	const [searchQuery, setSearchQuery] = useState(initialQuery);

	useEffect(() => {
		setSearchQuery(initialQuery);
	}, [initialQuery]);

	return (
		<McpHeader
			size={size}
			marketSource={marketSource}
			onMarketSourceChange={onMarketSourceChange}
			searchQuery={searchQuery}
			onSearchQueryChange={setSearchQuery}
			onSearch={() => {
				const query = searchQuery.trim();
				if (query.length >= 2) {
					onSearch(query);
				}
			}}
			showSearchButton={showSearchButton}
		/>
	);
}
