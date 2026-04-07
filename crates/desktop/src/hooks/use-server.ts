import { use } from "react";
import type { ServerContextValue } from "../contexts/server";
import { ServerContext } from "../contexts/server";

export function useServer(): ServerContextValue {
	const ctx = use(ServerContext);
	if (!ctx) throw new Error("useServer must be used within <ServerProvider>");
	return ctx;
}
