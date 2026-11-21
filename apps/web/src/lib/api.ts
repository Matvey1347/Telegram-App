import { api, silentFeedbackConfig, withFeedback } from "./http/api-client";
import { streamBulkAction, streamProgressAction } from "./http/api-progress";
export {
  API_MUTATION_EVENT,
  api,
  getLastCorrelationId,
  isApiNetworkError,
  withFreshApiReads,
} from "./http/api-client";
export type {
  ApiFeedbackConfig,
  ApiFeedbackMode,
  ApiMutationEventDetail,
  StructuredApiErrorPayload,
} from "./http/api-client";
export { streamProgressAction } from "./http/api-progress";
export type {
  BulkProgressHandler,
  StreamProgressHandler,
  StreamRequestOptions,
} from "./http/api-progress";

export type { SyncOperationResult } from "@telegram-system/shared";
import { createApplicationLogsApi } from "./features/operations/application-logs-api";
import { createDashboardApi } from "./features/dashboard/dashboard-api";
import { createTrashApi } from "./features/operations/trash-api";
import { createFinanceApi } from "./features/finance/finance-api";
import { createTelegramChannelHelpers } from "./features/telegram/telegram-channel-helpers-api";
import { createTelegramChannelsApi } from "./features/telegram/telegram-channels-api";
import { createTelegramPublicationSchedulesApi } from "./features/telegram/telegram-publication-schedules-api";
import { createTelegramContentHypothesesApi } from "./features/telegram/telegram-content-hypotheses-api";
import { createMarketingApi } from "./features/growth/marketing-api";
import { createTelegramSourcesApi } from "./features/telegram/telegram-sources-api";
import { createTelegramAdSalesApi } from "./features/growth/telegram-ad-sales-api";
import { createScheduledTasksApi } from "./features/operations/scheduled-tasks-api";
import { createWorkspaceApi } from "./features/workspace/workspace-api";
import { createTelegramSystemBotApi } from "./features/telegram/telegram-system-bot-api";
export type { TelegramAdCrmAdvertiserListItem } from "@telegram-system/shared";
export type {
  ScheduledTaskListResponse,
  ScheduledTaskRunSummary,
  ScheduledTaskSchedule,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from "@telegram-system/shared";
import type { PaginatedResponse } from "./api-types";
export type {
  TelegramChannelAccessMode,
  StructuredApiError,
  BulkActionResultItem,
  BulkActionResult,
  AccountMe,
  Account,
  AccountTransactionStats,
  AdCampaign,
  AdCampaignAdmissionAnalyticsHistory,
  AdCampaignAdmissionLatestBatch,
  AdCampaignAdmissionViewAnalytics,
  AdCampaignAdmissionViewPoint,
  AdCampaignAnalyticsFields,
  AdCampaignAnalyticsInput,
  AdCampaignAnalyticsSummary,
  AdCampaignHypothesisLink,
  AdCampaignInviteLinkHistory,
  AdCampaignInviteLinkRefreshProgress,
  AdCampaignInviteLinkRefreshResult,
  AdCampaignKpiStatus,
  AdCampaignPerformanceSummary,
  AdHypothesis,
  AdHypothesisCampaign,
  AdHypothesisCampaignSummary,
  AdHypothesisDetail,
  AdHypothesisInviteLinkHistory,
  AdHypothesisKpiStatus,
  AdHypothesisStatus,
  AdHypothesisSummary,
  AdmissionAnalyticsBaselineMethod,
  AdmissionAnalyticsDataQuality,
  AdmissionAnalyticsDetectionMode,
  AdvertisingChannel,
  ApiErrorPayload,
  AssignedMember,
  AuthResponse,
  CreateAdHypothesisPayload,
  CreateTelegramChannelNetworkPayload,
  Currency,
  CurrencyDisplayMode,
  DailyAnalyticsSyncRun,
  DashboardSummary,
  EntityAssignment,
  GlobalSearchResult,
  Icon,
  IconType,
  ImportedTelegramSource,
  InviteLinkHistoryPoint,
  InviteLinkHistorySummary,
  MeResponse,
  PaginatedResponse,
  PaginationMeta,
  PaginationParams,
  PostGroup,
  PostGroupStatusSummary,
  Promo,
  ResolvedEmoji,
  TelegramAccountChannelImportItem,
  TelegramAnalyticsSources,
  TelegramBot,
  TelegramChannel,
  TelegramChannelAdAnalysis,
  TelegramChannelAdAnalysisPayload,
  TelegramChannelAdAnalysisStatus,
  TelegramChannelAdminLink,
  TelegramChannelAnalyticsResponse,
  TelegramChannelAnalyticsSummary,
  TelegramChannelAudience,
  TelegramChannelAudienceSnapshot,
  TelegramChannelDataType,
  TelegramChannelFinancialSummary,
  TelegramChannelImportPayload,
  TelegramChannelNetwork,
  TelegramChannelNetworkOption,
  TelegramChannelNetworkChannelSummary,
  TelegramChannelNetworkDetail,
  TelegramChannelNetworkKpiStatus,
  TelegramChannelNetworkMember,
  TelegramChannelNetworkSummary,
  TelegramChannelSelectOption,
  TelegramChannelSourceAccess,
  TelegramChannelSourceRole,
  TelegramChannelSyncNowPayload,
  TelegramChannelSyncSelection,
  TelegramChannelTimePost,
  TelegramInviteLink,
  TelegramInviteLinkOption,
  TelegramInviteLinkHistory,
  TelegramManagedPost,
  TelegramManagedPostGroupSummary,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostsImportRow,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostsImportResultRow,
  TelegramManagedPostRevision,
  TelegramManagedPostStatus,
  TelegramPost,
  TelegramPostAnalyticsItem,
  TelegramSourceChannelAccess,
  TelegramSourcePermissions,
  TelegramSourceType,
  TelegramSyncResult,
  TelegramSyncedDialogChannel,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
  Transaction,
  TransactionCategory,
  TransactionType,
  Transfer,
  UpdateAdHypothesisPayload,
  UpdateTelegramChannelNetworkPayload,
  User,
  MemberSummary,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceMemberSelectOption,
  WorkspaceRole,
} from "./api-types";

export const applicationLogsApi = createApplicationLogsApi(
  api,
  silentFeedbackConfig,
);

async function getPaginated<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<PaginatedResponse<T>> {
  return (await api.get<PaginatedResponse<T>>(path, { params })).data;
}

function hasExplicitPagination(params?: Record<string, unknown>) {
  return params?.page != null || params?.pageSize != null;
}

async function getAllPaginatedItems<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const firstPage = await getPaginated<T>(path, params);
  if (!firstPage.pagination.hasNextPage) {
    return firstPage.items;
  }

  const items = [...firstPage.items];
  for (
    let page = firstPage.pagination.page + 1;
    page <= firstPage.pagination.totalPages;
    page += 1
  ) {
    const nextPage = await getPaginated<T>(path, {
      ...params,
      page,
      pageSize: firstPage.pagination.pageSize,
    });
    items.push(...nextPage.items);
  }
  return items;
}

