import { InformationCircleIcon } from "@heroicons/react/24/outline";
import {
	Button,
	SearchField,
	Tabs,
	Tooltip,
} from "@heroui/react";
import { useTranslation } from "react-i18next";

type Size = "large" | "compact";

export type MarketSearchSource = "skills-sh" | "local";

interface SkillsHeaderProps {
	size: Size;
	/** When true, tabs + search stack centered (market landing). */
	centered?: boolean;
	marketSource: MarketSearchSource;
	onMarketSourceChange: (source: MarketSearchSource) => void;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	onSearch: () => void;
	showSearchButton?: boolean;
}

export function SkillsHeader({
	size,
	centered = false,
	marketSource,
	onMarketSourceChange,
	searchQuery,
	onSearchQueryChange,
	onSearch,
	showSearchButton = true,
}: SkillsHeaderProps) {
	const { t } = useTranslation();

	const isLarge = size === "large";
	const gap = isLarge ? "gap-3" : "gap-2";
	const marginBottom = isLarge ? "mb-5" : "";

	const searchPlaceholder =
		marketSource === "local"
			? t("searchInternalMarketPlaceholder")
			: t("searchMarketSkillsPlaceholder");

	return (
		<div
			className={`flex w-full min-w-0 flex-col ${gap} ${marginBottom} ${centered ? "items-center" : ""}`}
		>
			<div
				className={`flex flex-wrap items-center gap-2 ${centered ? "justify-center" : ""}`}
			>
				<Tabs
					selectedKey={marketSource}
					onSelectionChange={(key) => {
						onMarketSourceChange(key as MarketSearchSource);
					}}
				>
					<Tabs.ListContainer className="inline-flex">
						<Tabs.List
							aria-label={t("marketSearchSource")}
							className="w-auto gap-0"
						>
							<Tabs.Tab id="skills-sh" className="text-sm">
								skills.sh
								<Tabs.Indicator />
							</Tabs.Tab>
							<Tabs.Tab id="local" className="text-sm">
								{t("marketInternalSkills")}
								<Tabs.Indicator />
							</Tabs.Tab>
						</Tabs.List>
					</Tabs.ListContainer>
				</Tabs>
				<Tooltip delay={0}>
					<Tooltip.Trigger
						aria-label={t("marketSourceHint")}
						className="text-muted hover:text-fg transition-colors"
					>
						<InformationCircleIcon className="size-4" />
					</Tooltip.Trigger>
					<Tooltip.Content className="max-w-xs">
						{marketSource === "local"
							? t("dataFromLocalSkillsRepo")
							: t("dataFromSkillsSh")}
					</Tooltip.Content>
				</Tooltip>
			</div>
			{showSearchButton && centered && (
				<div className="flex w-full max-w-md flex-col items-stretch gap-3">
					<SearchField
						value={searchQuery}
						onChange={onSearchQueryChange}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								onSearch();
							}
						}}
						aria-label={t("searchMarketSkills")}
						className="w-full"
					>
						<SearchField.Group>
							<SearchField.SearchIcon />
							<SearchField.Input
								placeholder={searchPlaceholder}
							/>
							<SearchField.ClearButton />
						</SearchField.Group>
					</SearchField>
					<div className="flex flex-wrap items-center justify-center gap-2">
						<Button
							className="shrink-0"
							onPress={onSearch}
							isDisabled={searchQuery.trim().length < 2}
						>
							{t("search")}
						</Button>
					</div>
				</div>
			)}
			{showSearchButton && !centered && (
				<div className="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
					<SearchField
						value={searchQuery}
						onChange={onSearchQueryChange}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								onSearch();
							}
						}}
						aria-label={t("searchMarketSkills")}
						className="min-w-0 flex-1 max-w-2xl sm:min-w-[12rem]"
					>
						<SearchField.Group>
							<SearchField.SearchIcon />
							<SearchField.Input placeholder={searchPlaceholder} />
							<SearchField.ClearButton />
						</SearchField.Group>
					</SearchField>
					<Button
						className="shrink-0"
						onPress={onSearch}
						isDisabled={searchQuery.trim().length < 2}
					>
						{t("search")}
					</Button>
				</div>
			)}
		</div>
	);
}
