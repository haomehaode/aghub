import type { McpResponse } from "../generated/dto";
import type { TransportDto } from "../generated/dto";

/** Human-readable transport line for search and semantic embedding text. */
export function summarizeTransport(transport: TransportDto): string {
	switch (transport.type) {
		case "stdio":
			return [
				"stdio",
				transport.command,
				...(transport.args ?? []),
			].join(" ");
		case "sse":
			return `sse ${transport.url}`;
		case "streamable_http":
			return `streamable_http ${transport.url}`;
	}
}

/** Full text document for keyword + semantic MCP search. */
export function buildMcpSearchDocument(mcp: McpResponse): string {
	const parts = [
		mcp.name,
		summarizeTransport(mcp.transport),
		mcp.agent ?? "",
	];
	return parts.filter(Boolean).join("\n");
}