const crud = <T>(path: string) => ({
  list: async () => (await api.get<T[]>(path)).data,
  get: async (id: string) => (await api.get<T>(`${path}/${id}`)).data,
  create: async (payload: Record<string, unknown>) =>
    (await api.post<T>(path, payload)).data,
  update: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<T>(`${path}/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<T>(`${path}/${id}`)).data,
});

const quietMutationConfig = silentFeedbackConfig;

const quietCrud = <T>(path: string) => ({
  list: async () => (await api.get<T[]>(path)).data,
  get: async (id: string) => (await api.get<T>(`${path}/${id}`)).data,
  create: async (payload: Record<string, unknown>) =>
    (await api.post<T>(path, payload, quietMutationConfig)).data,
  update: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<T>(`${path}/${id}`, payload, quietMutationConfig)).data,
  remove: async (id: string) =>
    (await api.delete<T>(`${path}/${id}`, quietMutationConfig)).data,
});
const workspaceApi = createWorkspaceApi({
  api,
  crud,
  silentFeedbackConfig,
  withFeedback,
});

export const {
  accountApi,
  authApi,
  globalSearchApi,
  iconsApi,
  workspaceMembersApi,
  memberFinanceApi,
  workspacesApi,
} = workspaceApi;

export const telegramSystemBotApi = createTelegramSystemBotApi(api);
const financeApi = createFinanceApi({
  api,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  quietCrud,
  quietMutationConfig,
});

export const {
  accountsApi,
  transactionsApi,
  transactionCategoriesApi,
  transfersApi,
  currenciesApi,
} = financeApi;

export type {
  CurrencySettings,
  ExchangeRate,
  TransactionQuery,
  TransferQuery,
} from "./features/finance/finance-api";

export const telegramChannelsApi = createTelegramChannelsApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  streamBulkAction,
  streamProgressAction,
  silentFeedbackConfig,
  quietMutationConfig,
});
export const telegramPublicationSchedulesApi =
  createTelegramPublicationSchedulesApi(api, silentFeedbackConfig);
export const telegramContentHypothesesApi =
  createTelegramContentHypothesesApi(api);
const telegramSourcesApi = createTelegramSourcesApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  streamProgressAction,
});

export const {
  telegramChannelNetworksApi,
  telegramUserAccountsApi,
  telegramBotsApi,
} = telegramSourcesApi;

const marketingApi = createMarketingApi({
  api,
  crud,
  quietCrud,
  getPaginated,
  quietMutationConfig,
  streamProgressAction,
});

export const {
  promosApi,
  advertisingChannelsApi,
  adCampaignsApi,
  telegramSyncApi,
  adHypothesesApi,
} = marketingApi;

const telegramChannelHelpers = createTelegramChannelHelpers({
  api,
  getPaginated,
  streamProgressAction,
  silentFeedbackConfig,
});

export const {
  syncTelegramChannelNow,
  syncTelegramChannelNowWithProgress,
  syncTelegramChannelHistorical,
  syncTelegramChannelDeep,
  syncTelegramChannelPostMetrics,
  getTelegramChannelAnalytics,
  getTelegramChannelPosts,
  getAllTelegramChannelPosts,
  getTelegramChannelInviteLinks,
  getTelegramChannelInviteLinksForSelect,
  getTelegramChannelInitialInviteLink,
  getAllTelegramChannelInviteLinks,
  getTelegramChannelInviteLinkHistory,
  getTelegramChannelPromos,
} = telegramChannelHelpers;

export const telegramAdSalesApi = createTelegramAdSalesApi({
  api,
  getPaginated,
  silentFeedbackConfig,
  streamProgressAction,
});

export const scheduledTasksApi = createScheduledTasksApi(api);

export type { TrashItem } from "./features/operations/trash-api";
export const trashApi = createTrashApi(api);

export const getDashboardSummary = createDashboardApi(api).getSummary;
