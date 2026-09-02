"use client";


import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  ExternalLink,
  Folder,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { telegramManagedPostStatusKey } from "@/lib/features/telegram/telegram-posts-i18n";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import {
  ChannelImportNavigation,
  type ChannelImportMode,
} from "./channel-import-navigation";

export const channelDeletionPrompt = `Prepare a deletion file for the current Telegram channel. Return only one JSON object in this exact shape:

{
  "postIds": ["managed-post-id"],
  "groupIds": ["post-group-id"]
}

Rules and consequences:
- Use only managed post IDs and post group IDs from the current channel.
- postIds deletes only the listed managed posts. Other posts and other copies are not deleted.
- A scheduled post is cancelled in Telegram before its managed record is deleted.
- Deleting a published managed post does not remove the already published Telegram message.
- groupIds deletes only the listed group. If a group contains 10 posts, all 10 posts remain and become ungrouped.
- Posts are processed before groups, so a file may explicitly delete selected posts and then delete their group.
- Empty arrays are allowed, but at least one ID must be present across both arrays.
- Do not add comments, Markdown fences, explanations, titles, or IDs that were not provided.`;

export function parseChannelDeletionFile(content: string) {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_DELETION_FILE");
  }
  const value = parsed as { postIds?: unknown; groupIds?: unknown };
  const parseIds = (input: unknown, field: string) => {
    if (input == null) return [];
    if (!Array.isArray(input) || input.some((id) => typeof id !== "string")) {
      throw new Error("INVALID_DELETION_FILE");
    }
    return [...new Set(input.map((id) => id.trim()).filter(Boolean))];
  };
  const postIds = parseIds(value.postIds, "postIds");
  const groupIds = parseIds(value.groupIds, "groupIds");
  if (!postIds.length && !groupIds.length) {
    throw new Error("EMPTY_DELETION_FILE");
  }
  return { postIds, groupIds };
}

export function excludeChannelDeletionItem(
  value: { postIds: string[]; groupIds: string[] },
  field: "postIds" | "groupIds",
  id: string,
) {
  const next = {
    postIds: [...value.postIds],
    groupIds: [...value.groupIds],
    [field]: value[field].filter((itemId) => itemId !== id),
  };
  return next.postIds.length || next.groupIds.length
    ? JSON.stringify(next, null, 2)
    : "";
}

function PreviewSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-2" aria-label={t("telegram.posts.support.loadingDeletion")}>
      {[0, 1].map((item) => (
        <div
          key={item}
          className="h-14 animate-pulse rounded-lg bg-neutral-900"
        />
      ))}
    </div>
  );
}

