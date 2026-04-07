import type { Store } from "@tauri-apps/plugin-store";
import type { SidebarItemPreference } from "../types";

export async function migrateV6ToV7(store: Store): Promise<void> {
	const items =
		(await store.get<SidebarItemPreference[]>("sidebarItems")) ?? [];
	if (items.some((i) => i.id === "mcpMarket")) {
		return;
	}
	await store.set("sidebarItems", [
		...items,
		{ id: "mcpMarket", visible: true },
	]);
}
