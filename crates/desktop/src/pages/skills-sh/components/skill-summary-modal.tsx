import { Button, Modal, Spinner } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MarketSkill } from "../../../generated/dto";
import type { ApiClient } from "../../../requests/client";
import { skillsShSkillPageUrl } from "../utils";

type LoadState = "idle" | "loading" | "done" | "error";

interface SkillSummaryModalProps {
	isOpen: boolean;
	skill: MarketSkill | null;
	api: ApiClient;
	onClose: () => void;
}

export function SkillSummaryModal({
	isOpen,
	skill,
	api,
	onClose,
}: SkillSummaryModalProps) {
	const { t } = useTranslation();
	const [summary, setSummary] = useState<string | null>(null);
	const [pageUrl, setPageUrl] = useState<string | null>(null);
	const [loadState, setLoadState] = useState<LoadState>("idle");

	useEffect(() => {
		if (!isOpen || !skill) {
			setSummary(null);
			setPageUrl(null);
			setLoadState("idle");
			return;
		}

		const fromSkill = skill.description?.trim();
		const shUrl = skillsShSkillPageUrl(skill);
		setPageUrl(shUrl);

		if (fromSkill) {
			setSummary(fromSkill);
			setLoadState("done");
			return;
		}

		if (!shUrl) {
			setSummary(null);
			setLoadState("done");
			return;
		}

		setSummary(null);
		setLoadState("loading");
		let cancelled = false;
		void api.market
			.skillSummary(skill.source, skill.slug)
			.then((r) => {
				if (cancelled) {
					return;
				}
				setSummary(r.summary?.trim() ?? null);
				setPageUrl(r.page_url);
				setLoadState("done");
			})
			.catch(() => {
				if (cancelled) {
					return;
				}
				setLoadState("error");
			});

		return () => {
			cancelled = true;
		};
	}, [isOpen, skill, api]);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<Modal.Container>
				<Modal.Dialog className="max-w-lg">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>{skill?.name ?? ""}</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="max-h-[min(60vh,24rem)] overflow-y-auto">
						{loadState === "loading" ? (
							<div className="flex justify-center py-8">
								<Spinner size="lg" />
							</div>
						) : null}
						{loadState === "error" ? (
							<p className="text-sm text-muted">
								{t("skillSummaryError")}
							</p>
						) : null}
						{loadState === "done" && summary ? (
							<p className="text-sm text-muted whitespace-pre-wrap">
								{summary}
							</p>
						) : null}
						{loadState === "done" && !summary ? (
							<p className="text-sm text-muted italic">
								{t("skillSummaryEmpty")}
							</p>
						) : null}
					</Modal.Body>
					<Modal.Footer className="gap-2">
						{pageUrl ? (
							<Button
								variant="secondary"
								onPress={() => void openUrl(pageUrl)}
							>
								{t("openSkillsShPage")}
							</Button>
						) : null}
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