export function ChannelReimportDeleteModal({
  open,
  channelId,
  mode,
  onModeChange,
  onClose,
}: {
  open: boolean;
  channelId: string;
  mode: ChannelImportMode;
  onModeChange: (mode: ChannelImportMode) => void;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    if (!content.trim()) return { value: null, error: "" };
    try {
      return { value: parseChannelDeletionFile(content), error: "" };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error && error.message === "EMPTY_DELETION_FILE"
          ? t("telegram.posts.import.emptyDeletionFile")
          : t("telegram.posts.import.invalidDeletionFile"),
      };
    }
  }, [content, t]);
  const posts = useQuery({
    queryKey: ["telegram-managed-post-lookup", channelId, parsed.value?.postIds],
    queryFn: () =>
      telegramChannelsApi.lookupManagedPosts(
        channelId,
        parsed.value?.postIds ?? [],
      ),
    enabled: open && Boolean(parsed.value?.postIds.length),
  });
  const groups = useQuery({
    queryKey: telegramPostKeys.postGroups(channelId),
    queryFn: () =>
      telegramChannelsApi.postGroupSummaries(channelId),
    enabled: open && Boolean(parsed.value?.groupIds.length),
  });
  const postById = new Map(
    (posts.data?.items || []).map((post) => [post.id, post]),
  );
  const groupById = new Map(
    (groups.data || []).map((group) => [group.id, group]),
  );
  const previewLoading =
    (Boolean(parsed.value?.postIds.length) && posts.isPending) ||
    (Boolean(parsed.value?.groupIds.length) && groups.isPending);
  const unknownIds =
    parsed.value && !previewLoading
      ? [
          ...(posts.data?.missingIds ?? parsed.value.postIds.filter((id) => !postById.has(id))),
          ...parsed.value.groupIds.filter((id) => !groupById.has(id)),
        ]
      : [];
  const canDelete =
    Boolean(parsed.value) && !previewLoading && !unknownIds.length && !busy;

  const excludeItem = (field: "postIds" | "groupIds", id: string) => {
    if (!parsed.value) return;
    setContent(excludeChannelDeletionItem(parsed.value, field, id));
    setFileName(null);
  };

  const copyDeletionPrompt = async () => {
    try {
      await navigator.clipboard.writeText(channelDeletionPrompt);
      pushToast(t("telegram.posts.support.deletionPromptCopied"), "success");
    } catch {
      pushToast(t("telegram.posts.support.deletionPromptCopyError"), "error");
    }
  };

  const execute = async () => {
    if (!parsed.value || !canDelete) return;
    setBusy(true);
    const total = parsed.value.postIds.length + parsed.value.groupIds.length;
    const operation = startOperation({
      id: `channel-file-delete:${channelId}`,
      title: t("telegram.posts.import.deleteOperation"),
      message: t("telegram.posts.import.deleting"),
      current: 0,
      total,
    });
    try {
      let completed = 0;
      if (parsed.value.postIds.length) {
        const result = await telegramChannelsApi.deleteManagedPosts(
          channelId,
          parsed.value.postIds,
        );
        if (result.failedCount)
          throw new Error(`${result.failedCount} posts could not be deleted.`);
        completed += parsed.value.postIds.length;
        operation.update({
          current: completed,
          total,
          message: t("telegram.posts.import.postsDeleted"),
        });
      }
      for (const groupId of parsed.value.groupIds) {
        await telegramChannelsApi.deletePostGroup(groupId);
        completed += 1;
        operation.update({
          current: completed,
          total,
          message: t("telegram.posts.import.deletingGroups"),
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedCalendar(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.postGroups(channelId),
        }),
      ]);
      operation.succeed({ message: t("telegram.posts.import.deletedItems", { count: total }) });
      setContent("");
      setFileName(null);
      onClose();
    } catch (error) {
      const message = safeApiErrorMessage(error, locale, t, t("telegram.posts.import.deleteError"));
      operation.fail({ message });
      pushToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("telegram.posts.support.channelImport")} size="xl">
      <div className="space-y-4">
        <ChannelImportNavigation
          value={mode}
          onChange={onModeChange}
          disabled={busy}
        />
        <div className="rounded-xl border border-rose-900/70 bg-rose-950/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-rose-100">
                {t("telegram.posts.import.deleteTitle")}
              </h3>
              <p className="mt-1 text-sm text-neutral-400">
                {t("telegram.posts.import.deleteHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void copyDeletionPrompt()}
            >
              <ClipboardList size={15} /> {t("telegram.posts.import.prompt")}
            </Button>
          </div>
        </div>
        <ManagedPostsImportSource
          content={content}
          fileName={fileName}
          disabled={busy}
          onContent={(value) => {
            setContent(value);
            setFileName(null);
          }}
          onFile={(file) =>
            void file.text().then((value) => {
              setContent(value);
              setFileName(file.name);
            })
          }
          onClear={() => {
            setContent("");
            setFileName(null);
          }}
          onCopyContent={() => void navigator.clipboard.writeText(content)}
        />
        {parsed.error || unknownIds.length ? (
          <p className="rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
            {parsed.error ||
              t("telegram.posts.import.unknownIds", { ids: unknownIds.join(", ") })}
          </p>
        ) : null}
        {parsed.value && previewLoading ? <PreviewSkeleton /> : null}
        {parsed.value && !previewLoading && !unknownIds.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <h4 className="mb-2 text-sm font-semibold text-white">
                {t("telegram.posts.import.postsToDelete", { count: parsed.value.postIds.length })}
              </h4>
              {parsed.value.postIds.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {parsed.value.postIds.map((id) => {
                    const post = postById.get(id);
                    if (!post) return null;
                    const relevantDate = post.scheduledAt || post.publishedAt;
                    return (
                      <div
                        key={id}
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/70 p-2"
                      >
                        <IconAvatar
                          icon={post.iconPresentation}
                          label={post.title}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {post.title}
                          </p>
                          <p className="truncate text-xs text-neutral-400">
                            {t(telegramManagedPostStatusKey(post.status))}
                            {relevantDate
                              ? ` · ${new Date(relevantDate).toLocaleString()}`
                              : ""}
                          </p>
                        </div>
                        <a
                          href={`/telegram-posts/${channelId}/editor?postId=${post.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition hover:border-blue-500 hover:text-blue-400"
                          aria-label={t("telegram.posts.support.openNamed", { title: post.title })}
                          title={t("telegram.posts.support.openNewTab")}
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition hover:border-neutral-500 hover:text-white"
                          aria-label={t("telegram.posts.import.excludeNamed", { title: post.title })}
                          title={t("telegram.posts.support.excludeDeletion")}
                          onClick={() => excludeItem("postIds", id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">{t("telegram.posts.support.noPostsSelected")}</p>
              )}
            </section>
            <section className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <h4 className="mb-2 text-sm font-semibold text-white">
                {t("telegram.posts.import.groupsToDelete", { count: parsed.value.groupIds.length })}
              </h4>
              {parsed.value.groupIds.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {parsed.value.groupIds.map((id) => {
                    const group = groupById.get(id);
                    if (!group) return null;
                    const postsCount =
                      group.postsCount ?? group.statusSummary.totalPosts;
                    return (
                      <div
                        key={id}
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/70 p-2"
                      >
                        {group.iconPresentation ? (
                          <IconAvatar
                            icon={group.iconPresentation}
                            label={group.title}
                            size="sm"
                          />
                        ) : (
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-300">
                            <Folder size={15} />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {group.title}
                          </p>
                          <p className="truncate text-xs text-neutral-400">
                            {t("telegram.posts.import.postsCount", { count: postsCount })}
                            {group.description ? ` · ${group.description}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition hover:border-neutral-500 hover:text-white"
                          aria-label={t("telegram.posts.import.excludeNamed", { title: group.title })}
                          title={t("telegram.posts.support.excludeDeletion")}
                          onClick={() => excludeItem("groupIds", id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">{t("telegram.posts.support.noGroupsSelected")}</p>
              )}
            </section>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button
            variant="danger"
            disabled={!canDelete}
            onClick={() => void execute()}
          >
            {busy ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            {t("telegram.posts.import.deleteSelected")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
