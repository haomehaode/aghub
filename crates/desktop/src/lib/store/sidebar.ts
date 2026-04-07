import { normalizeSidebarItems } from "../sidebar-navigation";
import { getStore } from ".";
import { DEFAULT_SIDEBAR_ITEMS, type SidebarItemPreference } from "./types";

export async function getSidebarItems(): Promise<SidebarItemPreference[]> {
	const store = await getStore();
	const items = await store.get<SidebarItemPreference[]>("sidebarItems");

	return normalizeSidebarItems(items ?? DEFAULT_SIDEBAR_ITEMS);
}

export async function saveSidebarItems(
	items: SidebarItemPreference[],
): Promise<void> {
	const store = await getStore();

	await store.set("sidebarItems", normalizeSidebarItems(items));
	await store.save();
}
