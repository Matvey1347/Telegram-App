"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import { PostGroupCardsSkeleton } from "@/components/features/telegram/telegram/post-group-cards-skeleton";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { telegramChannelsApi, type PostGroup } from "@/lib/api";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { EmptyState } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  Pagination,
  THREE_COLUMN_GRID_PAGE_SIZES,
} from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import type { PaginatedResponse } from "@/lib/api";
import { PostIcon } from "./managed-post-identity";
import { GroupSummary } from "./managed-post-group-summary";
import { GroupFormModal } from "./managed-post-group-form-modal";

export function ManagedPostGroupList({
  channelId,
  groupForm,
  groups,
  groupsList,
  groupsLoading,
  groupsPagination,
  selectGroup,
  setGroupForm,
  setShowArchivedGroups,
  showArchivedGroups,
}: {
  channelId: string;
  groupForm: PostGroup | "new" | null;
  groups: {
    isError: boolean;
    data?: PaginatedResponse<PostGroup>;
    refetch: () => Promise<unknown>;
  };
  groupsList: PostGroup[];
  groupsLoading: boolean;
  groupsPagination: ReturnType<typeof usePagination>;
  selectGroup: (groupId: string | null) => void;
  setGroupForm: (group: PostGroup | "new" | null) => void;
  setShowArchivedGroups: (archived: boolean) => void;
  showArchivedGroups: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {t("telegram.posts.groups.title")}
          </h2>
          <p className="text-sm text-neutral-400">
            {t("telegram.posts.groups.namedSeries")}
          </p>
        </div>
      </div>
      <div
        className="mb-4 flex gap-2"
        role="tablist"
        aria-label={t("telegram.posts.groups.status")}
      >
        {[false, true].map((archived) => (
          <button
            key={String(archived)}
            type="button"
            role="tab"
            aria-selected={showArchivedGroups === archived}
            onClick={() => {
              setShowArchivedGroups(archived);
              groupsPagination.setPage(1);
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${showArchivedGroups === archived ? "border-blue-500 bg-blue-600 text-white" : "border-neutral-700 text-neutral-300"}`}
          >
            {t(
              archived
                ? "telegram.posts.groups.archived"
                : "telegram.posts.groups.active",
            )}{" "}
            <span className="ml-1 rounded-full bg-black/20 px-1.5">
              {groups.isError ? "—" : (groups.data?.pagination.totalItems ?? 0)}
            </span>
          </button>
        ))}
      </div>
      {groups.isError ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200"
        >
          {t("telegram.posts.groups.loadError")}
        </div>
      ) : null}
      {groupsLoading ? (
        <PostGroupCardsSkeleton
          count={groups.data?.items.length || groupsPagination.pageSize}
        />
      ) : null}
      {!groupsLoading && !groups.isError && groupsList.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupsList.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-blue-700 hover:bg-neutral-900/80"
            >
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <PostIcon
                      iconId={group.icon}
                      icon={group.iconPresentation}
                      label={telegramPostGroupTitle(group, t)}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-white">
                        {telegramPostGroupTitle(group, t)}
                      </h3>
                      <div className="mt-1">
                        {group.isSystem ? (
                          <span className="inline-flex rounded-full border border-amber-600/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">
                            {t("telegram.posts.groups.systemGroup")}
                          </span>
                        ) : (
                          <MemberBadge member={group.createdByMember} />
                        )}
                      </div>
                    </div>
                  </button>
                  <TelegramCardActionsMenu
                    label={t("telegram.posts.groups.actionsNamed", {
                      title: telegramPostGroupTitle(group, t),
                    })}
                  >
                    <TelegramCardMenuAction
                      label={t("telegram.posts.groups.open")}
                      icon={<ChevronRight size={17} />}
                      onClick={() => selectGroup(group.id)}
                    />
                    {!group.isSystem ? (
                      <>
                        <TelegramCardMenuAction
                          label={t("telegram.posts.groups.edit")}
                          icon={<Pencil size={17} />}
                          onClick={() => setGroupForm(group)}
                        />
                        <div className="my-1 border-t border-neutral-800" />
                        <TelegramCardMenuAction
                          label={t(
                            showArchivedGroups
                              ? "telegram.posts.groups.restore"
                              : "telegram.posts.groups.archive",
                          )}
                          icon={
                            showArchivedGroups ? (
                              <RotateCcw size={17} />
                            ) : (
                              <Archive size={17} />
                            )
                          }
                          onClick={async () => {
                            await telegramChannelsApi.updatePostGroup(
                              group.id,
                              { archived: !showArchivedGroups },
                            );
                            await queryClient.invalidateQueries({
                              queryKey: ["post-groups", channelId],
                            });
                          }}
                        />
                      </>
                    ) : null}
                  </TelegramCardActionsMenu>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectGroup(group.id)}
                className="mt-4 block w-full text-left"
              >
                <GroupSummary summary={group.statusSummary} />
              </button>
            </div>
          ))}
        </div>
      ) : !groupsLoading && !groups.isError ? (
        <EmptyState text={t("telegram.posts.groups.emptyAll")} />
      ) : null}
      {groups.data ? (
        <Pagination
          page={groups.data.pagination.page}
          pageSize={groups.data.pagination.pageSize}
          totalItems={groups.data.pagination.totalItems}
          totalPages={groups.data.pagination.totalPages}
          hasNextPage={groups.data.pagination.hasNextPage}
          hasPreviousPage={groups.data.pagination.hasPreviousPage}
          pageSizeOptions={THREE_COLUMN_GRID_PAGE_SIZES}
          onPageChange={groupsPagination.setPage}
          onPageSizeChange={groupsPagination.setPageSize}
          loading={groupsLoading}
        />
      ) : null}
      {groupForm ? (
        <GroupFormModal
          key={groupForm === "new" ? "new" : groupForm.id}
          value={groupForm}
          channelId={channelId}
          onClose={() => setGroupForm(null)}
          onSaved={async (saved) => {
            setGroupForm(null);
            await groups.refetch();
            selectGroup(saved.id);
          }}
        />
      ) : null}
    </>
  );
}
