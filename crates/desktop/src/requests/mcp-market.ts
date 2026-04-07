import { infiniteQueryOptions } from "@tanstack/react-query";
import type { MarketMcp } from "../generated/dto";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

const FETCH_SIZE = 100;
const MAX_TOTAL = 1000;

export type McpMarketSearchSource = "registry" | "local";

interface McpMarketSearchQueryParams {
	api: ApiClient;
	query: string;
	source?: McpMarketSearchSource;
	repoUrl?: string;
	enabled?: boolean;
	staleTime?: number;
}

export function mcpMarketSearchInfiniteQueryOptions({
	api,
	query,
	source = "registry",
	repoUrl,
	enabled = true,
	staleTime = 60_000,
}: McpMarketSearchQueryParams) {
	return infiniteQueryOptions({
		queryKey: queryKeys.market.mcpSearch(query, source, repoUrl),
		queryFn: async ({ pageParam }: { pageParam: number }) => {
			const offset = pageParam;
			const limit = Math.min(FETCH_SIZE, MAX_TOTAL - offset);
			const actualLimit = offset + limit;
			const results = await api.market.mcpSearch(
				query,
				actualLimit,
				source,
				repoUrl,
			);
			return results.slice(offset, actualLimit);
		},
		initialPageParam: 0,
		getNextPageParam: (
			lastPage: MarketMcp[],
			allPages: MarketMcp[][],
		) => {
			const totalFetched = allPages.reduce(
				(sum, page) => sum + page.length,
				0,
			);
			if (lastPage.length < FETCH_SIZE || totalFetched >= MAX_TOTAL) {
				return undefined;
			}
			return totalFetched;
		},
		enabled,
		staleTime,
	});
}
