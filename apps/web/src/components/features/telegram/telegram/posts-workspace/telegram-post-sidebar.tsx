"use client";

import { wantsNewTab, managedPostStatusKey } from "../managed-post-identity";

import { useState } from "react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Card, LoadingState, EmptyState } from "@/components/ui/primitives";
import {
  FileText,
  Clock3,
  CheckCircle2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  LoaderCircle,
  AlertTriangle,
  MoveRight,
  Trash2,
} from "lucide-react";
import { ManagedPostSearchInput } from "@/components/features/telegram/telegram/managed-post-search-input";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { getManagedPostDisplayNumber } from "@/lib/features/telegram/telegram-post-numbering";
import { PostStatusIcon } from "@/components/features/telegram/telegram/managed-post-presentation";
import { ManagedPostTelegramIdentityIndicator } from "@/components/features/telegram/telegram/managed-post-telegram-link";
import { formatDateTime } from "@/lib/date-format";
import { ManagedPostSelectionActions } from "@/components/features/telegram/telegram/managed-post-selection-actions";
import {
  isBrokenPublishedPost,
  remoteStatusKey,
} from "./telegram-post-workspace-model";
import { PendingPostRow } from "./telegram-post-editor-rows";
import { PostIcon } from "../managed-post-identity";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "t"
  | "posts"
  | "pendingPostSaves"
  | "changeStatusTab"
  | "statusTab"
  | "postSearch"
  | "setPostSearch"
  | "visiblePosts"
  | "visiblePendingPostSaves"
  | "groupedPendingPostSaves"
  | "orderedSidebarSections"
  | "collapsedGroupIds"
  | "selectedPostIds"
  | "setDraggedSidebarKey"
  | "draggedSidebarKey"
  | "setSidebarOrderKeys"
  | "scheduleSidebarOrderSave"
  | "toggleGroupCollapsed"
  | "setSelectedPostIds"
  | "savingPostIds"
  | "editing"
  | "cancelScheduledPostOpen"
  | "openPostInNewTab"
  | "togglePostSelected"
  | "schedulePostOpen"
  | "openPost"
  | "locale"
  | "workspaceTimezone"
  | "setMovingPost"
  | "setDeletingPost"
  | "toggleAllTabPosts"
  | "allTabPostsSelected"
  | "toggleAllChannelPosts"
  | "allChannelPostsSelected"
  | "selectedPosts"
  | "channelId"
  | "channelTitle"
  | "busy"
  | "setBulkDeleteOpen"
>;

