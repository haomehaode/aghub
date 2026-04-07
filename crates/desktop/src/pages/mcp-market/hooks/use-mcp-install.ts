import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MarketMcp } from "../../../generated/dto";
import { useAgentAvailability } from "../../../hooks/use-agent-availability";
import { useApi } from "../../../hooks/use-api";
import {
	supportsMcp,
	supportsMcpTransport,
} from "../../../lib/agent-capabilities";
import {
	buildPendingResults,
	type InstallResult,
} from "../../../lib/install-utils";
import { queryKeys } from "../../../requests/keys";

export function useMcpInstall() {
	const api = useApi();
	const queryClient = useQueryClient();
	const { availableAgents } = useAgentAvailability();

	const [installModalOpen, setInstallModalOpen] = useState(false);
	const [selectedMcp, setSelectedMcp] = useState<MarketMcp | null>(null);
	const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
		() => new Set(),
	);
	const [installResults, setInstallResults] = useState<InstallResult[]>([]);
	const [isInstalling, setIsInstalling] = useState(false);

	const mcpAgents = availableAgents.filter((a) => {
		if (!a.isUsable || !supportsMcp(a) || !selectedMcp) return false;
		return supportsMcpTransport(a, selectedMcp.transport);
	});

	const handleInstallClick = (entry: MarketMcp) => {
		setSelectedMcp(entry);
		setSelectedAgents(new Set());
		setInstallResults([]);
		setInstallModalOpen(true);
	};

	const handleInstall = async () => {
		if (!selectedMcp) return;
		if (selectedAgents.size === 0) return;

		setIsInstalling(true);
		const pendingResults = buildPendingResults(
			selectedAgents,
			availableAgents,
		);
		setInstallResults(pendingResults);

		try {
			const settled = await Promise.all(
				Array.from(selectedAgents).map(async (agentId) => {
					try {
						await api.mcps.create(
							agentId,
							"global",
							{
								name: selectedMcp.name,
								transport: selectedMcp.transport,
								timeout: null,
							},
							undefined,
						);
						return {
							agentId,
							ok: true as const,
							err: undefined as string | undefined,
						};
					} catch (err) {
						return {
							agentId,
							ok: false as const,
							err:
								err instanceof Error
									? err.message
									: String(err),
						};
					}
				}),
			);

			const updated = pendingResults.map((result) => {
				const r = settled.find((x) => x.agentId === result.agentId);
				if (!r) return result;
				return {
					...result,
					status: r.ok ? ("success" as const) : ("error" as const),
					error: r.err,
				};
			});
			setInstallResults(updated);
			await queryClient.invalidateQueries({
				queryKey: queryKeys.mcps.all(),
			});
		} finally {
			setIsInstalling(false);
		}
	};

	const handleCloseInstallModal = () => {
		setInstallModalOpen(false);
		setSelectedMcp(null);
	};

	return {
		installModalOpen,
		selectedMcp,
		selectedAgents,
		setSelectedAgents,
		installResults,
		isInstalling,
		mcpAgents,
		handleInstallClick,
		handleInstall,
		handleCloseInstallModal,
	};
}
