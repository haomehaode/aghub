import { ListBox, Select } from "@heroui/react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { Project } from "../lib/store";

interface ProjectSelectorProps {
	projects: Project[];
	selectedKey: string | null;
	onSelectionChange: (key: string | null) => void;
	placeholder?: string;
	emptyMessage?: string;
	className?: string;
}

export function ProjectSelector({
	projects,
	selectedKey,
	onSelectionChange,
	placeholder,
	emptyMessage,
	className,
}: ProjectSelectorProps) {
	const { t } = useTranslation();

	const handleSelectionChange = (key: Key | null) => {
		onSelectionChange(key as string | null);
	};

	return (
		<div className={className}>
			<Select
				variant="secondary"
				selectedKey={selectedKey}
				onSelectionChange={handleSelectionChange}
				placeholder={placeholder || t("selectProject")}
			>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				<Select.Popover>
					<ListBox>
						{projects.length === 0 ? (
							<ListBox.Item
								id="empty"
								textValue={emptyMessage || t("noProjects")}
								isDisabled
							>
								<span className="text-muted">
									{emptyMessage || t("noProjects")}
								</span>
							</ListBox.Item>
						) : (
							projects.map((project) => (
								<ListBox.Item
									key={project.id}
									id={project.id}
									textValue={project.name}
								>
									{project.name}
								</ListBox.Item>
							))
						)}
					</ListBox>
				</Select.Popover>
			</Select>
		</div>
	);
}
