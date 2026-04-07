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
import type { MarketSkill } from "../../generated/dto";
import { useApi } from "../../hooks/use-api";
import { getIntegrationPreferences } from "../../lib/store";
import { marketSearchInfiniteQueryOptions } from "../../requests/market";
import { InstallModal } from "./components/install-modal";
import { SkillSummaryModal } from "./components/skill-summary-modal";
import {
	type MarketSearchSource,
	SkillsHeader,
} from "./components/skills-header";
import { useSkillInstall } from "./hooks/use-skill-install";

const BATCH_SIZE = 20;
const FETCH_SIZE = 100;
const ROW_HEIGHT = 48;

const tableComponents: TableComponents<MarketSkill> = {
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

export default function SkillsSearchPage() {
	const { t, i18n } = useTranslation();
	const api = useApi();
	const [, setLocation] = useLocation();
	const { data: integrationPreferences } = useQuery({
		queryKey: ["integration-preferences"],
		queryFn: getIntegrationPreferences,
	});

	const {
		installModalOpen,
		selectedSkill,
		selectedAgents,
		setSelectedAgents,
		installResults,
		isInstalling,
		skillAgents,
		installAll,
		setInstallAll,
		installToProject,
		setInstallToProject,
		canInstallToProject,
		selectedProjectId,
		setSelectedProjectId,
		projects,
		handleInstallClick,
		handleInstall,
		handleCloseInstallModal,
	} = useSkillInstall();

	const compactFormatter = useMemo(
		() =>
			new Intl.NumberFormat(i18n.language, {
				notation: "compact",
				compactDisplay: "short",
			}),
		[i18n.language],
	);

	const [urlQuery, setUrlQuery] = useQueryState("q");
	const [urlSource, setUrlSource] = useQueryState("source", {
		defaultValue: "skills-sh",
	});
	const marketSource: MarketSearchSource =
		urlSource === "local" ? "local" : "skills-sh";
	const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
	const [summarySkill, setSummarySkill] = useState<MarketSkill | null>(
		null,
	);

	const submittedQuery = urlQuery ?? "";

	const {
		data,
		isFetching,
		isError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery({
		...marketSearchInfiniteQueryOptions({
			api,
			query: submittedQuery,
			source: marketSource,
			repoUrl: integrationPreferences?.localSkillsRepoGitUrl,
			enabled: submittedQuery.length >= 2,
		}),
	});

	useEffect(() => {
		if (submittedQuery.length < 2) {
			const back =
				marketSource === "local"
					? "/skills-sh?source=local"
					: "/skills-sh";
			setLocation(back);
		}
	}, [submittedQuery.length, marketSource, setLocation]);

	const searchResults = useMemo(() => data?.pages.flat() ?? [], [data]);

	const orderedSearchResults = searchResults;

	const displayedResults = useMemo(
		() => orderedSearchResults.slice(0, visibleCount),
		[orderedSearchResults, visibleCount],
	);

	const hasMore = visibleCount < orderedSearchResults.length;

	const handleEndReached = useCallback(() => {
		if (hasMore && !isFetching) {
			setVisibleCount((c) =>
				Math.min(c + BATCH_SIZE, orderedSearchResults.length),
			);
			const remaining = orderedSearchResults.length - visibleCount;
			if (remaining < FETCH_SIZE && hasNextPage && !isFetchingNextPage) {
				fetchNextPage();
			}
		}
	}, [
		hasMore,
		isFetching,
		orderedSearchResults.length,
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
								{t("localMarketSearchError")}
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
						itemContent={(_index, skill) => (
							<>
								<td className="p-2 align-middle">
									<span className="font-medium">
										{skill.name}
									</span>
								</td>
								<td className="p-2 align-middle">
									<span className="text-muted">
										{skill.local_path
											? "—"
											: compactFormatter.format(
													skill.installs,
												)}
									</span>
								</td>
								<td className="p-2 align-middle">
									<span className="text-muted text-sm truncate block max-w-full">
										{skill.source}
									</span>
								</td>
								<td className="p-2 align-middle">
									<Button
										size="sm"
										variant="tertiary"
										onPress={() =>
											setSummarySkill(skill)
										}
									>
										{t("viewSkillIntro")}
									</Button>
								</td>
								<td className="p-2 align-middle">
									<Button
										size="sm"
										variant="tertiary"
										onPress={() =>
											handleInstallClick(skill)
										}
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
								<th className="h-12 px-2 text-left align-middle font-medium w-[14%]">
									{t("installs")}
								</th>
								<th className="h-12 px-2 text-left align-middle font-medium w-[36%]">
									{t("source")}
								</th>
								<th className="h-12 px-2 text-left align-middle font-medium w-[14%]">
									{t("skillIntro")}
								</th>
								<th className="h-12 px-4 align-middle w-[14%]" />
							</tr>
						</thead>
						<tfoot>
							{isFetchingNextPage && (
								<tr>
									<td
										colSpan={5}
										className="py-3 text-center"
									>
										<Spinner size="sm" />
									</td>
								</tr>
							)}
						</tfoot>
					</TableVirtuoso>
				</div>
			)}

			<SkillSummaryModal
				isOpen={summarySkill !== null}
				skill={summarySkill}
				api={api}
				onClose={() => setSummarySkill(null)}
			/>

			<InstallModal
				isOpen={installModalOpen}
				selectedSkill={selectedSkill}
				selectedAgents={selectedAgents}
				onSelectedAgentsChange={setSelectedAgents}
				installResults={installResults}
				isInstalling={isInstalling}
				skillAgents={skillAgents}
				installAll={installAll}
				onInstallAllChange={setInstallAll}
				installToProject={installToProject}
				canInstallToProject={canInstallToProject}
				onInstallToProjectChange={setInstallToProject}
				selectedProjectId={selectedProjectId}
				onSelectedProjectIdChange={setSelectedProjectId}
				projects={projects}
				onClose={handleCloseInstallModal}
				onInstall={handleInstall}
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
	marketSource: MarketSearchSource;
	onMarketSourceChange: (source: MarketSearchSource) => void;
	onSearch: (query: string) => void;
	showSearchButton: boolean;
}) {
	const [searchQuery, setSearchQuery] = useState(initialQuery);

	useEffect(() => {
		setSearchQuery(initialQuery);
	}, [initialQuery]);

	return (
		<SkillsHeader
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
