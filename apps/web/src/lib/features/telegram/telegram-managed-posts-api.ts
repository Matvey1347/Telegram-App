import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  BulkActionResult,
  BulkActionResultItem,
  ManagedPostsSyncResult,
  PaginatedResponse,
  TelegramManagedPostCalendarResult,
  TelegramManagedPostLookupRequest,
  TelegramManagedPostLookupResponse,
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerFormat,
  TelegramPostPlannerPreviewPayload,
  TelegramPostPlannerPreviewResult,
  TelegramPostPlannerSlot,
  TelegramPublishingCapabilities,
  TelegramPostButtonRows,
} from "@telegram-system/shared";
export type { TelegramManagedPostLookupItem } from "@telegram-system/shared";
import type {
  PaginationParams,
  TelegramManagedPost,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostRevision,
} from "../../api-types";
import type {
  BulkProgressHandler,
  StreamBatchItem,
  StreamBatchResult,
  StreamProgressHandler,
} from "./telegram-stream-types";

export function createTelegramManagedPostsApi({
  api,
  silentFeedbackConfig,
  streamProgressAction,
}: {
  api: AxiosInstance;
  silentFeedbackConfig: AxiosRequestConfig;
  streamProgressAction: <TResult, TItem = BulkActionResultItem>(
    path: string,
    payload: unknown,
    onProgress: StreamProgressHandler<TItem>,
    options?: { signal?: AbortSignal },
  ) => Promise<TResult>;
}) {
  return {
    managedPostsPage: async (
      channelId: string,
      params?: PaginationParams & { status?: string; search?: string },
    ) =>
      (
        await api.get<PaginatedResponse<TelegramManagedPost>>(
          `/telegram-channels/${channelId}/managed-posts`,
          { params },
        )
      ).data,
    lookupManagedPosts: async (channelId: string, ids: string[]) =>
      (
        await api.post<
          TelegramManagedPostLookupResponse,
          { data: TelegramManagedPostLookupResponse },
          TelegramManagedPostLookupRequest
        >(`/telegram-channels/${channelId}/managed-posts/lookup`, { ids })
      ).data,
    managedPost: async (channelId: string, postId: string) =>
      (
        await api.get<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}`,
        )
      ).data,
    publishingCapabilities: async (channelId: string) =>
      (
        await api.get<TelegramPublishingCapabilities>(
          `/telegram-channels/${channelId}/publishing-capabilities`,
        )
      ).data,
    checkInlineButtonPublishingAccess: async (channelId: string) =>
      (
        await api.post<TelegramPublishingCapabilities>(
          `/telegram-channels/${channelId}/inline-buttons-access/check`,
        )
      ).data,
    managedPostsCalendar: async (
      channelId: string,
      params: { from: string; to: string },
    ) =>
      (
        await api.get<TelegramManagedPostCalendarResult>(
          `/telegram-channels/${channelId}/managed-posts/calendar`,
          { params },
        )
      ).data,
    postPlannerFormats: async (channelId: string) =>
      (
        await api.get<TelegramPostPlannerFormat[]>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats`,
        )
      ).data,
    createPostPlannerFormat: async (
      channelId: string,
      payload: {
        name: string;
        description?: string | null;
        icon?: string | null;
        position?: number;
        isActive?: boolean;
      },
    ) =>
      (
        await api.post<TelegramPostPlannerFormat>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    updatePostPlannerFormat: async (
      channelId: string,
      formatId: string,
      payload: {
        name?: string;
        description?: string | null;
        icon?: string | null;
        position?: number;
        isActive?: boolean;
      },
    ) =>
      (
        await api.patch<TelegramPostPlannerFormat>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats/${formatId}`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    deletePostPlannerFormat: async (channelId: string, formatId: string) =>
      (
        await api.delete<TelegramPostPlannerFormat>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats/${formatId}`,
          silentFeedbackConfig,
        )
      ).data,
    postPlannerSlots: async (channelId: string) =>
      (
        await api.get<TelegramPostPlannerSlot[]>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots`,
        )
      ).data,
    createPostPlannerSlot: async (
      channelId: string,
      payload: {
        formatId?: string | null;
        postGroupIds?: string[];
        weekday: number;
        time: string;
        timezone?: string;
        position?: number;
        isActive?: boolean;
      },
    ) =>
      (
        await api.post<TelegramPostPlannerSlot>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    updatePostPlannerSlot: async (
      channelId: string,
      slotId: string,
      payload: {
        formatId?: string | null;
        postGroupIds?: string[];
        weekday?: number;
        time?: string;
        timezone?: string;
        position?: number;
        isActive?: boolean;
      },
    ) =>
      (
        await api.patch<TelegramPostPlannerSlot>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/${slotId}`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    deletePostPlannerSlot: async (channelId: string, slotId: string) =>
      (
        await api.delete<TelegramPostPlannerSlot>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/${slotId}`,
          silentFeedbackConfig,
        )
      ).data,
    mutatePostPlannerSlotsWithProgress: async (
      channelId: string,
      items: Array<{
        action: "CREATE" | "UPDATE" | "DELETE";
        slotId?: string;
        data?: Record<string, unknown>;
      }>,
      onProgress: StreamProgressHandler<StreamBatchItem>,
    ) =>
      streamProgressAction<StreamBatchResult, StreamBatchItem>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/batch-stream`,
        { items },
        onProgress,
      ),
    previewPostPlanner: async (
      channelId: string,
      payload: TelegramPostPlannerPreviewPayload,
    ) =>
      (
        await api.post<TelegramPostPlannerPreviewResult>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/preview`,
          payload,
          silentFeedbackConfig,
        )
      ).data,
    applyPostPlanner: async (
      channelId: string,
      payload: {
        from: string;
        to: string;
        timezone?: string;
        postGroupIds?: string[];
        formatIds?: string[];
        formatWeights?: Record<string, number>;
        limit?: number;
        rerollOffset?: number;
      },
    ) =>
      (
        await api.post<TelegramPostPlannerApplyResult>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/apply`,
          payload,
        )
      ).data,
    rerollPostPlannerDay: async (
      channelId: string,
      payload: {
        date: string;
        timezone?: string;
        postGroupIds?: string[];
        formatIds?: string[];
        formatWeights?: Record<string, number>;
        limit?: number;
        rerollOffset?: number;
      },
    ) =>
      (
        await api.post<TelegramPostPlannerApplyResult>(
          `/telegram-channels/${channelId}/managed-posts/calendar-planner/reroll-day`,
          payload,
        )
      ).data,
    syncManagedPosts: async (channelId: string) =>
      (
        await api.post<ManagedPostsSyncResult>(
          `/telegram-channels/${channelId}/managed-posts/sync`,
        )
      ).data,
    syncManagedPostsWithProgress: async (
      channelId: string,
      onProgress: BulkProgressHandler,
    ) =>
      streamProgressAction<ManagedPostsSyncResult, BulkActionResultItem>(
        `/telegram-channels/${channelId}/managed-posts/sync-stream`,
        {},
        onProgress,
      ),
    setManagedPostTelegramUrl: async (
      channelId: string,
      postId: string,
      telegramUrl: string,
    ) =>
      (
        await api.patch<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/telegram-url`,
          { telegramUrl },
        )
      ).data,
    verifyManagedPostTelegramId: async (channelId: string, postId: string) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/verify-telegram-id`,
        )
      ).data,
    verifyManagedPostTelegramIds: async (channelId: string) =>
      (
        await api.post<
          import("@telegram-system/shared").TelegramManagedPostVerificationResult
        >(`/telegram-channels/${channelId}/managed-posts/verify-telegram-ids`)
      ).data,
    managedPostHistory: async (channelId: string, postId: string) =>
      (
        await api.get<TelegramManagedPostRevision[]>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/history`,
        )
      ).data,
    restoreManagedPostHistory: async (
      channelId: string,
      postId: string,
      revisionId: string,
    ) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/history/${revisionId}/restore`,
        )
      ).data,
    managedPostLinkTargets: async (
      channelId: string,
      params?: {
        search?: string;
        groupId?: string;
        excludePostId?: string;
        usage?: "edit" | "publishNow" | "schedule";
        scheduledAt?: string;
        limit?: number;
      },
    ) =>
      (
        await api.get<TelegramManagedPostLinkTarget[]>(
          `/telegram-channels/${channelId}/managed-posts/link-targets`,
          { params },
        )
      ).data,
    reorderManagedPostSidebar: async (
      channelId: string,
      orderedItems: string[],
      background = false,
    ) =>
      (
        await api.post<{ success: true }>(
          `/telegram-channels/${channelId}/managed-posts/reorder-sidebar`,
          { orderedItems },
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    createManagedPost: async (
      channelId: string,
      payload: {
        title: string;
        text?: string;
        imageUrls?: string[];
        buttonRows?: TelegramPostButtonRows;
        assignedMemberId?: string;
        icon?: string | null;
      },
      background = false,
    ) =>
      (
        await api.post<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts`,
          payload,
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    importManagedPosts: async (
      channelId: string,
      payload: TelegramManagedPostsImportPayload,
    ) =>
      (
        await api.post<TelegramManagedPostsImportResult>(
          `/telegram-channels/${channelId}/managed-posts/import`,
          payload,
        )
      ).data,
    importManagedPostsWithProgress: async (
      channelId: string,
      payload: TelegramManagedPostsImportPayload,
      onProgress: StreamProgressHandler<TelegramManagedPostsImportProgressItem>,
      options?: { signal?: AbortSignal },
    ) =>
      streamProgressAction<
        TelegramManagedPostsImportResult,
        TelegramManagedPostsImportProgressItem
      >(
        `/telegram-channels/${channelId}/managed-posts/import-stream`,
        payload,
        onProgress,
        options,
      ),
    updateManagedPost: async (
      channelId: string,
      postId: string,
      payload: {
        title?: string;
        text?: string | null;
        imageUrls?: string[];
        buttonRows?: TelegramPostButtonRows;
        assignedMemberId?: string;
        icon?: string | null;
        inPlaceOnly?: boolean;
      },
      background = false,
    ) =>
      (
        await api.patch<TelegramManagedPost>(
          `/telegram-channels/${channelId}/managed-posts/${postId}`,
          payload,
          background ? silentFeedbackConfig : undefined,
        )
      ).data,
    moveManagedPost: async (
      channelId: string,
      postId: string,
      targetTelegramChannelId: string,
    ) =>
      (
        await api.post<BulkActionResult & { post: TelegramManagedPost }>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/move-channel`,
          { targetTelegramChannelId },
        )
      ).data,
  };
}
