"use client";

import { formatDateTime } from "@/lib/date-format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Clock3, GripVertical, ListPlus, MoveRight, Pencil, RotateCcw, Rocket } from "lucide-react";
import { AddPostsModal } from "@/components/features/telegram/telegram/add-posts-to-group-modal";
import { PostStatusIcon } from "@/components/features/telegram/telegram/managed-post-presentation";
import { mapManagedPostPages, restoreManagedPostPages, snapshotManagedPostPages } from "@/components/features/telegram/telegram/managed-post-cache";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { telegramChannelsApi, type BulkActionResult, type BulkActionResultItem, type PostGroup, type TelegramChannelSelectOption as TelegramChannel, type TelegramManagedPost } from "@/lib/api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { normalizeManagedPostNumbering } from "@/lib/features/telegram/telegram-post-numbering";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { telegramPostKeys } from "@/lib/query-keys";
import { Button, Card, EmptyState, LoadingState, Modal } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import { usePagination } from "@/hooks/use-pagination";
import { localizedBulkActionMessage } from "@/components/features/telegram/telegram/telegram-posts-workspace-controls";
import { PostIcon, managedPostStatusKey } from "./managed-post-identity";
import { GroupSummary } from "./managed-post-group-summary";
import { GroupFormModal } from "./managed-post-group-form-modal";
import { PublishGroupModal, ScheduleGroupModal } from "./managed-post-group-publication-modals";
import { MovePostModal } from "./managed-post-move-modal";
import { ManagedPostGroupList } from "./managed-post-group-list";