export function TelegramPostSidebar({ model }: { model: Model }) {
  const {
    t,
    posts,
    pendingPostSaves,
    changeStatusTab,
    statusTab,
    postSearch,
    setPostSearch,
    visiblePosts,
    visiblePendingPostSaves,
    groupedPendingPostSaves,
    orderedSidebarSections,
    collapsedGroupIds,
    selectedPostIds,
    setDraggedSidebarKey,
    draggedSidebarKey,
    setSidebarOrderKeys,
    scheduleSidebarOrderSave,
    toggleGroupCollapsed,
    setSelectedPostIds,
    savingPostIds,
    editing,
    cancelScheduledPostOpen,
    openPostInNewTab,
    togglePostSelected,
    schedulePostOpen,
    openPost,
    locale,
    workspaceTimezone,
    setMovingPost,
    setDeletingPost,
    toggleAllTabPosts,
    allTabPostsSelected,
    toggleAllChannelPosts,
    allChannelPostsSelected,
    selectedPosts,
    channelId,
    channelTitle,
    busy,
    setBulkDeleteOpen,
  } = model;
  const [editorialOpen, setEditorialOpen] = useState<Record<string, boolean>>({});
  return (
    <Card className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">
          {t("telegram.posts.editor.posts")}
        </h2>
        <span className="text-xs text-neutral-500">
          {t("telegram.posts.total", {
            count: (posts.data?.length || 0) + pendingPostSaves.length,
          })}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
        {(
          [
            {
              value: "DRAFT",
              label: t("telegram.posts.editor.drafts"),
              icon: FileText,
              count: (posts.data || []).filter(
                (post) =>
                  ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status) ||
                  isBrokenPublishedPost(post),
              ).length,
            },
            {
              value: "SCHEDULED",
              label: t("telegram.posts.editor.scheduled"),
              icon: Clock3,
              count: (posts.data || []).filter(
                (post) => post.status === "SCHEDULED",
              ).length,
            },
            {
              value: "PUBLISHED",
              label: t("telegram.posts.editor.published"),
              icon: CheckCircle2,
              count: (posts.data || []).filter(
                (post) =>
                  post.status === "PUBLISHED" && !isBrokenPublishedPost(post),
              ).length,
            },
          ] as const
        ).map(({ value, label, icon: StatusIcon, count }) => (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => changeStatusTab(value)}
            className={`relative flex h-9 items-center justify-center rounded-md transition ${
              statusTab === value
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            <StatusIcon size={17} />
            {count ? (
              <span className="absolute right-1.5 top-1 rounded-full bg-neutral-950/70 px-1 text-[9px] leading-4">
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <ManagedPostSearchInput value={postSearch} onChange={setPostSearch} />
      {posts.isLoading ? <LoadingState /> : null}
      {visiblePosts.length || visiblePendingPostSaves.length ? (
        <>
          <div className="max-h-[calc(100vh-15rem)] space-y-2 overflow-y-auto pr-1">
            {groupedPendingPostSaves.ungrouped.map((pending) => (
              <PendingPostRow key={pending.id} pending={pending} />
            ))}
            {orderedSidebarSections.map((section) => {
              const expandable = Boolean(section.group || section.editorial);
              const collapsed = section.editorial
                ? !(editorialOpen[section.key] ?? (
                    Boolean(postSearch.trim()) || section.posts.some((post) => post.id === editing?.id)
                  ))
                : Boolean(section.group && collapsedGroupIds.includes(section.group.id));
              const statusNumberingEnabled = Boolean(
                section.group?.statusNumberingEnabled,
              );
              const sectionReadOnly = Boolean(section.editorial) || section.posts.some(
                (post) => post.readOnlyTelegramPost || (!section.group && Boolean(post.groupId)),
              );
              const toggleSection = () => {
                if (section.editorial) {
                  setEditorialOpen((current) => ({ ...current, [section.key]: collapsed }));
                } else if (section.group) {
                  toggleGroupCollapsed(section.group.id);
                }
              };
              const sectionPostIds = section.posts.map((post) => post.id);
              const allSectionSelected = sectionPostIds.every((id) =>
                selectedPostIds.includes(id),
              );
              return (
                <div
                  key={section.key}
                  draggable={!sectionReadOnly}
                  onDragStart={() => {
                    if (!sectionReadOnly) setDraggedSidebarKey(section.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (
                      sectionReadOnly ||
                      !draggedSidebarKey ||
                      draggedSidebarKey === section.key
                    ) {
                      return;
                    }
                    setSidebarOrderKeys((currentKeys) => {
                      const current = currentKeys.length
                        ? currentKeys
                        : orderedSidebarSections.map((item) => item.key);
                      const from = current.indexOf(draggedSidebarKey);
                      const to = current.indexOf(section.key);
                      if (from < 0 || to < 0) return current;
                      const next = [...current];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next;
                    });
                  }}
                  onDragEnd={() => {
                    if (sectionReadOnly) return;
                    setDraggedSidebarKey(null);
                    scheduleSidebarOrderSave(
                      orderedSidebarSections.map((item) => item.key),
                    );
                  }}
                  className={`${
                    expandable
                      ? "overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40"
                      : "space-y-2"
                  } ${draggedSidebarKey === section.key ? "border-blue-500 opacity-60" : ""}`}
                >
                  {expandable ? (
                    <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-2">
                      {!sectionReadOnly ? (
                        <GripVertical
                          size={15}
                          className="shrink-0 cursor-grab text-neutral-500"
                        />
                      ) : null}
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={toggleSection}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {collapsed ? (
                          <ChevronRight
                            size={15}
                            className="shrink-0 text-neutral-400"
                          />
                        ) : (
                          <ChevronDown
                            size={15}
                            className="shrink-0 text-neutral-400"
                          />
                        )}
                        {section.editorial ? (
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-xs text-neutral-400">
                              <IconAvatar icon={section.editorial.sphereIcon} label={section.editorial.sphereName} size="xs" />
                              <span className="break-words">{section.editorial.sphereName}</span>
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-sm font-medium text-white">
                              <IconAvatar icon={section.editorial.rubricIcon} label={section.editorial.rubricName} size="xs" />
                              <span className="break-words">{section.editorial.rubricName}</span>
                            </span>
                          </span>
                        ) : section.group ? (
                          <>
                            <PostIcon
                              iconId={section.group.icon}
                              icon={section.group.iconPresentation}
                              label={telegramPostGroupTitle(section.group, t)}
                              bare
                            />
                            <span className="truncate text-sm font-medium text-white">
                              {telegramPostGroupTitle(section.group, t)}
                            </span>
                          </>
                        ) : null}
                        <span className="text-xs text-neutral-500">
                          {section.posts.length + section.pendingPosts.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPostIds((current) =>
                            allSectionSelected
                              ? current.filter(
                                  (id) => !sectionPostIds.includes(id),
                                )
                              : [...new Set([...current, ...sectionPostIds])],
                          )
                        }
                        className="shrink-0 rounded-md px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-950/60"
                      >
                        {allSectionSelected
                          ? t("telegram.posts.editor.clear")
                          : t("telegram.posts.editor.selectAllAction")}
                      </button>
                    </div>
                  ) : null}
                  {!collapsed ? (
                    <div
                      className={expandable ? "space-y-2 p-2" : "space-y-2"}
                    >
                      {section.posts.map((post) => {
                        const isSaving = savingPostIds.includes(post.id);
                        const isSelected = selectedPostIds.includes(post.id);
                        const isOpen = editing?.id === post.id;
                        const displayNumber = section.group
                          ? getManagedPostDisplayNumber(
                              post,
                              statusNumberingEnabled,
                            )
                          : null;
                        return (
                          <div
                            key={post.id}
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              if (wantsNewTab(event)) {
                                cancelScheduledPostOpen();
                                openPostInNewTab(post);
                                return;
                              }
                              if (event.shiftKey || event.detail > 1) {
                                cancelScheduledPostOpen();
                                togglePostSelected(post.id);
                                return;
                              }
                              schedulePostOpen(post);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                cancelScheduledPostOpen();
                                openPost(post);
                              } else if (event.key === " ") {
                                event.preventDefault();
                                cancelScheduledPostOpen();
                                togglePostSelected(post.id);
                              }
                            }}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 outline-none transition ${
                              isOpen && isSelected
                                ? "border-blue-400 bg-blue-950/30 ring-1 ring-amber-300/50"
                                : isOpen
                                  ? "border-blue-400 bg-blue-950/25"
                                  : isSelected
                                    ? "border-amber-400 bg-amber-950/20"
                                    : "border-neutral-800 hover:bg-neutral-900"
                            }`}
                          >
                            {!expandable && !sectionReadOnly ? (
                              <GripVertical
                                size={15}
                                className="shrink-0 cursor-grab text-neutral-500"
                              />
                            ) : null}
                            <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                              {isSaving ? (
                                <LoaderCircle
                                  size={16}
                                  className="shrink-0 animate-spin text-blue-400"
                                />
                              ) : !post.icon ? (
                                <PostStatusIcon status={post.status} />
                              ) : null}
                              {displayNumber != null ? (
                                <span className="shrink-0">
                                  <span className="sr-only">
                                    {statusNumberingEnabled
                                      ? t("telegram.posts.calendar.status")
                                      : t("telegram.posts.calendar.group")}{" "}
                                    {t("telegram.posts.editor.number", {
                                      number: displayNumber,
                                    })}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-1.5 text-[11px] font-medium tabular-nums text-neutral-300"
                                  >
                                    {displayNumber}
                                  </span>
                                </span>
                              ) : null}
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                                  <PostIcon
                                    iconId={post.icon}
                                    icon={post.iconPresentation}
                                    label={post.title}
                                    bare
                                  />
                                  <span className="truncate">{post.title}</span>
                                  <ManagedPostTelegramIdentityIndicator
                                    post={post}
                                  />
                                  {post.readOnlyTelegramPost ? (
                                    <span className="shrink-0 rounded border border-sky-800 bg-sky-950/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-300">
                                      {t("telegram.posts.status.synced")}
                                    </span>
                                  ) : null}
                                  {post.telegramIdVerificationStatus !==
                                    "MISSING" &&
                                  ["BROKEN", "MISSING"].includes(
                                    post.telegramRemoteStatus,
                                  ) ? (
                                    <AlertTriangle
                                      size={13}
                                      className="shrink-0 text-red-400"
                                      aria-label={t(
                                        remoteStatusKey(
                                          post.telegramRemoteStatus,
                                        ),
                                      )}
                                    />
                                  ) : null}
                                </span>
                                {post.status !== "DRAFT" ? (
                                  <span className="block truncate text-[11px] text-neutral-500">
                                    {post.status === "SCHEDULED" &&
                                    post.scheduledAt
                                      ? formatDateTime(
                                          post.scheduledAt,
                                          locale,
                                          post.scheduleTimezone ??
                                            workspaceTimezone,
                                        )
                                      : post.status === "PUBLISHED" &&
                                          post.publishedAt
                                        ? formatDateTime(
                                            post.publishedAt,
                                            locale,
                                          )
                                        : t(managedPostStatusKey(post.status))}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            {!post.readOnlyTelegramPost ? (
                              <button
                                type="button"
                                title={t("telegram.posts.editor.moveToChannel")}
                                aria-label={t(
                                  "telegram.posts.editor.moveNamed",
                                  {
                                    title: post.title,
                                  },
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cancelScheduledPostOpen();
                                  setMovingPost(post);
                                }}
                                className="cursor-pointer rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                              >
                                <MoveRight size={14} />
                              </button>
                            ) : null}
                            {!post.readOnlyTelegramPost ? (
                              <button
                                type="button"
                                aria-label={t(
                                  "telegram.posts.editor.deleteNamed",
                                  {
                                    title: post.title,
                                  },
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cancelScheduledPostOpen();
                                  setDeletingPost(post);
                                }}
                                className="cursor-pointer rounded-md border border-red-800 p-1.5 text-red-300 hover:bg-red-950"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {section.pendingPosts.map((pending) => (
                        <PendingPostRow key={pending.id} pending={pending} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={toggleAllTabPosts}
                  className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  title={t("telegram.posts.editor.selectAllInTab")}
                >
                  {allTabPostsSelected
                    ? t("telegram.posts.editor.clearTab")
                    : t("telegram.posts.editor.allInThisTab")}
                </button>
                {allTabPostsSelected ? (
                  <button
                    type="button"
                    onClick={toggleAllChannelPosts}
                    className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    title={t("telegram.posts.editor.selectAll")}
                  >
                    {allChannelPostsSelected
                      ? t("telegram.posts.editor.clearAll")
                      : t("telegram.posts.editor.all")}
                  </button>
                ) : null}
              </div>
              <span
                className={`min-w-9 rounded-md border px-2 py-1 text-center text-xs ${
                  selectedPosts.length
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
                    : "border-transparent text-transparent"
                }`}
              >
                {selectedPosts.length || 0}
              </span>
            </div>
            <ManagedPostSelectionActions
              channelId={channelId}
              channelTitle={channelTitle}
              posts={selectedPosts}
              busy={busy}
              onDelete={() => setBulkDeleteOpen(true)}
            />
          </div>
        </>
      ) : !posts.isLoading ? (
        <EmptyState
          text={
            postSearch.trim()
              ? t("telegram.posts.editor.noSearchResults")
              : t("telegram.posts.editor.noStatusPosts", {
                  status: t(managedPostStatusKey(statusTab)),
                })
          }
        />
      ) : null}
    </Card>
  );
}
