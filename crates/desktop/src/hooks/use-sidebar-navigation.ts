import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
	DEFAULT_SIDEBAR_ITEMS,
	getSidebarItems,
	saveSidebarItems,
	type SidebarItemId,
	type SidebarItemPreference,
} from "../lib/store";
import {
	getDefaultSidebarHref,
	normalizeSidebarItems,
	resolveSidebarItems,
} from "../lib/sidebar-navigation";

const SIDEBAR_NAVIGATION_QUERY_KEY = ["sidebar-navigation"];

export function useSidebarNavigation() {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: SIDEBAR_NAVIGATION_QUERY_KEY,
		queryFn: getSidebarItems,
	});

	const sidebarItems = useMemo(
		() => normalizeSidebarItems(data ?? DEFAULT_SIDEBAR_ITEMS),
		[data],
	);
	const resolvedSidebarItems = useMemo(
		() => resolveSidebarItems(sidebarItems),
		[sidebarItems],
	);
	const visibleSidebarItems = useMemo(
		() => resolvedSidebarItems.filter((item) => item.visible),
		[resolvedSidebarItems],
	);
	const defaultHref = useMemo(
		() => getDefaultSidebarHref(sidebarItems),
		[sidebarItems],
	);

	const updateSidebarItems = useCallback(
		async (
			updater: (
				current: SidebarItemPreference[],
			) => SidebarItemPreference[],
		) => {
			const previous = normalizeSidebarItems(
				(queryClient.getQueryData(SIDEBAR_NAVIGATION_QUERY_KEY) as
					| SidebarItemPreference[]
					| undefined) ?? sidebarItems,
			);
			const next = normalizeSidebarItems(updater(previous));

			queryClient.setQueryData(SIDEBAR_NAVIGATION_QUERY_KEY, next);

			try {
				await saveSidebarItems(next);
			} catch (error) {
				queryClient.setQueryData(
					SIDEBAR_NAVIGATION_QUERY_KEY,
					previous,
				);
				throw error;
			}
		},
		[queryClient, sidebarItems],
	);

	const setItemVisibility = useCallback(
		async (id: SidebarItemId, visible: boolean) => {
			await updateSidebarItems((current) => {
				const visibleCount = current.filter(
					(item) => item.visible,
				).length;
				const isLastVisibleItem =
					!visible &&
					visibleCount === 1 &&
					current.some((item) => item.id === id && item.visible);

				if (isLastVisibleItem) {
					return current;
				}

				return current.map((item) =>
					item.id === id ? { ...item, visible } : item,
				);
			});
		},
		[updateSidebarItems],
	);

	const moveItem = useCallback(
		async (id: SidebarItemId, direction: "up" | "down") => {
			await updateSidebarItems((current) => {
				const index = current.findIndex((item) => item.id === id);
				const targetIndex = direction === "up" ? index - 1 : index + 1;

				if (
					index === -1 ||
					targetIndex < 0 ||
					targetIndex >= current.length
				) {
					return current;
				}

				const next = [...current];
				const [item] = next.splice(index, 1);

				next.splice(targetIndex, 0, item);

				return next;
			});
		},
		[updateSidebarItems],
	);

	const resetSidebarItems = useCallback(async () => {
		const previous = sidebarItems;

		queryClient.setQueryData(
			SIDEBAR_NAVIGATION_QUERY_KEY,
			DEFAULT_SIDEBAR_ITEMS,
		);

		try {
			await saveSidebarItems(DEFAULT_SIDEBAR_ITEMS);
		} catch (error) {
			queryClient.setQueryData(SIDEBAR_NAVIGATION_QUERY_KEY, previous);
			throw error;
		}
	}, [queryClient, sidebarItems]);

	return {
		defaultHref,
		isLoading,
		moveItem,
		resetSidebarItems,
		resolvedSidebarItems,
		setItemVisibility,
		sidebarItems,
		visibleSidebarItems,
	};
}
