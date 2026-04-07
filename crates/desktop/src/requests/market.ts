import { infiniteQueryOptions } from "@tanstack/react-query";
import type { MarketSkill } from "../generated/dto";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

const FETCH_SIZE = 100;
const MAX_TOTAL = 1000;

interface MarketSearchQueryParams {
	api: ApiClient;
	query: string;
	source?: "skills-sh" | "local";
	repoUrl?: string;
	enabled?: boolean;
	staleTime?: number;
}

export function marketSearchInfiniteQueryOptions({
	api,
	query,
	source = "skills-sh",
	repoUrl,
	enabled = true,
	staleTime = 60_000,
}: MarketSearchQueryParams) {
	return infiniteQueryOptions({
		queryKey: queryKeys.market.search(query, source, repoUrl),
		queryFn: async ({ pageParam }: { pageParam: number }) => {
			const offset = pageParam;
			const limit = Math.min(FETCH_SIZE, MAX_TOTAL - offset);
			const actualLimit = offset + limit;
			const results = await api.market.search(
				query,
				actualLimit,
				source,
				repoUrl,
			);
			return results.slice(offset, actualLimit);
		},
		initialPageParam: 0,
		getNextPageParam: (
			lastPage: MarketSkill[],
			allPages: MarketSkill[][],
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
