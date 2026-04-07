import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Button, SearchField, Tabs, Tooltip } from "@heroui/react";
import { useTranslation } from "react-i18next";

type Size = "large" | "compact";

export type McpMarketSearchSource = "registry" | "local";

interface McpHeaderProps {
	size: Size;
	centered?: boolean;
	marketSource: McpMarketSearchSource;
	onMarketSourceChange: (source: McpMarketSearchSource) => void;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	onSearch: () => void;
	showSearchButton?: boolean;
}

export function McpHeader({
	size,
	centered = false,
	marketSource,
	onMarketSourceChange,
	searchQuery,
	onSearchQueryChange,
	onSearch,
	showSearchButton = true,
}: McpHeaderProps) {
	const { t } = useTranslation();

	const isLarge = size === "large";
	const gap = isLarge ? "gap-3" : "gap-2";
	const marginBottom = isLarge ? "mb-5" : "";

	const searchPlaceholder =
		marketSource === "local"
			? t("searchInternalMcpMarketPlaceholder")
			: t("searchPublicMcpMarketPlaceholder");

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
						onMarketSourceChange(key as McpMarketSearchSource);
					}}
				>
					<Tabs.ListContainer className="inline-flex">
						<Tabs.List
							aria-label={t("mcpMarketSearchSource")}
							className="w-auto gap-0"
						>
							<Tabs.Tab
								id="registry"
								className="text-sm whitespace-nowrap"
							>
								{t("mcpMarketRegistry")}
								<Tabs.Indicator />
							</Tabs.Tab>
							<Tabs.Tab
								id="local"
								className="text-sm whitespace-nowrap"
							>
								{t("mcpMarketInternal")}
								<Tabs.Indicator />
							</Tabs.Tab>
						</Tabs.List>
					</Tabs.ListContainer>
				</Tabs>
				<Tooltip delay={0}>
					<Tooltip.Trigger
						aria-label={t("mcpMarketSourceHint")}
						className="text-muted hover:text-fg transition-colors"
					>
						<InformationCircleIcon className="size-4" />
					</Tooltip.Trigger>
					<Tooltip.Content className="max-w-xs">
						{marketSource === "local"
							? t("mcpMarketDataFromInternalRepo")
							: t("mcpMarketDataFromRegistry")}
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
						aria-label={t("searchMcpMarket")}
						className="w-full"
					>
						<SearchField.Group>
							<SearchField.SearchIcon />
							<SearchField.Input placeholder={searchPlaceholder} />
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
				<div className="flex w-full min-w-0 flex-wrap items-center gap-2">
					<SearchField
						value={searchQuery}
						onChange={onSearchQueryChange}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								onSearch();
							}
						}}
						aria-label={t("searchMcpMarket")}
						className="min-w-0 flex-1"
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
