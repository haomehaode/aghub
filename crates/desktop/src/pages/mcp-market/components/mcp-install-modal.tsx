import { Button, Modal } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AgentSelector } from "../../../components/agent-selector";
import { ResultStatusItem } from "../../../components/result-status-item";
import type { MarketMcp } from "../../../generated/dto";
import type { InstallResult } from "../../../lib/install-utils";

interface McpInstallModalProps {
	isOpen: boolean;
	selectedMcp: MarketMcp | null;
	selectedAgents: Set<string>;
	onSelectedAgentsChange: (agents: Set<string>) => void;
	installResults: InstallResult[];
	isInstalling: boolean;
	mcpAgents: ReturnType<
		typeof import("../hooks/use-mcp-install").useMcpInstall
	>["mcpAgents"];
	onClose: () => void;
	onInstall: () => void;
}

export function McpInstallModal({
	isOpen,
	selectedMcp,
	selectedAgents,
	onSelectedAgentsChange,
	installResults,
	isInstalling,
	mcpAgents,
	onClose,
	onInstall,
}: McpInstallModalProps) {
	const { t } = useTranslation();

	return (
		<Modal.Backdrop isOpen={isOpen} onOpenChange={onClose}>
			<Modal.Container>
				<Modal.Dialog className="max-w-md">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>{t("installMcpServer")}</Modal.Heading>
					</Modal.Header>

					<Modal.Body className="p-2">
						{selectedMcp && (
							<div className="mb-4 rounded-lg border border-border p-3 space-y-1">
								<div className="text-sm font-medium">
									{selectedMcp.name}
								</div>
								{selectedMcp.description && (
									<p className="text-xs text-muted">
										{selectedMcp.description}
									</p>
								)}
								<p className="text-xs text-muted truncate">
									{selectedMcp.source}
								</p>
							</div>
						)}

						{installResults.length === 0 && (
							<div className="space-y-4">
								<p className="text-sm text-muted">
									{t("selectAgentsForMcp")}
								</p>
								<AgentSelector
									agents={mcpAgents}
									selectedKeys={selectedAgents}
									onSelectionChange={onSelectedAgentsChange}
									emptyMessage={t("noTargetAgents")}
									showSelectedIcon
									variant="secondary"
								/>
							</div>
						)}

						{installResults.length > 0 && (
							<div className="space-y-3">
								{installResults.map((result) => (
									<ResultStatusItem
										key={result.agentId}
										displayName={result.displayName}
										status={result.status}
										statusText={
											result.status === "pending"
												? t("installing")
												: result.status === "success"
													? t("installSuccess")
													: ""
										}
										error={result.error}
									/>
								))}
							</div>
						)}
					</Modal.Body>

					<Modal.Footer>
						{installResults.length === 0 && (
							<>
								<Button slot="close" variant="secondary">
									{t("cancel")}
								</Button>
								<Button
									onPress={onInstall}
									isDisabled={
										isInstalling ||
										selectedAgents.size === 0
									}
								>
									{isInstalling
										? t("installing")
										: t("install")}
								</Button>
							</>
						)}
						{installResults.length > 0 && (
							<Button slot="close" variant="secondary">
								{t("done")}
							</Button>
						)}
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
