"use client";

import Link from "next/link";
import { PropsWithChildren, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/features/identity/auth";
import {
  accountApi,
  globalSearchApi,
  iconsApi,
  withFreshApiReads,
  workspacesApi,
} from "@/lib/api";
import { runProgressSequence } from "@/lib/progress";
import {
  clearPersistedQueryCache,
  isWorkspaceScopedQuery,
} from "@/providers/query-provider";
import { useAppToast } from "@/providers/toast-provider";
import { CustomSelect } from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { SystemBrandLogo } from "@/components/layout/system-brand-logo";
import { AppNavigation } from "@/components/layout/app-navigation";
import { GlobalSearchBox } from "@/components/layout/global-search-box";
import { GlobalRefreshButton } from "@/components/layout/global-refresh-button";
import { useSystemBotWorkspaceSync } from "@/components/layout/use-system-bot-workspace-sync";
import { NotificationCenter } from "@/components/features/operations/notifications/notification-center";
import { ChevronRight, LogOut, Menu, Plus, X } from "lucide-react";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("selected-workspace-id") ?? "";
  });
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  });
  const { data: currentAccount } = useQuery({
    queryKey: ["account-me"],
    queryFn: accountApi.me,
  });
  const { data: searchResults = [], isFetching: searchFetching } = useQuery({
    queryKey: ["global-search", debouncedGlobalSearch],
    queryFn: () => globalSearchApi.search(debouncedGlobalSearch),
    enabled: debouncedGlobalSearch.trim().length >= 2,
  });
  const createWorkspace = useMutation({
    mutationFn: async (payload: {
      name: string;
      avatarIconId?: string | null;
    }) => {
      const selectedIcon = payload.avatarIconId
        ? await iconsApi.get(payload.avatarIconId).catch(() => null)
        : null;
      const created = await workspacesApi.create({ name: payload.name });
      if (!selectedIcon) return created;

      localStorage.setItem("selected-workspace-id", created.id);
      setSelectedWorkspaceId(created.id);

      const clonedIcon =
        selectedIcon.type === "emoji"
          ? await iconsApi
              .createEmoji({
                name: selectedIcon.name,
                emoji: selectedIcon.emoji ?? "",
              })
              .catch(() => null)
          : selectedIcon.imageUrl
            ? await iconsApi
                .createCustom({
                  name: selectedIcon.name,
                  imageUrl: selectedIcon.imageUrl,
                })
                .catch(() => null)
            : null;

      if (!clonedIcon) return created;

      try {
        return await workspacesApi.update(created.id, {
          avatarIconId: clonedIcon.id,
        });
      } catch {
        return created;
      }
    },
    onSuccess: (workspace) => {
      localStorage.setItem("selected-workspace-id", workspace.id);
      setSelectedWorkspaceId(workspace.id);
      setWorkspaceName("");
      setWorkspaceIconId(null);
      setCreatingWorkspace(false);
      clearPersistedQueryCache();
      qc.removeQueries({
        predicate: (query) => isWorkspaceScopedQuery(query.queryKey),
      });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const defaults = { telegram: true, growth: true, operations: false };
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem("sidebar-open-groups");
      if (!raw) return defaults;
      return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem("sidebar-open-groups", JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedGlobalSearch(globalSearch.trim()),
      220,
    );
    return () => window.clearTimeout(timeout);
  }, [globalSearch]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!workspaces?.length) return;
    if (
      selectedWorkspaceId &&
      workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    )
      return;
    const nextWorkspaceId = workspaces[0].id;
    localStorage.setItem("selected-workspace-id", nextWorkspaceId);
    // Workspace list supplies the initial selected workspace fallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedWorkspaceId(nextWorkspaceId);
  }, [selectedWorkspaceId, workspaces]);

  const resetWorkspaceQueries = async () => {
    await qc.cancelQueries({
      predicate: (query) => isWorkspaceScopedQuery(query.queryKey),
    });
    await qc.resetQueries({
      predicate: (query) => isWorkspaceScopedQuery(query.queryKey),
    });
    qc.removeQueries({
      predicate: (query) =>
        isWorkspaceScopedQuery(query.queryKey) &&
        query.getObserversCount() === 0,
    });
  };

  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspaceId) return;
    localStorage.setItem("selected-workspace-id", workspaceId);
    setSelectedWorkspaceId(workspaceId);
    clearPersistedQueryCache();
    await resetWorkspaceQueries();
    await qc.resetQueries({ queryKey: ["auth", "me"] });
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
  };

  const handleLogout = () => {
    qc.clear();
    clearPersistedQueryCache();
    logout();
  };

  const handleGlobalRefresh = async () => {
    setRefreshing(true);
    const shouldRefreshQuery = (queryKey: readonly unknown[]) => {
      const [root] = queryKey;
      return (
        root === "auth" ||
        root === "workspaces" ||
        isWorkspaceScopedQuery(queryKey)
      );
    };
    try {
      await withFreshApiReads(async () =>
        runProgressSequence({
          api: { pushToast, setProgress, clearProgress },
          id: `global-refresh:${Date.now()}`,
          title: "Refreshing workspace",
          steps: [
            {
              message: "Clearing cached workspace data",
              run: async () => {
                clearPersistedQueryCache();
                qc.removeQueries({
                  predicate: (query) =>
                    shouldRefreshQuery(query.queryKey) &&
                    query.getObserversCount() === 0,
                });
              },
            },
            {
              message: "Marking visible workspace data stale",
              run: async () => {
                await qc.invalidateQueries({
                  predicate: (query) => shouldRefreshQuery(query.queryKey),
                  refetchType: "none",
                });
              },
            },
            {
              message: "Refetching visible page data",
              run: async () => {
                await qc.refetchQueries(
                  {
                    predicate: (query) => shouldRefreshQuery(query.queryKey),
                    type: "active",
                  },
                  { throwOnError: true },
                );
              },
            },
            {
              message: "Finalizing refreshed data",
              run: async () => {
                await Promise.resolve();
              },
            },
          ],
        }),
      );
    } catch {
      pushToast("Failed to refresh data.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("sidebar-open-groups", JSON.stringify(next));
      return next;
    });
  };
  const activeWorkspaceId = selectedWorkspaceId || workspaces?.[0]?.id || "";
  useSystemBotWorkspaceSync(activeWorkspaceId, (workspaceId) => {
    if (workspaces?.some((workspace) => workspace.id === workspaceId))
      void switchWorkspace(workspaceId);
  });
  const activeWorkspace = (workspaces ?? []).find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const canViewSystemLogs =
    activeWorkspace?.access?.permissionKeys.includes(
      "operations.viewSystemLogs",
    ) ??
    (activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin");
  const canViewNotifications =
    activeWorkspace?.role === "owner" ||
    Boolean(
      activeWorkspace?.access?.permissionKeys.includes(
        "operations.notifications",
      ),
    );
  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-950 text-neutral-100">
      <div className="fixed right-[3.75rem] top-2 z-30 lg:left-[9.5rem] lg:right-auto lg:top-5 lg:z-40">
        <NotificationCenter
          workspaceId={activeWorkspaceId}
          enabled={canViewNotifications}
        />
      </div>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
          aria-label="Open navigation"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={20} />
        </button>
        <SystemBrandLogo compact />
        <GlobalRefreshButton
          refreshing={refreshing}
          onRefresh={() => void handleGlobalRefresh()}
        />
      </header>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/65 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside
        id="app-sidebar"
        aria-label="Application sidebar"
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[min(19rem,calc(100vw-1.25rem))] -translate-x-full flex-col border-r border-neutral-800 bg-neutral-950 p-4 shadow-2xl transition-transform duration-200 lg:z-30 lg:h-screen lg:w-64 lg:translate-x-0 lg:p-5 lg:shadow-none ${mobileMenuOpen ? "translate-x-0" : ""}`}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a"))
            setMobileMenuOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 hover:bg-neutral-900 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 pr-10 lg:pr-0">
            <SystemBrandLogo />
            <GlobalRefreshButton
              compact
              hidden={mobileMenuOpen}
              refreshing={refreshing}
              onRefresh={() => void handleGlobalRefresh()}
            />
          </div>
        </div>

        <GlobalSearchBox
          query={globalSearch}
          onQueryChange={setGlobalSearch}
          focused={searchFocused}
          onFocusedChange={setSearchFocused}
          results={searchResults}
          isFetching={searchFetching}
        />

        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1" aria-label="Workspace">
              <CustomSelect
                value={activeWorkspaceId}
                onChange={switchWorkspace}
                placeholder="Select workspace"
                options={(workspaces ?? []).map((workspace) => ({
                  value: workspace.id,
                  label: `${workspace.name} (${workspace.role})`,
                  iconPresentation: workspace.avatarPresentation ?? undefined,
                  iconUrl:
                    workspace.avatarPresentation?.type === "image"
                      ? workspace.avatarPresentation.url
                      : undefined,
                  iconEmoji:
                    workspace.avatarPresentation?.type === "unicode"
                      ? workspace.avatarPresentation.value
                      : undefined,
                  iconPremium:
                    workspace.avatarPresentation?.type === "unicode" &&
                    Boolean(workspace.avatarPresentation.telegramCustomEmojiId),
                }))}
              />
            </div>
            <button
              type="button"
              onClick={() => setCreatingWorkspace((v) => !v)}
              aria-expanded={creatingWorkspace}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                creatingWorkspace
                  ? "border-blue-700 bg-blue-950/40 text-blue-200"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-white"
              }`}
              aria-label="Create workspace"
              title="Create workspace"
            >
              <Plus size={17} />
            </button>
          </div>
          {creatingWorkspace ? (
            <form
              className="flex gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = workspaceName.trim();
                if (name)
                  createWorkspace.mutate({
                    name,
                    avatarIconId: workspaceIconId,
                  });
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <IconPicker
                  compact
                  iconId={workspaceIconId}
                  onChange={setWorkspaceIconId}
                />
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Workspace name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border border-neutral-700 px-3 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Add
              </button>
            </form>
          ) : null}
        </div>

        <AppNavigation
          pathname={pathname}
          openGroups={openGroups}
          onToggleGroup={toggleGroup}
          canViewAdmin={canViewSystemLogs}
          effectiveFeatureIds={activeWorkspace?.access?.featureIds}
          effectivePermissionKeys={activeWorkspace?.access?.permissionKeys}
        />

        <div className="mt-3 border-t border-neutral-800 pt-3">
          <div
            className={`flex min-w-0 items-stretch overflow-hidden rounded-xl border transition ${
              pathname === "/account"
                ? "border-blue-700/70 bg-blue-950/30"
                : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900"
            }`}
          >
            <Link
              href="/account"
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5"
            >
              <IconAvatar
                icon={currentAccount?.avatarPresentation}
                label={currentAccount?.name || currentAccount?.email || "User"}
                size="md"
                className="!rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {currentAccount?.name || "My profile"}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {currentAccount?.email || "Account settings"}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-neutral-600" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-11 shrink-0 items-center justify-center border-l border-neutral-800 text-neutral-500 transition hover:bg-rose-950/30 hover:text-rose-300"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-h-[calc(100dvh-3.5rem)] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:ml-64 lg:min-h-screen lg:w-[calc(100%-16rem)] 2xl:px-5">
        <div
          key={activeWorkspaceId || "no-workspace"}
          className="w-full min-w-0"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
