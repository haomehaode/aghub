import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
	getStarredMcps,
	getStarredSkills,
	setStarredMcps,
	setStarredSkills,
} from "../lib/store";

export function useFavorites() {
	const queryClient = useQueryClient();

	const { data: starredSkills = [] } = useQuery({
		queryKey: ["starredSkills"],
		queryFn: getStarredSkills,
	});

	const { data: starredMcps = [] } = useQuery({
		queryKey: ["starredMcps"],
		queryFn: getStarredMcps,
	});

	const starredSkillsSet = useMemo(
		() => new Set(starredSkills),
		[starredSkills],
	);
	const starredMcpsSet = useMemo(() => new Set(starredMcps), [starredMcps]);

	const isSkillStarred = useCallback(
		(name: string) => starredSkillsSet.has(name),
		[starredSkillsSet],
	);

	const isMcpStarred = useCallback(
		(mergeKey: string) => starredMcpsSet.has(mergeKey),
		[starredMcpsSet],
	);

	const toggleSkillStar = useCallback(
		async (name: string) => {
			const next = new Set(starredSkillsSet);
			if (next.has(name)) next.delete(name);
			else next.add(name);

			const arr = Array.from(next);
			queryClient.setQueryData(["starredSkills"], arr);
			await setStarredSkills(arr);
		},
		[starredSkillsSet, queryClient],
	);

	const toggleMcpStar = useCallback(
		async (mergeKey: string) => {
			const next = new Set(starredMcpsSet);
			if (next.has(mergeKey)) next.delete(mergeKey);
			else next.add(mergeKey);

			const arr = Array.from(next);
			queryClient.setQueryData(["starredMcps"], arr);
			await setStarredMcps(arr);
		},
		[starredMcpsSet, queryClient],
	);

	return {
		starredSkills: starredSkillsSet,
		starredMcps: starredMcpsSet,
		isSkillStarred,
		isMcpStarred,
		toggleSkillStar,
		toggleMcpStar,
	};
}
