import {
	Avatar,
	Button,
	Card,
	Input,
	ListBox,
	Select,
	Spinner,
	toast,
} from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { CodeEditorType } from "../../generated/dto";
import { useCurrentCodeEditor } from "../../hooks/use-integrations";
import {
	getIntegrationPreferences,
	saveIntegrationPreferences,
} from "../../lib/store";

const iconModules = import.meta.glob<{ default: string }>(
	"../../assets/agent/*.svg",
	{ eager: true, query: "?raw" },
);

const ICON_ALIASES: Record<string, string> = {
	vs_code_insiders: "vs_code",
	fleet: "rust_rover",
};

const UNDERSCORE_REGEX = /_/g;

function EditorIcon({ id, name }: { id: string; name: string }) {
	const resolvedId = ICON_ALIASES[id] ?? id;
	const path =
		iconModules[`../../assets/agent/${resolvedId}.svg`] ??
		iconModules[
			`../../assets/agent/${resolvedId.replace(UNDERSCORE_REGEX, "")}.svg`
		];
	const svg = path;

	if (svg) {
		return (
			<div
				className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4"
				// eslint-disable-next-line react-dom/no-dangerously-set-innerhtml
				dangerouslySetInnerHTML={{
					__html: (svg.default || svg) as string,
				}}
			/>
		);
	}

	return (
		<Avatar size="sm" variant="soft" className="size-5">
			<Avatar.Fallback className="text-[10px]">
				{name.charAt(0).toUpperCase()}
			</Avatar.Fallback>
		</Avatar>
	);
}

export default function IntegrationsPanel() {
	const { t } = useTranslation();
	const { codeEditors, isLoading, selectedEditor, setCurrentEditor } =
		useCurrentCodeEditor();

	const queryClient = useQueryClient();
	const { data: integrationPreferences } = useQuery({
		queryKey: ["integration-preferences"],
		queryFn: getIntegrationPreferences,
	});
	const [localSkillsRepoGitUrl, setLocalSkillsRepoGitUrl] = useState("");
	const [localMcpRepoGitUrl, setLocalMcpRepoGitUrl] = useState("");

	useEffect(() => {
		setLocalSkillsRepoGitUrl(
			integrationPreferences?.localSkillsRepoGitUrl ?? "",
		);
		setLocalMcpRepoGitUrl(integrationPreferences?.localMcpRepoGitUrl ?? "");
	}, [
		integrationPreferences?.localSkillsRepoGitUrl,
		integrationPreferences?.localMcpRepoGitUrl,
	]);

	const handleEditorChange = async (value: Key | null) => {
		if (!value) return;
		const editor = value as CodeEditorType;
		await setCurrentEditor(editor || undefined);
	};

	const handleSaveLocalSkillsRepoGitUrl = async () => {
		try {
			const nextPreferences = {
				...(integrationPreferences ?? {}),
				localSkillsRepoGitUrl: localSkillsRepoGitUrl.trim(),
			};
			await saveIntegrationPreferences(nextPreferences);
			queryClient.setQueryData(
				["integration-preferences"],
				nextPreferences,
			);
			toast.success(t("localSkillsRepoSaved"));
		} catch (error) {
			console.error("Failed to save local skills repository URL:", error);
			toast.danger(t("localSkillsRepoSaveFailed"));
		}
	};

	const handleSaveLocalMcpRepoGitUrl = async () => {
		try {
			const nextPreferences = {
				...(integrationPreferences ?? {}),
				localMcpRepoGitUrl: localMcpRepoGitUrl.trim(),
			};
			await saveIntegrationPreferences(nextPreferences);
			queryClient.setQueryData(
				["integration-preferences"],
				nextPreferences,
			);
			toast.success(t("localMcpRepoSaved"));
		} catch (error) {
			console.error("Failed to save internal MCP repository URL:", error);
			toast.danger(t("localMcpRepoSaveFailed"));
		}
	};

	if (isLoading) {
		return (
			<div className="flex h-32 items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	const installedEditors = codeEditors?.filter((e) => e.installed) || [];

	return (
		<div className="space-y-4">
			<Card className="p-4">
				<Card.Content className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<span className="text-sm font-medium text-(--foreground)">
								{t("codeEditors")}
							</span>
							<span className="block text-xs text-muted">
								{t("codeEditorsDescription")}
							</span>
						</div>
						<Select
							variant="secondary"
							selectedKey={selectedEditor || null}
							onSelectionChange={handleEditorChange}
							aria-label={t("codeEditors")}
							className="min-w-56"
						>
							<Select.Trigger>
								<Select.Value />
								<Select.Indicator />
							</Select.Trigger>
							<Select.Popover>
								<ListBox>
									{installedEditors.map((editor) => (
										<ListBox.Item
											key={editor.id}
											id={editor.id}
											textValue={editor.name}
										>
											<div className="flex items-center gap-2">
												<EditorIcon
													id={editor.id}
													name={editor.name}
												/>
												{editor.name}
											</div>
										</ListBox.Item>
									))}
								</ListBox>
							</Select.Popover>
						</Select>
					</div>
				</Card.Content>
			</Card>

			<Card className="p-4">
				<Card.Content className="space-y-3">
					<div className="space-y-0.5">
						<span className="text-sm font-medium text-(--foreground)">
							{t("localSkillsRepoGitUrl")}
						</span>
						<span className="block text-xs text-muted">
							{t("localSkillsRepoGitUrlDescription")}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Input
							className="min-w-0 flex-1"
							variant="secondary"
							value={localSkillsRepoGitUrl}
							onChange={(e) =>
								setLocalSkillsRepoGitUrl(e.target.value)
							}
							placeholder='ssh://git.example.com/skills-catalog.git'
						/>
						<Button
							className="shrink-0"
							onPress={handleSaveLocalSkillsRepoGitUrl}
						>
							{t("save")}
						</Button>
					</div>
				</Card.Content>
			</Card>

			<Card className="p-4">
				<Card.Content className="space-y-3">
					<div className="space-y-0.5">
						<span className="text-sm font-medium text-(--foreground)">
							{t("localMcpRepoGitUrl")}
						</span>
						<span className="block text-xs text-muted">
							{t("localMcpRepoGitUrlDescription")}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Input
							className="min-w-0 flex-1"
							variant="secondary"
							value={localMcpRepoGitUrl}
							onChange={(e) =>
								setLocalMcpRepoGitUrl(e.target.value)
							}
							placeholder="ssh://git.example.com/mcp-catalog.git"
						/>
						<Button
							className="shrink-0"
							onPress={handleSaveLocalMcpRepoGitUrl}
						>
							{t("save")}
						</Button>
					</div>
				</Card.Content>
			</Card>
		</div>
	);
}
