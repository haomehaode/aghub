import { Button, Modal } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import type { MarketMcp } from "../../../generated/dto";

interface McpSummaryModalProps {
	isOpen: boolean;
	entry: MarketMcp | null;
	onClose: () => void;
}

export function McpSummaryModal({
	isOpen,
	entry,
	onClose,
}: McpSummaryModalProps) {
	const { t } = useTranslation();

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Modal.Container>
				<Modal.Dialog className="max-w-lg">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>{entry?.name ?? ""}</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="max-h-[min(60vh,24rem)] overflow-y-auto">
						{entry?.description ? (
							<p className="text-sm text-muted whitespace-pre-wrap">
								{entry.description}
							</p>
						) : (
							<p className="text-sm text-muted italic">
								{t("mcpSummaryEmpty")}
							</p>
						)}
					</Modal.Body>
					<Modal.Footer className="gap-2">
						{entry?.repo_url ? (
							<Button
								variant="secondary"
								onPress={() => void openUrl(entry.repo_url!)}
							>
								{t("openGithubRepo")}
							</Button>
						) : null}
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
