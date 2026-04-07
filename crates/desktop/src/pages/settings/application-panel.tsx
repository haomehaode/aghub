import { Button, Card } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { getName, getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { dispatchOnboardingCommand } from "../../lib/onboarding";

export default function ApplicationPanel() {
	const { t } = useTranslation();

	const { data: appInfo } = useQuery({
		queryKey: ["app-info"],
		queryFn: async () => {
			const name = await getName();
			const version = await getVersion();
			return { name, version };
		},
	});

	return (
		<div className="space-y-4">
			<Card className="p-0">
				<Card.Content className="space-y-4 p-4">
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<span className="text-sm font-medium text-(--foreground)">
								{t("appName")}
							</span>
							<span className="block text-xs text-muted">
								{appInfo?.name ?? "AgentHub"}
							</span>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<span className="text-sm font-medium text-(--foreground)">
								{t("version")}
							</span>
							<span className="block text-xs text-muted">
								{appInfo?.version ?? "0.1.0"}
							</span>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<span className="text-sm font-medium text-(--foreground)">
								{t("onboarding")}
							</span>
							<span className="block text-xs text-muted">
								{t("onboardingDescription")}
							</span>
						</div>
						<div className="flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								onPress={() =>
									dispatchOnboardingCommand({
										type: "show-welcome",
									})
								}
							>
								{t("showWelcome")}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onPress={() =>
									dispatchOnboardingCommand({
										type: "start-tour",
										tour: "product-map",
									})
								}
							>
								{t("replayAppTour")}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onPress={() =>
									dispatchOnboardingCommand({
										type: "start-tour",
										tour: "project-workflow",
									})
								}
							>
								{t("replayProjectTour")}
							</Button>
						</div>
					</div>
				</Card.Content>
			</Card>
		</div>
	);
}
