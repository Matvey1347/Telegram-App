"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelegramUnifiedImportManifest } from "@telegram-system/shared";
import { telegramChannelsApi } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { ManagedPostsImportWorkspace } from "./managed-posts-import-workspace";
import { ActionBadge } from "./unified-import-entities-preview";
import { buildManagedPostInternalLinks } from "./managed-post-internal-links-notice";
import {
  importImageSearchToArray,
  rowIndicesForTab,
  selectionAfterEditableRowUpdate,
  urlsTextToArray,
  type EditableImportRow,
  type ImportRowTab,
} from "./managed-posts-import-model";

type PostRow = NonNullable<TelegramUnifiedImportManifest["posts"]>[number];

export function UnifiedImportPostsPreview({
  operation,
  manifest,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
  captionLengthMax,
  messageLengthMax,
  disabled,
  onChange,
}: {
  operation: "CREATE" | "UPDATE";
  manifest: TelegramUnifiedImportManifest;
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax: number;
  messageLengthMax: number;
  disabled: boolean;
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
}) {
  const { t } = useI18n();
  const editablePosts = (manifest.posts ?? []).filter(
    (post) => post.action === operation,
  );
  const [activeTab, setActiveTab] = useState<ImportRowTab>("new");
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const rows = useMemo(
    () =>
      editablePosts.map((post) =>
        toEditableRow(
          post,
          (manifest.schedule ?? []).find((item) => item.postRef === post.ref)
            ?.scheduledAt ?? null,
        ),
      ),
    [editablePosts, manifest.schedule],
  );
  const visibleRowIndices = rowIndicesForTab(rows, activeTab);
  const resolvedTab: ImportRowTab = visibleRowIndices.length
    ? activeTab
    : activeTab === "new" && rowIndicesForTab(rows, "imported").length
      ? "imported"
      : "new";
  const resolvedVisibleRows = rowIndicesForTab(rows, resolvedTab);
  const resolvedSelectedIndex = resolvedVisibleRows.includes(selectedRowIndex)
    ? selectedRowIndex
    : (resolvedVisibleRows[0] ?? 0);
  const selectedPost = editablePosts[resolvedSelectedIndex];
  const selectedSchedule = (manifest.schedule ?? []).find(
    (item) =>
      item.action !== "UNSCHEDULE" && item.postRef === selectedPost?.ref,
  );
  const referencedPostIds = useMemo(
    () => [
      ...new Set(
        rows.flatMap((row) =>
          buildManagedPostInternalLinks(row.text).map((link) => link.targetId),
        ),
      ),
    ],
    [rows],
  );
  const referencedPosts = useQuery({
    queryKey: ["telegram-managed-post-lookup", channelId, referencedPostIds],
    queryFn: () =>
      telegramChannelsApi.lookupManagedPosts(channelId, referencedPostIds),
    enabled: referencedPostIds.length > 0 && referencedPostIds.length <= 1_000,
  });
  const groupOptions = useMemo(
    () => [
      { value: "__no_group__", label: t("telegram.posts.import.noGroup") },
      ...(manifest.groups ?? [])
        .filter((group) => group.action !== "DELETE")
        .map((group) => ({
          value: group.ref,
          label: group.title || group.ref,
          iconEmoji: group.icon || undefined,
        })),
    ],
    [manifest.groups, t],
  );

  const replaceEditablePosts = (nextPosts: PostRow[]) => {
    const visibleRefs = new Set(editablePosts.map((post) => post.ref));
    const preserved = (manifest.posts ?? []).filter(
      (post) => !visibleRefs.has(post.ref),
    );
    const refs = new Set(
      [...nextPosts, ...preserved]
        .filter((post) => post.action !== "DELETE")
        .map((post) => post.ref),
    );
    onChange({
      ...manifest,
      posts: [...nextPosts, ...preserved],
      schedule: (manifest.schedule ?? []).filter(
        (item) =>
          item.action === "UNSCHEDULE" ||
          Boolean(item.postId) ||
          (Boolean(item.postRef) && refs.has(item.postRef!)),
      ),
    });
  };
  const updateRow = (index: number, patch: Partial<EditableImportRow>) => {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    const nextPosts = editablePosts.map((post, rowIndex) =>
      rowIndex === index ? fromEditableRow(post, nextRows[rowIndex]) : post,
    );
    const schedule = [...(manifest.schedule ?? [])];
    const scheduleIndex = schedule.findIndex(
      (item) => item.postRef === editablePosts[index]?.ref,
    );
    if (patch.scheduledAt !== undefined) {
      if (!patch.scheduledAt && scheduleIndex >= 0)
        schedule.splice(scheduleIndex, 1);
      if (patch.scheduledAt && scheduleIndex >= 0) {
        schedule[scheduleIndex] = {
          ...schedule[scheduleIndex],
          scheduledAt: patch.scheduledAt,
        };
      }
    }
    const visibleRefs = new Set(editablePosts.map((post) => post.ref));
    const preserved = (manifest.posts ?? []).filter(
      (post) => !visibleRefs.has(post.ref),
    );
    onChange({ ...manifest, posts: [...nextPosts, ...preserved], schedule });
    const selection = selectionAfterEditableRowUpdate(
      nextRows,
      resolvedTab,
      index,
      patch,
    );
    setActiveTab(selection.tab);
    setSelectedRowIndex(selection.selectedRowIndex);
  };

  return (
    <div className="space-y-3">
      {rows.length ? (
        <ManagedPostsImportWorkspace
          rows={rows}
          visibleRowIndices={resolvedVisibleRows}
          selectedRowIndex={resolvedSelectedIndex}
          activeTab={resolvedTab}
          tabCounts={{
            new: rowIndicesForTab(rows, "new").length,
            imported: rowIndicesForTab(rows, "imported").length,
          }}
          selectedRowAdornment={
            <ActionBadge
              action={editablePosts[resolvedSelectedIndex]?.action ?? operation}
            />
          }
          scheduleValue={selectedSchedule}
          disabled={disabled}
          channelId={channelId}
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          channelTelegramChatId={channelTelegramChatId}
          captionLengthMax={captionLengthMax}
          messageLengthMax={messageLengthMax}
          referencedPosts={referencedPosts.data?.items ?? []}
          groupOptions={groupOptions}
          hypothesisOptions={(manifest.hypotheses ?? [])
            .filter((hypothesis) => hypothesis.action !== "DELETE")
            .map((hypothesis) => ({
              value: hypothesis.ref,
              label: hypothesis.value?.name || hypothesis.ref,
              iconEmoji: hypothesis.icon || undefined,
            }))}
          onUpdateRow={updateRow}
          onDeleteRow={(index) => {
            const next = editablePosts.filter(
              (_, rowIndex) => rowIndex !== index,
            );
            replaceEditablePosts(next);
            setSelectedRowIndex(Math.max(0, index - 1));
          }}
          onSelectRow={setSelectedRowIndex}
          onUpdateHypotheses={(index, hypothesisRefs) => {
            const posts = [...(manifest.posts ?? [])];
            const target = editablePosts[index];
            const manifestIndex = posts.findIndex(
              (post) => post.ref === target?.ref,
            );
            if (manifestIndex < 0) return;
            posts[manifestIndex] = { ...posts[manifestIndex], hypothesisRefs };
            onChange({ ...manifest, posts });
          }}
          onScheduleChange={(index, value) => {
            const target = editablePosts[index];
            if (!target) return;
            const schedule = [...(manifest.schedule ?? [])];
            const scheduleIndex = schedule.findIndex(
              (item) =>
                item.action !== "UNSCHEDULE" && item.postRef === target.ref,
            );
            if (!value.scheduledAt) {
              if (scheduleIndex >= 0) schedule.splice(scheduleIndex, 1);
            } else {
              const nextSchedule = {
                action: "SCHEDULE" as const,
                postRef: target.ref,
                slotId: value.slotId ?? schedule[scheduleIndex]?.slotId ?? "",
                scheduledAt: value.scheduledAt,
                slotKind: schedule[scheduleIndex]?.slotKind,
              };
              if (scheduleIndex >= 0) schedule[scheduleIndex] = nextSchedule;
              else schedule.push(nextSchedule);
            }
            onChange({ ...manifest, schedule });
          }}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setSelectedRowIndex(rowIndicesForTab(rows, tab)[0] ?? 0);
          }}
        />
      ) : null}
    </div>
  );
}

function toEditableRow(
  post: PostRow,
  scheduledAt: string | null,
): EditableImportRow {
  return {
    title: post.title ?? "",
    text: post.text ?? "",
    icon: post.icon ?? "",
    urlsText: (post.imageUrls ?? []).join("\n"),
    imageSearchText: (post.imageSearch ?? []).join("\n"),
    groupId: post.groupRef,
    scheduledAt,
    imported: post.imported === true,
    approved: post.approved === true,
    hypothesisRefs: post.hypothesisRefs ?? [],
  };
}

function fromEditableRow(post: PostRow, row: EditableImportRow): PostRow {
  return {
    ...post,
    title: row.title,
    text: row.text,
    icon: row.icon || null,
    imageUrls: urlsTextToArray(row.urlsText),
    imageSearch: importImageSearchToArray(row.imageSearchText),
    groupRef: row.groupId,
    imported: row.imported,
    approved: row.approved,
  };
}
