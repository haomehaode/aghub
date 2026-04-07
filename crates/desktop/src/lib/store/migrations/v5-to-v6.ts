import type { Store } from "@tauri-apps/plugin-store";
import { DEFAULT_SIDEBAR_ITEMS } from "../types";

export async function migrateV5ToV6(store: Store): Promise<void> {
	await store.set("sidebarItems", DEFAULT_SIDEBAR_ITEMS);
}