export function PostGroupsWorkspace({
  channelId,
  channels,
  initialGroupId,
  newGroupRequested,
  onNewGroupRequestHandled,
  onOpenPost,
}: {
  channelId: string;
  channels: TelegramChannel[];
  initialGroupId: string;
  newGroupRequested: boolean;
  onNewGroupRequestHandled: () => void;
  onOpenPost: (post: TelegramManagedPost) => void;
}) {
  const { locale, t } = useI18n();
  const localizedApiError = useCallback(
    (error: unknown, fallback: string) =>
      safeApiErrorMessage(error, locale, t, fallback),
    [locale, t],
  );
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const openedFromSearchRef = useRef("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectGroup = (groupId: string | null) => {
    setSelectedGroupId(groupId);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        groupId,
        postView: "groups",
      }),
    );
  };
  const [groupForm, setGroupForm] = useState<PostGroup | "new" | null>(null);
  useEffect(() => {
    if (!newGroupRequested) return;
    const timeout = window.setTimeout(() => {
      setGroupForm("new");
      onNewGroupRequestHandled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [newGroupRequested, onNewGroupRequestHandled]);
  const [addPostsOpen, setAddPostsOpen] = useState(false);
  const [movingGroupPost, setMovingGroupPost] =
    useState<TelegramManagedPost | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resetDraftsOpen, setResetDraftsOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const reorderVersionRef = useRef(0);
  const reorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const groupsPagination = usePagination({ initialPageSize: 12 });
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const groups = useQuery({
    queryKey: [
      "post-groups",
      channelId,
      showArchivedGroups,
      { page: groupsPagination.page, pageSize: groupsPagination.pageSize },
    ],
    queryFn: () =>
      telegramChannelsApi.postGroupsPage({
        telegramChannelId: channelId,
        page: groupsPagination.page,
        pageSize: groupsPagination.pageSize,
        archived: showArchivedGroups,
      }),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ["post-group", selectedGroupId],
    queryFn: () => telegramChannelsApi.postGroup(selectedGroupId as string),
    enabled: Boolean(selectedGroupId),
  });
  const groupPostsPagination = usePagination({ initialPageSize: 50 });
  const posts = useQuery({
    queryKey: [
      "telegram-managed-posts",
      channelId,
      "group-picker",
      {
        page: groupPostsPagination.page,
        pageSize: groupPostsPagination.pageSize,
      },
    ],
    queryFn: () =>
      telegramChannelsApi.managedPostsPage(channelId, {
        page: groupPostsPagination.page,
        pageSize: groupPostsPagination.pageSize,
      }),
    placeholderData: keepPreviousData,
  });
  const [orderedPostIds, setOrderedPostIds] = useState<string[]>([]);
  const orderedPosts = useMemo(() => {
    const source = detail.data?.posts || [];
    if (
      orderedPostIds.length !== source.length ||
      orderedPostIds.some((id) => !source.some((post) => post.id === id))
    ) {
      return source;
    }
    const byId = new Map(source.map((post) => [post.id, post]));
    return orderedPostIds
      .map((id) => byId.get(id))
      .filter((post): post is TelegramManagedPost => Boolean(post));
  }, [detail.data?.posts, orderedPostIds]);

  const groupsList = useMemo(() => groups.data?.items || [], [groups.data]);
  const groupsLoading = groups.isLoading || groups.isPlaceholderData;
  useEffect(() => {
    if (!initialGroupId) {
      openedFromSearchRef.current = "";
      return;
    }
    if (openedFromSearchRef.current === initialGroupId) return;
    setSelectedGroupId(initialGroupId);
    openedFromSearchRef.current = initialGroupId;
  }, [groupsList, initialGroupId]);
  const refresh = async (channelIds: string[] = [channelId]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.invalidateQueries({ queryKey: ["post-groups", id] }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", id],
        }),
      ]),
      selectedGroupId
        ? queryClient.invalidateQueries({
            queryKey: ["post-group", selectedGroupId],
          })
        : Promise.resolve(),
    ]);
  };

  const forceReloadGroupData = async (channelIds: string[]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    uniqueChannelIds.forEach((id) => {
      queryClient.removeQueries({ queryKey: ["post-groups", id], exact: true });
      queryClient.removeQueries({
        queryKey: ["telegram-managed-posts", id],
        exact: true,
      });
    });
    if (selectedGroupId) {
      queryClient.removeQueries({
        queryKey: ["post-group", selectedGroupId],
        exact: true,
      });
    }
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.refetchQueries({
          queryKey: ["post-groups", id],
          exact: true,
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["telegram-managed-posts", id],
          exact: true,
          type: "active",
        }),
      ]),
    ]);
  };

  const scheduleProgressDismiss = (progressId: string, delayMs = 2800) => {
    window.setTimeout(() => clearProgress(progressId), delayMs);
  };
  const scheduleReorderSave = (
    groupId: string,
    orderedPostIdsToSave: string[],
  ) => {
    reorderVersionRef.current += 1;
    const version = reorderVersionRef.current;
    if (reorderTimerRef.current) {
      window.clearTimeout(reorderTimerRef.current);
    }
    reorderTimerRef.current = window.setTimeout(() => {
      reorderQueueRef.current = reorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousDetail = queryClient.getQueryData<PostGroup>([
            "post-group",
            groupId,
          ]);
          const previousPosts = snapshotManagedPostPages(
            queryClient,
            channelId,
          );
          const orderIndex = new Map(
            orderedPostIdsToSave.map((id, index) => [id, index]),
          );
          queryClient.setQueryData<PostGroup>(
            ["post-group", groupId],
            (current) =>
              current
                ? {
                    ...current,
                    posts: normalizeManagedPostNumbering(
                      [...(current.posts ?? [])].map((post) => ({
                        ...post,
                        groupPosition:
                          orderIndex.get(post.id) ?? post.groupPosition,
                      })),
                    ),
                  }
                : current,
          );
          mapManagedPostPages(queryClient, channelId, (current) => ({
            ...current,
            items: [
              ...normalizeManagedPostNumbering(
                current.items
                  .filter((post) => orderIndex.has(post.id))
                  .map((post) => ({
                    ...post,
                    groupPosition:
                      orderIndex.get(post.id) ?? post.groupPosition,
                  })),
              ),
              ...current.items.filter((post) => !orderIndex.has(post.id)),
            ],
          }));
          try {
            await telegramChannelsApi.reorderPostGroup(
              groupId,
              orderedPostIdsToSave,
              true,
            );
            if (version !== reorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["post-group", groupId],
              }),
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
            ]);
            setOrderedPostIds([]);
            pushToast(
              t("telegram.posts.editor.postOrderSaved"),
              "success",
              3000,
            );
          } catch (error) {
            if (version !== reorderVersionRef.current) return;
            queryClient.setQueryData(["post-group", groupId], previousDetail);
            restoreManagedPostPages(queryClient, previousPosts);
            setOrderedPostIds([]);
            pushToast(
              localizedApiError(
                error,
                t("telegram.posts.editor.error.reorder"),
              ),
              "error",
            );
          }
        });
    }, 700);
  };

  const runBulk = async (
    title: string,
    request: (
      onProgress: (
        item: BulkActionResultItem,
        current: number,
        total: number,
      ) => void,
    ) => Promise<BulkActionResult>,
    progressMeta?: {
      id?: string;
      title?: string;
      iconEmoji?: string;
      iconUrl?: string;
      initialMessage?: string;
    },
  ) => {
    const total = detail.data?.posts?.length || 0;
    const progressId = progressMeta?.id;
    setProgress({
      id: progressId,
      title: progressMeta?.title || title,
      current: 0,
      total,
      message: progressMeta?.initialMessage || t("common.loading"),
      iconEmoji: progressMeta?.iconEmoji,
      iconUrl: progressMeta?.iconUrl,
      successCount: 0,
      failedCount: 0,
    });
    try {
      let successful = 0;
      let failed = 0;
      const result = await request((item, current, progressTotal) => {
        if (item.success && !item.skipped) successful += 1;
        else if (!item.success && !item.skipped) failed += 1;
        setProgress({
          id: progressId,
          title: progressMeta?.title || title,
          current,
          total: progressTotal,
          message: localizedBulkActionMessage(item, locale, t),
          iconEmoji: progressMeta?.iconEmoji,
          iconUrl: progressMeta?.iconUrl,
          successCount: successful,
          failedCount: failed,
        });
      });
      setProgress({
        id: progressId,
        title: progressMeta?.title || title,
        current: result.total,
        total: result.total,
        message: result.results.at(-1)
          ? localizedBulkActionMessage(result.results.at(-1)!, locale, t)
          : t("telegram.posts.bulk.completed", {
              success: result.successCount,
              failed: result.failedCount,
              skipped: result.skippedCount,
            }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconEmoji: progressMeta?.iconEmoji,
        iconUrl: progressMeta?.iconUrl,
      });
      if (progressId) scheduleProgressDismiss(progressId);
      else window.setTimeout(() => setProgress(null), 2800);
      await refresh();
      return result;
    } catch (error) {
      if (progressId) clearProgress(progressId);
      else setProgress(null);
      pushToast(
        localizedApiError(
          error,
          t("telegram.posts.groups.actionFailed", { action: title }),
        ),
        "error",
        7000,
      );
      throw error;
    }
  };

  const groupActionButtonClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800";
  const groupIconActionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition hover:bg-neutral-800";

  if (selectedGroupId) {
    const group = detail.data;
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => selectGroup(null)}
            className={groupActionButtonClass}
          >
            ← {t("telegram.posts.tabs.groups")}
          </button>
          {group ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddPostsOpen(true)}
                className={groupActionButtonClass}
              >
                <ListPlus size={14} />
                {t("telegram.posts.groups.addPosts")}
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className={groupActionButtonClass}
              >
                <Clock3 size={14} />
                {t("telegram.posts.groups.schedule")}
              </button>
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                <Rocket size={14} />
                {t("telegram.posts.groups.publishAllAction")}
              </button>
              <button
                type="button"
                onClick={() => setResetDraftsOpen(true)}
                className={groupActionButtonClass}
              >
                <RotateCcw size={14} />
                {t("telegram.posts.groups.makeDrafts")}
              </button>
              {!group.isSystem ? (
                <>
                  <button
                    type="button"
                    onClick={() => setGroupForm(group)}
                    className={groupIconActionButtonClass}
                    title={t("telegram.posts.groups.edit")}
                    aria-label={t("telegram.posts.groups.edit")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await telegramChannelsApi.updatePostGroup(group.id, {
                        archived: !showArchivedGroups,
                      });
                      selectGroup(null);
                      setShowArchivedGroups(!showArchivedGroups);
                      await queryClient.invalidateQueries({
                        queryKey: ["post-groups", channelId],
                      });
                    }}
                    className={groupIconActionButtonClass}
                    title={t(
                      showArchivedGroups
                        ? "telegram.posts.groups.restore"
                        : "telegram.posts.groups.archive",
                    )}
                    aria-label={t(
                      showArchivedGroups
                        ? "telegram.posts.groups.restore"
                        : "telegram.posts.groups.archive",
                    )}
                  >
                    {showArchivedGroups ? (
                      <RotateCcw size={14} />
                    ) : (
                      <Archive size={14} />
                    )}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {detail.isLoading ? <LoadingState /> : null}
        {group ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <PostIcon
                  iconId={group.icon}
                  icon={group.iconPresentation}
                  label={telegramPostGroupTitle(group, t)}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">
                    {telegramPostGroupTitle(group, t)}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {group.description ||
                      t("telegram.posts.groups.noDescription")}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  {group.isSystem
                    ? t("telegram.posts.groups.groupType")
                    : t("telegram.posts.groups.createdBy")}
                </p>
                {group.isSystem ? (
                  <span className="inline-flex rounded-full border border-amber-600/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
                    {t("telegram.posts.groups.systemGroup")}
                  </span>
                ) : (
                  <MemberBadge member={group.createdByMember} />
                )}
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  {t("telegram.posts.groups.telegramChannel")}
                </p>
                <p className="text-sm text-neutral-200">
                  {group.telegramChannel?.title ||
                    channels.find((item) => item.id === group.telegramChannelId)
                      ?.title}
                </p>
              </div>
              <GroupSummary summary={group.statusSummary} />
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">
                  {t("telegram.posts.groups.postsInGroup")}
                </h3>
                <span className="text-xs text-neutral-500">
                  {t("telegram.posts.groups.dragToReorder")}
                </span>
              </div>
              {orderedPosts.length ? (
                <div className="space-y-2">
                  {orderedPosts.map((post) => (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={() => setDraggedId(post.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!draggedId || draggedId === post.id) return;
                        setOrderedPostIds((currentIds) => {
                          const current = currentIds.length
                            ? currentIds
                            : orderedPosts.map((item) => item.id);
                          const from = current.indexOf(draggedId);
                          const to = current.indexOf(post.id);
                          if (from < 0 || to < 0) return current;
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        scheduleReorderSave(
                          group.id,
                          orderedPosts.map((item) => item.id),
                        );
                      }}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        draggedId === post.id
                          ? "border-blue-500 bg-blue-950/30 opacity-70"
                          : "border-neutral-800 bg-neutral-950"
                      }`}
                    >
                      <GripVertical
                        size={18}
                        className="cursor-grab text-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-white">
                          {post.icon ? (
                            <PostIcon
                              iconId={post.icon}
                              icon={post.iconPresentation}
                              label={post.title}
                              bare
                            />
                          ) : (
                            <PostStatusIcon status={post.status} />
                          )}
                          <span className="truncate">{post.title}</span>
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {post.scheduledAt
                            ? formatDateTime(
                                post.scheduledAt,
                                locale,
                                post.scheduleTimezone ?? undefined,
                              )
                            : t(managedPostStatusKey(post.status))}
                        </span>
                      </button>
                      <MemberBadge member={post.assignedMember} compact />
                      <button
                        className="rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                        title={t("telegram.posts.editor.moveToChannel")}
                        onClick={() => setMovingGroupPost(post)}
                      >
                        <MoveRight size={14} />
                      </button>
                      <button
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                        onClick={async () => {
                          await telegramChannelsApi.removePostFromGroup(
                            group.id,
                            post.id,
                          );
                          await refresh();
                        }}
                      >
                        {t("common.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={t("telegram.posts.groups.empty")} />
              )}
            </Card>
          </div>
        ) : null}
        {groupForm ? (
          <GroupFormModal
            key={groupForm === "new" ? "new" : groupForm.id}
            value={groupForm}
            channelId={channelId}
            onClose={() => setGroupForm(null)}
            onSaved={async (saved) => {
              setGroupForm(null);
              selectGroup(saved.id);
              await refresh();
            }}
          />
        ) : null}
        {addPostsOpen ? (
          <AddPostsModal
            group={group}
            posts={posts.data?.items || []}
            pagination={posts.data?.pagination}
            onPageChange={groupPostsPagination.setPage}
            onPageSizeChange={groupPostsPagination.setPageSize}
            loading={posts.isLoading || posts.isPlaceholderData}
            onClose={() => setAddPostsOpen(false)}
            onAdded={async () => {
              setAddPostsOpen(false);
              await refresh();
            }}
          />
        ) : null}
        {movingGroupPost ? (
          <MovePostModal
            post={movingGroupPost}
            channels={channels}
            sourceChannelId={group?.telegramChannelId || channelId}
            onClose={() => setMovingGroupPost(null)}
            onMoved={async (result) => {
              setMovingGroupPost(null);
              await refresh();
              pushToast(
                t("telegram.posts.bulk.completed", {
                  success: result.successCount,
                  failed: result.failedCount,
                  skipped: result.skippedCount,
                }),
                result.failedCount ? "error" : "success",
                7000,
              );
            }}
          />
        ) : null}
        <PublishGroupModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          onSubmit={async (options) => {
            setPublishOpen(false);
            await runBulk(
              t("telegram.posts.groups.publishProgress"),
              (onProgress) =>
                telegramChannelsApi.publishPostGroup(
                  group!.id,
                  options,
                  true,
                  onProgress,
                ),
            );
          }}
        />
        <ScheduleGroupModal
          open={scheduleOpen}
          group={group}
          onClose={() => setScheduleOpen(false)}
          onSubmit={async (payload) => {
            setScheduleOpen(false);
            await runBulk(
              t("telegram.posts.groups.scheduleProgress"),
              (onProgress) =>
                telegramChannelsApi.schedulePostGroupSequence(
                  group!.id,
                  payload,
                  true,
                  onProgress,
                ),
            );
          }}
        />
        <Modal
          open={resetDraftsOpen}
          onClose={() => setResetDraftsOpen(false)}
          title={t("telegram.posts.groups.makeDraftsTitle")}
        >
          <p className="text-sm text-neutral-300">
            {t("telegram.posts.groups.scheduledDraftDescription")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setResetDraftsOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setResetDraftsOpen(false);
                void runBulk(
                  t("telegram.posts.groups.draftProgress"),
                  (onProgress) =>
                    telegramChannelsApi.resetPostGroupToDrafts(
                      group!.id,
                      true,
                      onProgress,
                    ),
                ).catch(() => undefined);
              }}
            >
              {t("telegram.posts.groups.makeAllDrafts")}
            </Button>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <ManagedPostGroupList
      channelId={channelId}
      groupForm={groupForm}
      groups={groups}
      groupsList={groupsList}
      groupsLoading={groupsLoading}
      groupsPagination={groupsPagination}
      selectGroup={selectGroup}
      setGroupForm={setGroupForm}
      setShowArchivedGroups={setShowArchivedGroups}
      showArchivedGroups={showArchivedGroups}
    />
  );
}
