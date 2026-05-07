import { useTranslation } from "react-i18next";
import { useParams } from "wouter";
import { ProjectWorkspacePanel } from "../../components/project-workspace-panel";
import { useProjects } from "../../hooks/use-projects";

export default function ProjectDetailPage() {
	const { t } = useTranslation();
	const { id } = useParams();
	const { data: projects = [] } = useProjects();
	const project = projects.find((p) => p.id === id);

	if (!project) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted">{t("projectNotFound")}</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ProjectWorkspacePanel projectPath={project.path} />
		</div>
	);
}
