import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MarketSkill } from "../../../generated/dto";
import { useAgentAvailability } from "../../../hooks/use-agent-availability";
import { useApi } from "../../../hooks/use-api";
import { useInstallTarget } from "../../../hooks/use-install-target";
import { supportsSkillMutation } from "../../../lib/agent-capabilities";
import { getIntegrationPreferences } from "../../../lib/store";
import {
	buildPendingResults,
	type InstallResult,
} from "../../../lib/install-utils";
import {
	installSkillMutationOptions,
	invalidateSkillQueries,
} from "../../../requests/skills";

export function useSkillInstall() {
	const api = useApi();
	const queryClient = useQueryClient();
	const { availableAgents } = useAgentAvailability();
	const {
		projects,
		installToProject,
		setInstallToProject,
		selectedProjectId,
		selectedProject,
		canInstallToProject,
		setSelectedProjectId,
		resetInstallTarget,
	} = useInstallTarget();
	const installMutation = useMutation(
		installSkillMutationOptions({
			api,
			queryClient,
		}),
	);
	const { data: integrationPreferences } = useQuery({
		queryKey: ["integration-preferences"],
		queryFn: getIntegrationPreferences,
	});

	const [installModalOpen, setInstallModalOpen] = useState(false);
	const [selectedSkill, setSelectedSkill] = useState<MarketSkill | null>(
		null,
	);
	const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
		() => new Set(),
	);
	const [installResults, setInstallResults] = useState<InstallResult[]>([]);
	const [isInstalling, setIsInstalling] = useState(false);
	const [installAll, setInstallAll] = useState(false);

	const skillAgents = availableAgents.filter(
		(a) =>
			a.isUsable &&
			supportsSkillMutation(a, installToProject ? "project" : "global"),
	);

	const handleInstallClick = (skill: MarketSkill) => {
		setSelectedSkill(skill);
		setSelectedAgents(new Set());
		setInstallResults([]);
		setInstallAll(false);
		resetInstallTarget();
		setInstallModalOpen(true);
	};

	const handleInstall = async () => {
		if (!selectedSkill) return;
		if (selectedAgents.size === 0) return;
		if (installToProject && !selectedProjectId) return;

		setIsInstalling(true);

		const pendingResults = buildPendingResults(
			selectedAgents,
			availableAgents,
		);
		setInstallResults(pendingResults);

		try {
			const isInternalGitMarketSkill =
				selectedSkill.source.startsWith("local/");
			if (selectedSkill.local_path && !isInternalGitMarketSkill) {
				const projectPath = installToProject
					? selectedProject?.path
					: undefined;
				const settled = await Promise.all(
					Array.from(selectedAgents).map(async (agentId) => {
						try {
							await api.skills.import(
								agentId,
								{ path: selectedSkill.local_path! },
								projectPath,
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
				const updatedResults = pendingResults.map((result) => {
					const r = settled.find(
						(x) => x.agentId === result.agentId,
					);
					if (!r) return result;
					return {
						...result,
						status: r.ok
							? ("success" as const)
							: ("error" as const),
						error: r.err,
					};
				});
				setInstallResults(updatedResults);
				if (settled.some((x) => x.ok)) {
					await invalidateSkillQueries(queryClient);
				}
			} else {
				const response = await installMutation.mutateAsync({
					source: selectedSkill.source,
					agents: Array.from(selectedAgents),
					skills: installAll ? [] : [selectedSkill.name],
					scope: installToProject ? "project" : "global",
					project_path: selectedProject?.path ?? null,
					install_all: installAll,
					local_repo_git_url:
						integrationPreferences?.localSkillsRepoGitUrl?.trim() ||
						null,
				});

				const updatedResults = pendingResults.map((result) => ({
					...result,
					status: (response.success ? "success" : "error") as
						| "success"
						| "error",
					error: response.success ? undefined : response.stderr,
				}));

				setInstallResults(updatedResults);
			}
		} catch (err) {
			const updatedResults = pendingResults.map((result) => ({
				...result,
				status: "error" as const,
				error: err instanceof Error ? err.message : String(err),
			}));
			setInstallResults(updatedResults);
		}

		setIsInstalling(false);
	};

	const handleCloseInstallModal = () => {
		setInstallModalOpen(false);
		setSelectedSkill(null);
		setSelectedAgents(new Set());
		setInstallResults([]);
		setInstallAll(false);
		resetInstallTarget();
	};

	return {
		installModalOpen,
		selectedSkill,
		selectedAgents,
		setSelectedAgents,
		installResults,
		isInstalling,
		skillAgents,
		installAll,
		setInstallAll,
		installToProject,
		setInstallToProject,
		canInstallToProject,
		selectedProjectId,
		setSelectedProjectId,
		projects,
		handleInstallClick,
		handleInstall,
		handleCloseInstallModal,
	};
}
