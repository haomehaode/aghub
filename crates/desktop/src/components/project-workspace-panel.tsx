import {
	ArrowPathIcon,
	ArrowUpIcon,
	ChevronDoubleUpIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	FolderIcon,
	HandRaisedIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import {
	Button,
	Dropdown,
	Spinner,
	Tabs,
	TextArea,
	TextField,
	toast,
	Tooltip,
} from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api";
import { useCurrentCodeEditor } from "../hooks/use-integrations";
import { openWithEditorMutationOptions } from "../requests/integrations";
import { cn } from "../lib/utils";

const COMPOSER_ATTACH_EXTENSIONS = [
	"txt",
	"md",
	"mdx",
	"json",
	"rs",
	"toml",
	"yaml",
	"yml",
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"css",
	"scss",
	"html",
	"vue",
	"svelte",
	"py",
	"go",
	"java",
	"kt",
	"kts",
	"c",
	"h",
	"cpp",
	"hpp",
	"cc",
	"cs",
	"rb",
	"php",
	"swift",
	"sh",
	"bash",
	"zsh",
	"sql",
	"xml",
	"svg",
	"graphql",
	"gql",
	"astro",
];

type WorkspaceChatTurn = {
	role: "user" | "assistant";
	content: string;
};

type WorkspaceChatSession = {
	id: string;
	title: string;
	messages: WorkspaceChatTurn[];
	updatedAt: number;
};

type WorkspaceChatStoreV2 = {
	version: 2;
	sessions: WorkspaceChatSession[];
	activeSessionId: string;
};

type WorkspaceDirEntry = {
	name: string;
	path_relative: string;
	is_directory: boolean;
};

function chatStorageKeyV1(projectPath: string): string {
	return `aghub.workspaceChat.v1:${encodeURIComponent(projectPath)}`;
}

function chatStorageKeyV2(projectPath: string): string {
	return `aghub.workspaceChat.v2:${encodeURIComponent(projectPath)}`;
}

function truncateChatTitle(text: string, max = 52): string {
	const t = text.trim().replace(/\s+/g, " ");
	const line = (t.split("\n")[0] ?? "").trim();
	if (line.length === 0) return "";
	if (line.length <= max) return line;
	return `${line.slice(0, max)}…`;
}

function newChatSession(defaultTitle: string): WorkspaceChatSession {
	return {
		id: crypto.randomUUID(),
		title: defaultTitle.trim() || "Chat",
		messages: [],
		updatedAt: Date.now(),
	};
}

function normalizeSession(raw: WorkspaceChatSession): WorkspaceChatSession {
	return {
		id: raw.id,
		title: typeof raw.title === "string" ? raw.title : "",
		messages: Array.isArray(raw.messages) ? raw.messages : [],
		updatedAt:
			typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
	};
}

function parseChatStore(
	projectPath: string,
	defaultTitle: string,
): WorkspaceChatStoreV2 {
	const fallbackTitle = defaultTitle.trim() || "Chat";
	try {
		const v2raw = localStorage.getItem(chatStorageKeyV2(projectPath));
		if (v2raw) {
			const p = JSON.parse(v2raw) as WorkspaceChatStoreV2;
			if (
				p?.version === 2 &&
				Array.isArray(p.sessions) &&
				p.sessions.length > 0 &&
				typeof p.activeSessionId === "string"
			) {
				const sessions = p.sessions.map(normalizeSession);
				const activeOk = sessions.some(
					(s) => s.id === p.activeSessionId,
				);
				return {
					version: 2,
					sessions,
					activeSessionId: activeOk
						? p.activeSessionId
						: sessions[0].id,
				};
			}
		}

		const v1raw = localStorage.getItem(chatStorageKeyV1(projectPath));
		if (v1raw) {
			const arr = JSON.parse(v1raw) as unknown;
			if (Array.isArray(arr)) {
				const s = newChatSession(fallbackTitle);
				s.messages = arr as WorkspaceChatTurn[];
				const firstUser = s.messages.find((m) => m.role === "user");
				if (firstUser) {
					s.title = truncateChatTitle(firstUser.content) || s.title;
				}
				s.updatedAt = Date.now();
				try {
					localStorage.removeItem(chatStorageKeyV1(projectPath));
				} catch {
					/* ignore */
				}
				return {
					version: 2,
					sessions: [s],
					activeSessionId: s.id,
				};
			}
		}
	} catch {
		/* ignore */
	}

	const s = newChatSession(fallbackTitle);
	return {
		version: 2,
		sessions: [s],
		activeSessionId: s.id,
	};
}

function isReaderStylePath(rel: string): boolean {
	return /\.(md|mdx|markdown|txt|rst)$/i.test(rel);
}

interface ProjectWorkspacePanelProps {
	projectPath: string;
}

export function ProjectWorkspacePanel({
	projectPath,
}: ProjectWorkspacePanelProps) {
	const { t } = useTranslation();
	const api = useApi();
	const queryClient = useQueryClient();
	const { selectedEditor } = useCurrentCodeEditor();

	const openInEditorMutation = useMutation({
		...openWithEditorMutationOptions({ api }),
		onSuccess: () => {
			toast.success(t("openEditorTriggered"));
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error
					? error.message
					: t("openEditorFailed"),
			);
		},
	});

	const handleOpenProjectInEditor = useCallback(() => {
		if (!selectedEditor) {
			toast.warning(t("selectCodeEditorFirst"));
			return;
		}
		openInEditorMutation.mutate({
			path: projectPath,
			editor: selectedEditor,
		});
	}, [projectPath, selectedEditor, openInEditorMutation, t]);
	const [workspaceTab, setWorkspaceTab] = useState<"files" | "chat">("files");
	const [chatStore, setChatStore] = useState<WorkspaceChatStoreV2 | null>(
		null,
	);
	const skipNextPersistRef = useRef(false);
	const workspaceChatScrollRef = useRef<HTMLDivElement>(null);
	const [draft, setDraft] = useState("");
	const [composerMode, setComposerMode] = useState<"direct" | "plan">(
		"direct",
	);

	const focusComposer = useCallback(() => {
		document.getElementById("workspace-claude-composer")?.focus();
	}, []);

	const handleAttachFilesForClaude = useCallback(async () => {
		try {
			const selected = await open({
				multiple: true,
				filters: [
					{
						name: "Text & code",
						extensions: [...COMPOSER_ATTACH_EXTENSIONS],
					},
				],
			});
			if (selected === null) return;
			const paths = Array.isArray(selected) ? selected : [selected];
			let appended = "";
			for (const path of paths) {
				const text = await invoke<string>("workspace_read_text_file", {
					path,
				});
				const norm = path.replace(/\\/g, "/");
				const name = norm.split("/").pop() ?? norm;
				appended += `\n\n--- ${t("workspaceComposerAttachedMarker", { name })} ---\n${text}\n---\n`;
			}
			setDraft((d) => (d ? `${d}${appended}` : appended.trimStart()));
			toast.success(
				t("workspaceComposerAttachOk", { count: paths.length }),
			);
			focusComposer();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			toast.danger(msg);
		}
	}, [t, focusComposer]);

	const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>(
		{},
	);
	const [selectedFileRel, setSelectedFileRel] = useState<string | null>(null);

	useEffect(() => {
		skipNextPersistRef.current = true;
		setChatStore(parseChatStore(projectPath, t("workspaceChatNewSession")));
	}, [projectPath, t]);

	useEffect(() => {
		if (!chatStore) return;
		if (skipNextPersistRef.current) {
			skipNextPersistRef.current = false;
			return;
		}
		try {
			localStorage.setItem(
				chatStorageKeyV2(projectPath),
				JSON.stringify(chatStore),
			);
		} catch {
			/* ignore quota */
		}
	}, [chatStore, projectPath]);

	const sortedSessions = useMemo(() => {
		if (!chatStore) return [];
		return [...chatStore.sessions].sort(
			(a, b) => b.updatedAt - a.updatedAt,
		);
	}, [chatStore]);

	const activeSessionId = chatStore?.activeSessionId ?? "";

	const activeMessages = useMemo(() => {
		if (!chatStore) return [];
		const s = chatStore.sessions.find(
			(x) => x.id === chatStore.activeSessionId,
		);
		return s?.messages ?? [];
	}, [chatStore]);

	const claudeMutation = useMutation({
		mutationFn: async (payload: {
			prompt: string;
			sessionId: string;
			continueSession: boolean;
			permissionMode: string;
		}) => {
			const text = await invoke<string>("workspace_run_claude_code", {
				projectPath,
				prompt: payload.prompt,
				sessionId: payload.sessionId,
				continueSession: payload.continueSession,
				permissionMode: payload.permissionMode,
			});
			return { text, sessionId: payload.sessionId };
		},
		onSuccess: ({ text, sessionId }) => {
			queryClient.invalidateQueries({
				queryKey: ["workspace-files", projectPath],
			});
			queryClient.invalidateQueries({
				queryKey: ["workspace-file", projectPath],
			});
			setChatStore((store) => {
				if (!store) return store;
				return {
					...store,
					sessions: store.sessions.map((s) =>
						s.id === sessionId
							? {
									...s,
									messages: [
										...s.messages,
										{
											role: "assistant",
											content:
												text != null &&
												text.trim().length >
													0
													? text
													: t(
															"workspaceClaudeNoCliOutput",
														),
										},
									],
									updatedAt: Date.now(),
								}
							: s,
					),
				};
			});
		},
		onError: (e: unknown, variables) => {
			const msg = e instanceof Error ? e.message : String(e);
			const sessionId = variables.sessionId;
			setChatStore((store) => {
				if (!store) return store;
				return {
					...store,
					sessions: store.sessions.map((s) =>
						s.id === sessionId
							? {
									...s,
									messages: [
										...s.messages,
										{
											role: "assistant",
											content: `${t("workspaceClaudeErrorPrefix")}: ${msg}`,
										},
									],
									updatedAt: Date.now(),
								}
							: s,
					),
				};
			});
			toast.danger(msg);
		},
	});

	const scrollWorkspaceChatToBottom = useCallback(() => {
		const el = workspaceChatScrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, []);

	useEffect(() => {
		if (workspaceTab !== "chat") return;
		const id = window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				scrollWorkspaceChatToBottom();
			});
		});
		return () => cancelAnimationFrame(id);
	}, [
		workspaceTab,
		activeMessages,
		activeSessionId,
		claudeMutation.isPending,
		scrollWorkspaceChatToBottom,
	]);

	const rootFilesQuery = useQuery({
		queryKey: ["workspace-files", projectPath, ""],
		queryFn: () =>
			invoke<WorkspaceDirEntry[]>("workspace_list_project_entries", {
				projectPath,
				relativeDir: "",
			}),
		enabled: workspaceTab === "files",
	});

	const expandedPathsSorted = useMemo(
		() =>
			Object.keys(treeExpanded)
				.filter((p) => treeExpanded[p])
				.sort(),
		[treeExpanded],
	);

	const expandedFolderQueries = useQueries({
		queries: expandedPathsSorted.map((relDir) => ({
			queryKey: ["workspace-files", projectPath, relDir],
			queryFn: () =>
				invoke<WorkspaceDirEntry[]>("workspace_list_project_entries", {
					projectPath,
					relativeDir: relDir,
				}),
			enabled: workspaceTab === "files",
		})),
	});

	const folderQueryByPath = useMemo(() => {
		const m = new Map<
			string,
			{
				isLoading: boolean;
				isFetching: boolean;
				isError: boolean;
				error: unknown;
				data: WorkspaceDirEntry[] | undefined;
			}
		>();
		expandedPathsSorted.forEach((dir, i) => {
			const q = expandedFolderQueries[i];
			if (!q) return;
			m.set(dir, {
				isLoading: q.isLoading,
				isFetching: q.isFetching,
				isError: q.isError,
				error: q.error,
				data: q.data,
			});
		});
		return m;
	}, [expandedPathsSorted, expandedFolderQueries]);

	const toggleTreeDir = useCallback((relPath: string) => {
		setTreeExpanded((prev) => ({
			...prev,
			[relPath]: !prev[relPath],
		}));
	}, []);

	const collapseAllTreeDirs = useCallback(() => {
		setTreeExpanded({});
	}, []);

	const filesTreeAnyFetching =
		rootFilesQuery.isFetching ||
		expandedFolderQueries.some((q) => q.isFetching);

	const fileContentQuery = useQuery({
		queryKey: ["workspace-file", projectPath, selectedFileRel],
		queryFn: () =>
			invoke<string>("workspace_read_project_file", {
				projectPath,
				relativePath: selectedFileRel!,
			}),
		enabled: workspaceTab === "files" && Boolean(selectedFileRel),
	});

	const sendClaude = useCallback(() => {
		const trimmedRaw = draft.trim();
		if (!trimmedRaw || claudeMutation.isPending || !activeSessionId) {
			return;
		}
		const continueSession = activeMessages.length > 0;
		const promptForClaude =
			composerMode === "plan"
				? `${t("workspaceComposerPlanPrefix")}\n\n${trimmedRaw}`
				: trimmedRaw;
		const permissionMode =
			composerMode === "plan" ? "plan" : "bypassPermissions";
		const sessionId = activeSessionId;
		setChatStore((store) => {
			if (!store) return store;
			return {
				...store,
				sessions: store.sessions.map((s) => {
					if (s.id !== sessionId) return s;
					const hadUser = s.messages.some((m) => m.role === "user");
					const nextTitle = !hadUser
						? truncateChatTitle(trimmedRaw) || s.title
						: s.title;
					return {
						...s,
						messages: [
							...s.messages,
							{ role: "user", content: trimmedRaw },
						],
						title: nextTitle,
						updatedAt: Date.now(),
					};
				}),
			};
		});
		setDraft("");
		claudeMutation.mutate({
			prompt: promptForClaude,
			sessionId,
			continueSession,
			permissionMode,
		});
	}, [
		draft,
		claudeMutation,
		activeSessionId,
		activeMessages.length,
		composerMode,
		t,
	]);

	const handleNewChatSession = useCallback(() => {
		setChatStore((store) => {
			if (!store) return store;
			const s = newChatSession(t("workspaceChatNewSession"));
			return {
				...store,
				sessions: [s, ...store.sessions],
				activeSessionId: s.id,
			};
		});
		setDraft("");
	}, [t]);

	const handleSelectChatSession = useCallback((id: string) => {
		setChatStore((store) =>
			store ? { ...store, activeSessionId: id } : store,
		);
		setDraft("");
	}, []);

	const handleDeleteChatSession = useCallback(
		(id: string) => {
			setChatStore((store) => {
				if (!store) return store;
				const filtered = store.sessions.filter((s) => s.id !== id);
				if (filtered.length === 0) {
					const s = newChatSession(t("workspaceChatNewSession"));
					return {
						version: 2,
						sessions: [s],
						activeSessionId: s.id,
					};
				}
				const nextActive =
					id === store.activeSessionId
						? filtered.reduce((a, b) =>
								a.updatedAt >= b.updatedAt ? a : b,
							).id
						: store.activeSessionId;
				return {
					...store,
					sessions: filtered,
					activeSessionId: nextActive,
				};
			});
		},
		[t],
	);

	function renderTreeNodes(
		entries: WorkspaceDirEntry[],
		depth: number,
	): ReactNode {
		const indentPx = 6 + depth * 14;

		return entries.map((e) => {
			const open = Boolean(treeExpanded[e.path_relative]);

			if (!e.is_directory) {
				const selected = selectedFileRel === e.path_relative;
				return (
					<li key={e.path_relative} className="list-none">
						<button
							type="button"
							className={cn(
								"hover:bg-default/40 flex w-full items-center gap-1.5",
								"rounded-sm py-0.5 pr-2 text-left text-[13px] leading-5",
								selected
									? "border-l-2 border-l-accent bg-accent/12"
									: "border-l-2 border-l-transparent",
							)}
							style={{
								paddingLeft: selected
									? Math.max(0, indentPx - 2)
									: indentPx,
							}}
							onClick={() => setSelectedFileRel(e.path_relative)}
						>
							<span
								className="inline-block w-5 shrink-0"
								aria-hidden
							/>
							<DocumentTextIcon className="text-muted size-4 shrink-0 opacity-90" />
							<span className="min-w-0 truncate">{e.name}</span>
						</button>
					</li>
				);
			}

			const fq = folderQueryByPath.get(e.path_relative);
			const childEntries = fq?.data ?? [];

			return (
				<li key={e.path_relative} className="list-none">
					<button
						type="button"
						className={cn(
							"hover:bg-default/40 flex w-full items-center gap-1.5",
							"rounded-sm py-0.5 pr-2 text-left text-[13px] leading-5",
							"border-l-2 border-l-transparent",
						)}
						style={{ paddingLeft: indentPx }}
						onClick={() => toggleTreeDir(e.path_relative)}
						aria-expanded={open}
					>
						<span className="flex size-5 shrink-0 items-center justify-center text-muted">
							{open ? (
								<ChevronDownIcon className="size-3.5" />
							) : (
								<ChevronRightIcon className="size-3.5" />
							)}
						</span>
						<FolderIcon className="text-muted size-4 shrink-0 opacity-90" />
						<span className="min-w-0 truncate font-medium">
							{e.name}
						</span>
					</button>
					{open && (
						<ul
							className={cn(
								"border-border ml-2 border-l border-l-border/45",
								"pl-1",
							)}
						>
							{!fq || fq.isLoading ? (
								<li className="list-none py-2 pl-6">
									<Spinner size="sm" />
								</li>
							) : fq.isError ? (
								<li className="text-danger list-none py-1 pl-6 text-xs">
									{fq.error instanceof Error
										? fq.error.message
										: String(fq.error)}
								</li>
							) : childEntries.length === 0 ? (
								<li className="text-muted list-none py-1 pl-6 text-xs">
									{t("workspaceFilesEmptyFolder")}
								</li>
							) : (
								renderTreeNodes(childEntries, depth + 1)
							)}
						</ul>
					)}
				</li>
			);
		});
	}

	const selectedFileBasename = selectedFileRel
		? (selectedFileRel.split("/").filter(Boolean).pop() ?? selectedFileRel)
		: null;

	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-hidden",
				"gap-0 p-0",
			)}
			data-tour="project-workspace"
		>
			<Tabs
				selectedKey={workspaceTab}
				onSelectionChange={(key) => {
					setWorkspaceTab(key as "files" | "chat");
				}}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div
					className={cn(
						"flex shrink-0 flex-wrap items-center gap-x-2",
						"gap-y-1 px-2 py-1",
					)}
				>
					<Tabs.ListContainer className="shrink-0">
						<Tabs.List
							aria-label={t("workspaceTabsAria")}
							className={cn(
								"w-auto gap-1 rounded-xl p-1",
								"bg-surface-secondary ring-1 ring-border/70",
							)}
						>
							<Tabs.Tab
								id="files"
								className={cn(
									"rounded-lg px-3 py-1.5 text-sm font-medium",
									"text-muted transition-colors",
									"data-[selected]:bg-surface data-[selected]:text-fg",
									"data-[selected]:shadow-sm",
								)}
							>
								{t("workspaceTabFiles")}
							</Tabs.Tab>
							<Tabs.Tab
								id="chat"
								className={cn(
									"rounded-lg px-3 py-1.5 text-sm font-medium",
									"text-muted transition-colors",
									"data-[selected]:bg-surface data-[selected]:text-fg",
									"data-[selected]:shadow-sm",
								)}
							>
								{t("workspaceTabChat")}
							</Tabs.Tab>
						</Tabs.List>
					</Tabs.ListContainer>
					<div
						className={cn(
							"flex min-w-0 flex-1 items-center",
							"justify-end gap-2",
						)}
					>
						<Tooltip delay={0}>
							<Button
								isIconOnly
								size="sm"
								variant="ghost"
								className="text-muted size-8 shrink-0"
								aria-label={t("editInEditor")}
								onPress={handleOpenProjectInEditor}
								isDisabled={
									!selectedEditor ||
									openInEditorMutation.isPending
								}
							>
								<CodeBracketIcon className="size-4" />
							</Button>
							<Tooltip.Content>{t("editInEditor")}</Tooltip.Content>
						</Tooltip>
						<span
							className={cn(
								"text-muted min-w-0 truncate text-xs",
								"text-right",
							)}
							title={projectPath}
						>
							{projectPath}
						</span>
					</div>
				</div>

				<Tabs.Panel
					id="chat"
					className={cn(
						"flex min-h-0 flex-1 flex-col overflow-hidden",
					)}
				>
					<div
						className={cn(
							"flex min-h-0 flex-1 flex-col overflow-hidden",
						)}
					>
						{!chatStore ? (
							<div
								className={cn(
									"flex flex-1 items-center justify-center",
								)}
							>
								<Spinner />
							</div>
						) : (
							<div
								className={cn(
									"flex min-h-0 flex-1 flex-col overflow-hidden",
									"divide-y divide-border rounded-2xl border",
									"border-border/80 bg-surface shadow-sm",
									"md:flex-row md:divide-x md:divide-y-0",
								)}
							>
								<aside
									className={cn(
										"border-border flex max-h-[42vh]",
										"shrink-0 flex-col bg-surface-secondary/70",
										"md:max-h-none md:h-auto md:w-56 lg:w-60",
									)}
								>
									<div
										className={cn(
											"border-border/80 flex h-9 shrink-0",
											"items-center justify-between border-b px-2",
										)}
									>
										<span
											className={cn(
												"text-muted pl-1 text-[11px] font-semibold",
												"uppercase tracking-wide",
											)}
										>
											{t("workspaceChatHistory")}
										</span>
										<Button
											size="sm"
											variant="ghost"
											className="size-8 min-w-0 px-0"
											onPress={handleNewChatSession}
											aria-label={t(
												"workspaceChatNewSession",
											)}
										>
											<PlusIcon className="text-muted size-4" />
										</Button>
									</div>
									<ul
										className={cn(
											"flex min-h-0 flex-1 flex-col gap-px",
											"overflow-y-scroll overscroll-contain py-0.5",
											"px-px [scrollbar-gutter:stable]",
										)}
									>
										{sortedSessions.map((s) => (
											<li
												key={s.id}
												className={cn(
													"flex items-stretch gap-0.5",
												)}
											>
												<button
													type="button"
													onClick={() =>
														handleSelectChatSession(
															s.id,
														)
													}
													className={cn(
														"flex min-w-0 flex-1 flex-col rounded-lg px-2",
														"py-1.5 text-left text-sm transition-colors",
														s.id === activeSessionId
															? "bg-surface ring-1 ring-accent/25"
															: "hover:bg-surface/80",
													)}
												>
													<span className="truncate font-medium text-fg">
														{s.title}
													</span>
													<span
														className={cn(
															"text-muted mt-0.5 truncate text-xs",
														)}
													>
														{new Date(
															s.updatedAt,
														).toLocaleString()}
													</span>
												</button>
												<Button
													size="sm"
													variant="ghost"
													className="size-8 min-w-0 shrink-0 px-0"
													onPress={() =>
														handleDeleteChatSession(
															s.id,
														)
													}
													aria-label={t(
														"workspaceChatDeleteSession",
													)}
												>
													<TrashIcon className="text-muted size-4" />
												</Button>
											</li>
										))}
									</ul>
								</aside>

								<div
									className={cn(
										"flex min-h-0 min-w-0 flex-1 flex-col",
										"overflow-hidden bg-field-background",
									)}
								>
									<div
										className={cn(
											"flex min-h-0 flex-1 flex-col gap-0",
											"overflow-hidden p-0",
										)}
									>
										<div
											ref={workspaceChatScrollRef}
											className={cn(
												"min-h-0 flex-1 space-y-2",
												"overflow-y-scroll overscroll-contain",
												"[scrollbar-gutter:stable]",
												"px-3 py-2",
											)}
										>
											{activeMessages.length === 0
												? null
												: activeMessages.map((m, i) => (
													<div
														key={`${m.role}-${i}-${m.content.slice(0, 24)}`}
														className={cn(
															"flex w-full",
															m.role === "user"
																? "justify-end"
																: "justify-start",
														)}
													>
														<div
															className={cn(
																"max-w-[min(85%,36rem)] rounded-xl px-3",
																"py-2 text-[13px] leading-relaxed",
																"whitespace-pre-wrap shadow-sm ring-1",
																m.role ===
																	"user"
																	? "bg-accent text-accent-foreground ring-accent/15"
																	: "bg-surface text-fg ring-border/60",
															)}
														>
															{m.content}
														</div>
													</div>
												))}
											{claudeMutation.isPending && (
												<div
													className={cn(
														"text-muted flex items-center",
														"gap-2 text-sm",
													)}
												>
													<Spinner size="sm" />
													{t(
														"workspaceClaudeRunning",
													)}
												</div>
											)}
										</div>

										<div
											className={cn(
												"shrink-0 px-2 pb-2 pt-1",
											)}
										>
											<div
												className={cn(
													"flex flex-col overflow-hidden rounded-xl",
													"border border-border bg-surface shadow-sm",
													"transition-shadow",
													"focus-within:shadow-md",
													"focus-within:ring-2 focus-within:ring-accent/35",
												)}
											>
												<div className="px-3 pt-3 pb-2">
													<TextField className="w-full">
														<TextArea
															id="workspace-claude-composer"
															value={draft}
															onChange={(e) =>
																setDraft(
																	e.target
																		.value,
																)
															}
															onKeyDown={(e) => {
																if (
																	e.key ===
																		"Enter" &&
																	(e.ctrlKey ||
																		e.metaKey)
																) {
																	e.preventDefault();
																	sendClaude();
																}
															}}
															placeholder={t(
																"workspaceComposerPlaceholderFocus",
															)}
															className={cn(
																"max-h-52 min-h-[6rem] resize-y",
																"border-0 bg-transparent text-[13px]",
																"text-foreground",
																"placeholder:text-muted",
																"shadow-none outline-none ring-0",
																"focus-visible:ring-0",
															)}
															variant="secondary"
															disabled={
																claudeMutation.isPending
															}
														/>
													</TextField>
												</div>

												<div
													className={cn(
														"flex items-center justify-between gap-1",
														"border-t border-border px-3 py-2",
													)}
												>
													<div className="flex items-center gap-0">
														<Button
															variant="ghost"
															size="sm"
															className={cn(
																"size-8 min-w-0 rounded-md px-0",
																"text-muted",
																"hover:bg-surface-secondary",
															)}
															aria-label={t(
																"workspaceComposerAttachFile",
															)}
															onPress={
																handleAttachFilesForClaude
															}
														>
															<PlusIcon className="size-5" />
														</Button>
													</div>

													<div className="flex items-center gap-1">
														<Dropdown>
															<Button
																variant="ghost"
																size="sm"
																className={cn(
																	"h-8 gap-1.5 rounded-md px-2",
																	"text-[12px] font-normal",
																	"text-muted",
																	"hover:bg-surface-secondary",
																)}
																aria-label={t(
																	"workspaceComposerModeMenu",
																)}
															>
																<HandRaisedIcon className="size-4 shrink-0 text-muted" />
																<span
																	className={cn(
																		"max-w-[10rem] truncate",
																		"sm:max-w-[14rem]",
																	)}
																>
																	{composerMode ===
																	"direct"
																		? t(
																				"workspaceComposerModeAskBeforeEdits",
																			)
																		: t(
																				"workspaceComposerModePlanMenu",
																			)}
																</span>
																<ChevronDownIcon className="size-3 shrink-0 opacity-60" />
															</Button>
															<Dropdown.Popover
																placement="top end"
																className={cn(
																	"border border-border bg-surface",
																	"p-1 shadow-lg",
																)}
															>
																<Dropdown.Menu
																	selectedKeys={
																		new Set(
																			[
																				composerMode,
																			],
																		)
																	}
																	selectionMode="single"
																	onAction={(
																		key,
																	) => {
																		const id =
																			String(
																				key,
																			);
																		if (
																			id ===
																				"direct" ||
																			id ===
																				"plan"
																		) {
																			setComposerMode(
																				id,
																			);
																		}
																	}}
																>
																	<Dropdown.Item
																		id="direct"
																		className={cn(
																			"text-foreground",
																			"data-[focused]:bg-surface-secondary",
																		)}
																		textValue={t(
																			"workspaceComposerModeAskBeforeEdits",
																		)}
																	>
																		{t(
																			"workspaceComposerModeAskBeforeEdits",
																		)}
																	</Dropdown.Item>
																	<Dropdown.Item
																		id="plan"
																		className={cn(
																			"text-foreground",
																			"data-[focused]:bg-surface-secondary",
																		)}
																		textValue={t(
																			"workspaceComposerModePlanMenu",
																		)}
																	>
																		{t(
																			"workspaceComposerModePlanMenu",
																		)}
																	</Dropdown.Item>
																</Dropdown.Menu>
															</Dropdown.Popover>
														</Dropdown>

														<Button
															variant="secondary"
															size="sm"
															className={cn(
																"!size-9 !min-w-9 rounded-md",
																"border-0 bg-accent p-0",
																"text-accent-foreground shadow-none",
																"hover:bg-accent/90",
																"disabled:opacity-40",
															)}
															onPress={sendClaude}
															isDisabled={
																!draft.trim() ||
																claudeMutation.isPending
															}
															aria-label={t(
																"workspaceClaudeSend",
															)}
														>
															<ArrowUpIcon className="size-5" />
														</Button>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
					</div>
				</Tabs.Panel>

				<Tabs.Panel
					id="files"
					className={cn(
						"flex min-h-0 flex-1 flex-col overflow-hidden",
					)}
				>
					<div
						className={cn(
							"flex min-h-0 flex-1 flex-col overflow-hidden",
						)}
					>
						<div
							className={cn(
								"flex min-h-0 flex-1 flex-col overflow-hidden",
								"divide-y divide-border rounded-2xl border",
								"border-border/80 bg-surface shadow-sm",
								"md:flex-row md:divide-x md:divide-y-0",
							)}
						>
							{/* VS Code–style explorer */}
							<aside
								className={cn(
									"border-border flex max-h-[42vh] shrink-0",
									"flex-col bg-surface-secondary/70",
									"md:max-h-none md:h-auto md:w-56 lg:w-60",
								)}
							>
								<div
									className={cn(
										"border-border/80 flex h-9 shrink-0",
										"items-center justify-between border-b px-2",
									)}
								>
									<span
										className={cn(
											"text-muted pl-1 text-[11px] font-semibold",
											"uppercase tracking-wide",
										)}
									>
										{t("workspaceFilesTitle")}
									</span>
									<div className="flex items-center gap-0.5">
										<Button
											size="sm"
											variant="ghost"
											className="size-8 min-w-0 px-0"
											onPress={collapseAllTreeDirs}
											isDisabled={
												expandedPathsSorted.length === 0
											}
											aria-label={t(
												"workspaceFilesCollapseAll",
											)}
										>
											<ChevronDoubleUpIcon className="text-muted size-4" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="size-8 min-w-0 px-0"
											onPress={() => {
												void queryClient.invalidateQueries(
													{
														queryKey: [
															"workspace-files",
															projectPath,
														],
													},
												);
											}}
											isDisabled={filesTreeAnyFetching}
											aria-label={t(
												"workspaceFilesRefresh",
											)}
										>
											{filesTreeAnyFetching ? (
												<Spinner size="sm" />
											) : (
												<ArrowPathIcon className="text-muted size-4" />
											)}
										</Button>
									</div>
								</div>
								<div
									className={cn(
										"flex min-h-0 flex-1 flex-col overflow-hidden",
									)}
								>
									{rootFilesQuery.isLoading ? (
										<div className="flex flex-1 justify-center py-8">
											<Spinner />
										</div>
									) : rootFilesQuery.isError ? (
										<p className="text-danger p-2 text-xs">
											{rootFilesQuery.error instanceof
											Error
												? rootFilesQuery.error.message
												: String(rootFilesQuery.error)}
										</p>
									) : (
										<ul
											className={cn(
												"flex min-h-0 flex-1 flex-col gap-px",
												"overflow-y-auto overscroll-contain py-1",
												"[scrollbar-gutter:stable]",
											)}
										>
											{renderTreeNodes(
												rootFilesQuery.data ?? [],
												0,
											)}
										</ul>
									)}
								</div>
							</aside>

							{/* VS Code–style editor group */}
							<div
								className={cn(
									"flex min-h-0 min-w-0 flex-1 flex-col",
									"bg-field-background",
								)}
							>
								<div
									className={cn(
										"border-border/80 flex h-9 min-w-0 shrink-0",
										"items-center gap-2 border-b px-2",
										"bg-surface-secondary/90",
									)}
									title={selectedFileRel ?? undefined}
								>
									<DocumentTextIcon className="text-muted size-3.5 shrink-0" />
									<span className="truncate text-xs font-medium text-fg">
										{selectedFileBasename ??
											t("workspaceFilesPickFile")}
									</span>
								</div>
								<div
									className={cn(
										"flex min-h-0 flex-1 flex-col overflow-hidden",
									)}
								>
									{!selectedFileRel ? (
										<p
											className={cn(
												"text-muted px-2 py-2 text-[13px]",
												"leading-relaxed",
											)}
										>
											{t("workspaceFilesPickFileHint")}
										</p>
									) : fileContentQuery.isLoading ? (
										<div className="flex flex-1 justify-center py-12">
											<Spinner />
										</div>
									) : fileContentQuery.isError ? (
										<p className="text-danger px-2 py-2 text-sm">
											{fileContentQuery.error instanceof
											Error
												? fileContentQuery.error.message
												: String(
														fileContentQuery.error,
													)}
										</p>
									) : (
										<div
											className={cn(
												"min-h-0 flex-1 overflow-y-scroll",
												"overscroll-contain",
												"[scrollbar-gutter:stable]",
											)}
										>
											<div
												className={cn(
													"mx-auto w-full max-w-[52rem]",
													"px-2 py-2 md:px-3 md:py-3",
													selectedFileRel &&
														isReaderStylePath(
															selectedFileRel,
														)
														? "text-fg text-[13px] leading-relaxed whitespace-pre-wrap"
														: "text-fg font-mono text-[12px] leading-normal whitespace-pre-wrap",
												)}
											>
												{fileContentQuery.data ?? ""}
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</Tabs.Panel>
			</Tabs>
		</div>
	);
}
