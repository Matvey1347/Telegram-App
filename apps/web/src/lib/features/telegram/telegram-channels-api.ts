import type { AxiosInstance, AxiosRequestConfig } from "axios";
import { createTelegramManagedPostsApi } from "./telegram-managed-posts-api";
import type {
  BulkActionResult,
  BulkActionResultItem,
  ManagedPostsSyncResult,
  PaginatedResponse,
  ResetChannelScheduledPostsResult,
  ScheduleManagedPostsBatchPayload,
  TelegramChannelSyncProgressItem,
  TelegramManagedPostCalendarResult,
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerFormat,
  TelegramPostPlannerPreviewResult,
  TelegramPostPlannerPreviewPayload,
  TelegramPostPlannerSlot,
  TelegramPublishingCapabilities,
  TelegramPostButtonRows,
  TelegramCustomEmojiPackSummary,
  TelegramChannelCustomEmojiPacksResponse,
  ImportTelegramCustomEmojiPackInput,
  TelegramCustomEmojiPackTarget,
  SyncOperationResult,
} from "@telegram-system/shared";
import type {
  ImportedTelegramSource,
  PaginationParams,
  PostGroup,
  TelegramAnalyticsSources,
  TelegramChannel,
  TelegramChannelListResponse,
  TelegramChannelAdAnalysis,
  TelegramChannelAdAnalysisPayload,
  TelegramChannelAudience,
  TelegramChannelAudienceSnapshot,
  TelegramChannelFinancialSummary,
  TelegramChannelImportPayload,
  TelegramChannelSelectOption,
  TelegramChannelSourceAccess,
  TelegramInviteLink,
  TelegramInviteLinkHistory,
  TelegramManagedPost,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostRevision,
  TelegramPost,
  TelegramPostAnalyticsItem,
  Promo,
  TelegramChannelAnalyticsResponse,
  TelegramChannelSyncNowPayload,
} from "../../api-types";
import type {
  BulkProgressHandler,
  StreamBatchItem,
  StreamBatchResult,
  StreamProgressHandler,
} from "./telegram-stream-types";

export type {
  BulkProgressHandler,
  StreamBatchItem,
  StreamBatchResult,
  StreamProgressHandler,
} from "./telegram-stream-types";

type PaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<T[]>;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createTelegramChannelsApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  streamBulkAction,
  streamProgressAction,
  silentFeedbackConfig,
  quietMutationConfig,
}: {
  api: AxiosInstance;
  crud: CrudFactory;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  streamBulkAction: (
    path: string,
    payload: unknown,
    onProgress: BulkProgressHandler,
  ) => Promise<BulkActionResult>;
  streamProgressAction: <TResult, TItem = BulkActionResultItem>(
    path: string,
    payload: unknown,
    onProgress: StreamProgressHandler<TItem>,
    options?: { signal?: AbortSignal },
  ) => Promise<TResult>;
  silentFeedbackConfig: AxiosRequestConfig;
  quietMutationConfig: AxiosRequestConfig;
}) {
  const telegramChannelsApi = {
    ...crud<TelegramChannel>("/telegram-channels"),
    select: async (params?: { canPostMessagesOnly?: boolean }) =>
      (
        await api.get<TelegramChannelSelectOption[]>(
          "/telegram-channels/select",
          { params },
        )
      ).data,
    listPage: async (params?: PaginationParams) =>
      getPaginated<TelegramChannel>("/telegram-channels", params),
    listWithCounts: async (archived = false, owned?: boolean) =>
      (
        await api.get<TelegramChannelListResponse>("/telegram-channels", {
          params: { archived, owned, page: 1, pageSize: 100 },
        })
      ).data,
    list: async () =>
      getAllPaginatedItems<TelegramChannel>("/telegram-channels"),
    archive: async (id: string) =>
      (await api.post<TelegramChannel>(`/telegram-channels/${id}/archive`))
        .data,
    restore: async (id: string) =>
      (await api.post<TelegramChannel>(`/telegram-channels/${id}/restore`))
        .data,
    customEmojiPacks: async (channelId: string) =>
      (
        await api.get<TelegramChannelCustomEmojiPacksResponse>(
          `/telegram-channels/${channelId}/custom-emoji-packs`,
        )
      ).data,
    importCustomEmojiPack: async (
      channelId: string,
      payload: ImportTelegramCustomEmojiPackInput,
    ) =>
      (
        await api.post<TelegramChannelCustomEmojiPacksResponse>(
          `/telegram-channels/${channelId}/custom-emoji-packs/import`,
          payload,
        )
      ).data,
    attachCustomEmojiPack: async (
      channelId: string,
      packId: string,
      target: TelegramCustomEmojiPackTarget,
    ) =>
      (
        await api.post<TelegramChannelCustomEmojiPacksResponse>(
          `/telegram-channels/${channelId}/custom-emoji-packs/${packId}/attach`,
          {
            scope: target.scope,
            ...(target.scope === "CHANNELS"
              ? { channelIds: target.channelIds }
              : {}),
          },
        )
      ).data,
    detachCustomEmojiPack: async (
      channelId: string,
      packId: string,
      target: TelegramCustomEmojiPackTarget,
    ) =>
      (
        await api.delete<TelegramChannelCustomEmojiPacksResponse>(
          `/telegram-channels/${channelId}/custom-emoji-packs/${packId}`,
          {
            data: {
              scope: target.scope,
              ...(target.scope === "CHANNELS"
                ? { channelIds: target.channelIds }
                : {}),
            },
          },
        )
      ).data,
    updateQuiet: async (id: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramChannel>(
          `/telegram-channels/${id}`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    import: async (payload: TelegramChannelImportPayload) =>
      (
        await api.post<ImportedTelegramSource>(
          "/telegram-channels/import",
          payload,
          quietMutationConfig,
        )
      ).data,
    importWithProgress: async (
      payload: TelegramChannelImportPayload,
      onProgress: StreamProgressHandler<{ message?: string }>,
    ) =>
      streamProgressAction<ImportedTelegramSource, { message?: string }>(
        "/telegram-channels/import-stream",
        payload,
        onProgress,
      ),
    export: async (id: string) =>
      (
        await api.get<Blob>(`/telegram-channels/${id}/export`, {
          responseType: "blob",
        })
      ).data,
    gptContext: async (id: string) =>
      (
        await api.get<Blob>(`/telegram-channels/${id}/gpt-context`, {
          responseType: "blob",
        })
      ).data,
    calendarPlanInstruction: async (id: string) =>
      (
        await api.get<Blob>(`/telegram-channels/${id}/gpt-context`, {
          params: { purpose: "calendar-plan" },
          responseType: "blob",
        })
      ).data,
    sources: async (id: string) =>
      (
        await api.get<TelegramChannelSourceAccess[]>(
          `/telegram-channels/${id}/sources`,
        )
      ).data,
    analyticsSources: async (id: string) =>
      (
        await api.get<TelegramAnalyticsSources>(
          `/telegram-channels/${id}/analytics-sources`,
        )
      ).data,
    audience: async (id: string) =>
      (
        await api.get<TelegramChannelAudience>(
          `/telegram-channels/${id}/audience`,
        )
      ).data,
    createAudienceSnapshot: async (id: string) =>
      (
        await api.post<TelegramChannelAudienceSnapshot>(
          `/telegram-channels/${id}/audience-snapshot`,
        )
      ).data,
    audienceSnapshots: async (id: string, limit?: number) =>
      (
        await api.get<TelegramChannelAudienceSnapshot[]>(
          `/telegram-channels/${id}/audience-snapshots`,
          { params: limit ? { limit } : undefined },
        )
      ).data,
    financialSummary: async (id: string) =>
      (
        await api.get<TelegramChannelFinancialSummary>(
          `/telegram-channels/${id}/financial-summary`,
        )
      ).data,
    ...createTelegramManagedPostsApi({
      api,
      silentFeedbackConfig,
      streamProgressAction,
    }),
    postGroupsPage: async (
      params?: PaginationParams & {
        telegramChannelId?: string;
        search?: string;
      },
    ) => getPaginated<PostGroup>("/telegram-channels/post-groups", params),
    postGroupSummaries: async (channelId: string) =>
      (
        await api.get<PostGroup[]>(
          `/telegram-channels/${channelId}/post-group-summaries`,
        )
      ).data,
    postGroup: async (groupId: string) =>
      (await api.get<PostGroup>(`/telegram-channels/post-groups/${groupId}`))
        .data,
    createPostGroup: async (
      payload: {
        telegramChannelId: string;
        title: string;
        description?: string | null;
        icon?: string | null;
        createdByMemberId?: string | null;
        statusNumberingEnabled?: boolean;
        postIds?: string[];
      },
      background = false,
    ) =>
      (
        await api.post<PostGroup>(
          "/telegram-channels/post-groups",
          payload,
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    importPostGroupsWithProgress: async (
      groups: Array<{
        telegramChannelId: string;
        title: string;
        description?: string | null;
        icon?: string | null;
        createdByMemberId?: string | null;
        statusNumberingEnabled?: boolean;
        postIds?: string[];
      }>,
      onProgress: StreamProgressHandler<StreamBatchItem>,
    ) =>
      streamProgressAction<StreamBatchResult, StreamBatchItem>(
        "/telegram-channels/post-groups/import-stream",
        { groups },
        onProgress,
      ),
    updatePostGroup: async (
      groupId: string,
      payload: {
        title?: string;
        description?: string | null;
        icon?: string | null;
        statusNumberingEnabled?: boolean;
      },
    ) =>
      (
        await api.patch<PostGroup>(
          `/telegram-channels/post-groups/${groupId}`,
          payload,
        )
      ).data,
    deletePostGroup: async (groupId: string) =>
      (await api.delete<PostGroup>(`/telegram-channels/post-groups/${groupId}`))
        .data,
    addPostsToGroup: async (
      groupId: string,
      postIds: string[],
      background = false,
    ) =>
      (
        await api.post<PostGroup>(
          `/telegram-channels/post-groups/${groupId}/posts`,
          { postIds },
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    removePostFromGroup: async (
      groupId: string,
      postId: string,
      background = false,
    ) =>
      (
        await api.delete<PostGroup>(
          `/telegram-channels/post-groups/${groupId}/posts/${postId}`,
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    reorderPostGroup: async (
      groupId: string,
      orderedPostIds: string[],
      background = false,
    ) =>
      (
        await api.post<PostGroup>(
          `/telegram-channels/post-groups/${groupId}/reorder`,
          { orderedPostIds },
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    movePostGroup: async (
      groupId: string,
      targetTelegramChannelId: string,
      background = false,
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/post-groups/${groupId}/move-channel-stream`,
            { targetTelegramChannelId },
            onProgress,
          )
        : (
            await api.post<BulkActionResult & { group: PostGroup }>(
              `/telegram-channels/post-groups/${groupId}/move-channel`,
              { targetTelegramChannelId },
              background ? silentFeedbackConfig : undefined,
            )
          ).data,
    publishPostGroup: async (
      groupId: string,
      payload: {
        includeScheduled?: boolean;
        includeFailed?: boolean;
        republishPublished?: boolean;
      } = {},
      background = false,
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/post-groups/${groupId}/publish-all-stream`,
            payload,
            onProgress,
          )
        : (
            await api.post<BulkActionResult>(
              `/telegram-channels/post-groups/${groupId}/publish-all`,
              payload,
              background ? silentFeedbackConfig : undefined,
            )
          ).data,
    resetPostGroupToDrafts: async (
      groupId: string,
      background = false,
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/post-groups/${groupId}/reset-drafts-stream`,
            {},
            onProgress,
          )
        : (
            await api.post<BulkActionResult>(
              `/telegram-channels/post-groups/${groupId}/reset-drafts`,
              {},
              background ? silentFeedbackConfig : undefined,
            )
          ).data,
    schedulePostGroupSequence: async (
      groupId: string,
      payload: {
        startDate: string;
        time: string;
        intervalDays: number;
        timezone?: string;
        includeDraftsOnly?: boolean;
        overwriteExistingScheduled?: boolean;
        includeFailed?: boolean;
      },
      background = false,
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/post-groups/${groupId}/schedule-sequence-stream`,
            payload,
            onProgress,
          )
        : (
            await api.post<BulkActionResult>(
              `/telegram-channels/post-groups/${groupId}/schedule-sequence`,
              payload,
              background ? silentFeedbackConfig : undefined,
            )
          ).data,
    publishManagedPost: async (
      channelId: string,
      postId: string,
      longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT",
      background = false,
    ) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/publish`,
          { longTextMode },
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    scheduleManagedPost: async (
      channelId: string,
      postId: string,
      scheduledAt: string,
      longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT",
      background = false,
    ) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/schedule`,
          { scheduledAt, longTextMode },
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    returnManagedPostToDraft: async (channelId: string, postId: string) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/return-to-draft`,
        )
      ).data,
    resetChannelScheduledPostsToDrafts: async (channelId: string) =>
      (
        await api.post<ResetChannelScheduledPostsResult>(
          `/telegram-channels/${channelId}/managed-posts/reset-scheduled-to-drafts`,
        )
      ).data,
    scheduleManagedPostsBatch: async (
      channelId: string,
      payload: ScheduleManagedPostsBatchPayload,
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/${channelId}/managed-posts/schedule-batch-stream`,
            payload,
            onProgress,
          )
        : (
            await api.post<BulkActionResult>(
              `/telegram-channels/${channelId}/managed-posts/schedule-batch`,
              payload,
            )
          ).data,
    deleteManagedPost: async (channelId: string, postId: string) =>
      (
        await api.delete<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}`,
        )
      ).data,
    deleteManagedPosts: async (
      channelId: string,
      postIds: string[],
      onProgress?: BulkProgressHandler,
    ) =>
      onProgress
        ? streamBulkAction(
            `/telegram-channels/${channelId}/managed-posts/delete-batch-stream`,
            { postIds },
            onProgress,
          )
        : (
            await api.post<BulkActionResult>(
              `/telegram-channels/${channelId}/managed-posts/delete-batch`,
              { postIds },
              silentFeedbackConfig,
            )
          ).data,
    adAnalyses: async (channelId: string) =>
      (
        await api.get<TelegramChannelAdAnalysis[]>(
          `/telegram-channels/${channelId}/ad-analyses`,
        )
      ).data,
    createAdAnalysis: async (
      channelId: string,
      payload: TelegramChannelAdAnalysisPayload,
    ) =>
      (
        await api.post<TelegramChannelAdAnalysis>(
          `/telegram-channels/${channelId}/ad-analyses`,
          payload,
        )
      ).data,
    updateAdAnalysis: async (
      channelId: string,
      analysisId: string,
      payload: Partial<TelegramChannelAdAnalysisPayload>,
    ) =>
      (
        await api.patch<TelegramChannelAdAnalysis>(
          `/telegram-channels/${channelId}/ad-analyses/${analysisId}`,
          payload,
        )
      ).data,
    deleteAdAnalysis: async (channelId: string, analysisId: string) =>
      (
        await api.delete<TelegramChannelAdAnalysis>(
          `/telegram-channels/${channelId}/ad-analyses/${analysisId}`,
        )
      ).data,
    updatePostManualMetrics: async (
      channelId: string,
      postId: string,
      payload: {
        manualOwnViews?: number;
        manualOwnReactions?: number;
        excludeFromAnalytics?: boolean;
      },
    ) =>
      (
        await api.patch<TelegramPost>(
          `/telegram-channels/${channelId}/posts/${postId}/manual-metrics`,
          payload,
        )
      ).data,
  };
  return telegramChannelsApi;
}
