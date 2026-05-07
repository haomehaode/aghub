import { Surface } from "@heroui/react";
import { AppSidebar } from "../components/app-sidebar";
import { WindowControls } from "../components/window-controls";

export function MainLayout({ children }: { children: React.ReactNode }) {
	const isMac = navigator.userAgent.toLowerCase().includes("mac");

	return (
		<Surface
			variant="secondary"
			className="flex h-screen flex-col overflow-hidden"
		>
			<div
				className="flex h-8 shrink-0 items-center justify-between border-b border-border pl-3"
			>
				<div
					data-tauri-drag-region
					className="flex h-full flex-1 select-none items-center"
				>
					{!isMac && (
						<span className="text-xs font-medium tracking-wide text-foreground/50">
							AgentHub
						</span>
					)}
				</div>
				<WindowControls />
			</div>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<AppSidebar />
				<main
					className="
          flex min-h-0 flex-1 flex-col overflow-hidden
        "
				>
					{children}
				</main>
			</div>
		</Surface>
	);
}
