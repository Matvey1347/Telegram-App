import { Injectable } from '@nestjs/common';
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelContentReadService } from './telegram-channel-content-read.service';
import { TelegramChannelDeepSyncService } from './telegram-channel-deep-sync.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelImportPolicyService } from './telegram-channel-import-policy.service';
import { TelegramChannelImportService } from './telegram-channel-import.service';
import { TelegramChannelInsightsService } from './telegram-channel-insights.service';
import { TelegramChannelLifecycleService } from './telegram-channel-lifecycle.service';
import { TelegramChannelReadModelsService } from './telegram-channel-read-models.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelSyncOrchestrator } from './telegram-channel-sync.orchestrator';
import { TelegramChannelWorkbookExportService } from './telegram-channel-workbook-export.service';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteCampaignService } from './telegram-invite-campaign.service';
import { TelegramManagedPostBulkService } from './telegram-managed-post-bulk.service';
import { TelegramManagedPostCalendarService } from './telegram-managed-post-calendar.service';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostDeletionService } from './telegram-managed-post-deletion.service';
import { TelegramManagedPostGroupBulkService } from './telegram-managed-post-group-bulk.service';
import { TelegramManagedPostHistoryService } from './telegram-managed-post-history.service';
import { TelegramManagedPostImportService } from './telegram-managed-post-import.service';
import { TelegramManagedPostLinksService } from './telegram-managed-post-links.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostQueryService } from './telegram-managed-post-query.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRemoteSyncService } from './telegram-managed-post-remote-sync.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';

@Injectable()
export class TelegramChannelsService {
  checkInlineButtonPublishingAccess: TelegramChannelAccessService['checkInlineButtonPublishingAccess'];
  ensureTelegramChannelImportPolicyColumnsAvailable: TelegramChannelSchemaCompatibilityService['ensureTelegramChannelImportPolicyColumnsAvailable'];
  resolveChannelImportPolicy: TelegramChannelImportPolicyService['resolveChannelImportPolicy'];
  reattributeWorkspaceInviteLinks: TelegramInviteAttributionService['reattributeWorkspaceInviteLinks'];
  findAll: TelegramChannelCatalogService['findAll'];
  selectOptions: TelegramChannelCatalogService['selectOptions'];
  findOne: TelegramChannelCatalogService['findOne'];
  channelSources: TelegramChannelCatalogService['channelSources'];
  publishingCapabilities: TelegramChannelCatalogService['publishingCapabilities'];
  analyticsSources: TelegramChannelCatalogService['analyticsSources'];
  create: TelegramChannelLifecycleService['create'];
  update: TelegramChannelLifecycleService['update'];
  remove: TelegramChannelLifecycleService['remove'];
  archive: TelegramChannelLifecycleService['archive'];
  restore: TelegramChannelLifecycleService['restore'];
  postGroups: TelegramPostGroupsService['postGroups'];
  postGroup: TelegramPostGroupsService['postGroup'];
  createPostGroup: TelegramPostGroupsService['createPostGroup'];
  importPostGroups: TelegramPostGroupsService['importPostGroups'];
  updatePostGroup: TelegramPostGroupsService['updatePostGroup'];
  deletePostGroup: TelegramPostGroupsService['deletePostGroup'];
  addPostsToGroup: TelegramPostGroupsService['addPostsToGroup'];
  removePostFromGroup: TelegramPostGroupsService['removePostFromGroup'];
  reorderPostGroup: TelegramPostGroupsService['reorderPostGroup'];
  managedPosts: TelegramManagedPostQueryService['managedPosts'];
  managedPost: TelegramManagedPostQueryService['managedPost'];
  managedPostsCalendar: TelegramManagedPostCalendarService['managedPostsCalendar'];
  setManagedPostTelegramUrl: TelegramManagedPostLinksService['setManagedPostTelegramUrl'];
  managedPostLinkTargets: TelegramManagedPostLinksService['managedPostLinkTargets'];
  reconcileDueManagedPosts: TelegramManagedPostReconciliationService['reconcileDueManagedPosts'];
  reconcileAllDueManagedPosts: TelegramManagedPostReconciliationService['reconcileAllDueManagedPosts'];
  verifyManagedPostTelegramId: TelegramManagedPostReconciliationService['verifyManagedPostTelegramId'];
  verifyManagedPostTelegramIds: TelegramManagedPostReconciliationService['verifyManagedPostTelegramIds'];
  scheduleManagedPostsBatch: TelegramManagedPostBulkService['scheduleManagedPostsBatch'];
  publishPostGroup: TelegramManagedPostGroupBulkService['publishPostGroup'];
  resetPostGroupToDrafts: TelegramManagedPostGroupBulkService['resetPostGroupToDrafts'];
  schedulePostGroupSequence: TelegramManagedPostGroupBulkService['schedulePostGroupSequence'];
  deleteManagedPostsBatch: TelegramManagedPostDeletionService['deleteManagedPostsBatch'];
  syncManagedPosts: TelegramManagedPostRemoteSyncService['syncManagedPosts'];
  reorderManagedPostSidebar: TelegramManagedPostCommandService['reorderManagedPostSidebar'];
  createManagedPost: TelegramManagedPostCommandService['createManagedPost'];
  importManagedPosts: TelegramManagedPostImportService['importManagedPosts'];
  managedPostHistory: TelegramManagedPostHistoryService['managedPostHistory'];
  restoreManagedPostRevision: TelegramManagedPostHistoryService['restoreManagedPostRevision'];
  updateManagedPost: TelegramManagedPostHistoryService['updateManagedPost'];
  returnManagedPostToDraft: TelegramManagedPostPublicationService['returnManagedPostToDraft'];
  publishManagedPostNow: TelegramManagedPostPublicationService['publishManagedPostNow'];
  scheduleManagedPost: TelegramManagedPostPublicationService['scheduleManagedPost'];
  moveManagedPost: TelegramManagedPostMoveService['moveManagedPost'];
  movePostGroup: TelegramManagedPostMoveService['movePostGroup'];
  deleteManagedPost: TelegramManagedPostMoveService['deleteManagedPost'];
  adAnalyses: TelegramChannelInsightsService['adAnalyses'];
  createAdAnalysis: TelegramChannelInsightsService['createAdAnalysis'];
  updateAdAnalysis: TelegramChannelInsightsService['updateAdAnalysis'];
  deleteAdAnalysis: TelegramChannelInsightsService['deleteAdAnalysis'];
  audience: TelegramChannelInsightsService['audience'];
  createAudienceSnapshot: TelegramChannelInsightsService['createAudienceSnapshot'];
  audienceSnapshots: TelegramChannelInsightsService['audienceSnapshots'];
  financialSummary: TelegramChannelInsightsService['financialSummary'];
  updatePostManualMetrics: TelegramChannelInsightsService['updatePostManualMetrics'];
  importChannel: TelegramChannelImportService['importChannel'];
  syncNow: TelegramChannelSyncOrchestrator['syncNow'];
  deepSync: TelegramChannelDeepSyncService['deepSync'];
  syncHistorical: TelegramChannelHistoricalSyncService['syncHistorical'];
  syncPostsMetrics: TelegramPostMetricsService['syncPostsMetrics'];
  syncPostsMetricsForWorkspace: TelegramPostMetricsService['syncPostsMetricsForWorkspace'];
  exportChannelWorkbook: TelegramChannelWorkbookExportService['exportChannelWorkbook'];
  syncBroadcastStats: TelegramBroadcastStatsService['syncBroadcastStats'];
  syncBroadcastStatsForWorkspace: TelegramBroadcastStatsService['syncBroadcastStatsForWorkspace'];
  channelStatsSnapshots: TelegramBroadcastStatsService['channelStatsSnapshots'];
  inviteLinks: TelegramChannelReadModelsService['inviteLinks'];
  inviteLinksForSelect: TelegramChannelReadModelsService['inviteLinksForSelect'];
  inviteLinkHistory: TelegramChannelReadModelsService['inviteLinkHistory'];
  promosByChannel: TelegramChannelContentReadService['promosByChannel'];
  posts: TelegramChannelContentReadService['posts'];
  publishedPostsForSelect: TelegramChannelContentReadService['publishedPostsForSelect'];
  analytics: TelegramChannelContentReadService['analytics'];
  attachInviteLinkCampaign: TelegramInviteCampaignService['attachInviteLinkCampaign'];
  detachInviteLinkCampaign: TelegramInviteCampaignService['detachInviteLinkCampaign'];
  recalculateCampaignMetricsById: TelegramInviteCampaignService['recalculateCampaignMetricsById'];

  constructor(
    access: TelegramChannelAccessService,
    schema: TelegramChannelSchemaCompatibilityService,
    policy: TelegramChannelImportPolicyService,
    attribution: TelegramInviteAttributionService,
    catalog: TelegramChannelCatalogService,
    lifecycle: TelegramChannelLifecycleService,
    groups: TelegramPostGroupsService,
    query: TelegramManagedPostQueryService,
    calendar: TelegramManagedPostCalendarService,
    links: TelegramManagedPostLinksService,
    reconciliation: TelegramManagedPostReconciliationService,
    bulk: TelegramManagedPostBulkService,
    groupBulk: TelegramManagedPostGroupBulkService,
    deletion: TelegramManagedPostDeletionService,
    remoteSync: TelegramManagedPostRemoteSyncService,
    commands: TelegramManagedPostCommandService,
    managedImport: TelegramManagedPostImportService,
    history: TelegramManagedPostHistoryService,
    publication: TelegramManagedPostPublicationService,
    moves: TelegramManagedPostMoveService,
    insights: TelegramChannelInsightsService,
    channelImport: TelegramChannelImportService,
    sync: TelegramChannelSyncOrchestrator,
    deepSync: TelegramChannelDeepSyncService,
    historical: TelegramChannelHistoricalSyncService,
    metrics: TelegramPostMetricsService,
    workbook: TelegramChannelWorkbookExportService,
    stats: TelegramBroadcastStatsService,
    reads: TelegramChannelReadModelsService,
    content: TelegramChannelContentReadService,
    campaign: TelegramInviteCampaignService,
  ) {
    this.checkInlineButtonPublishingAccess =
      access.checkInlineButtonPublishingAccess.bind(access);
    this.ensureTelegramChannelImportPolicyColumnsAvailable =
      schema.ensureTelegramChannelImportPolicyColumnsAvailable.bind(schema);
    this.resolveChannelImportPolicy =
      policy.resolveChannelImportPolicy.bind(policy);
    this.reattributeWorkspaceInviteLinks =
      attribution.reattributeWorkspaceInviteLinks.bind(attribution);
    this.findAll = catalog.findAll.bind(catalog);
    this.selectOptions = catalog.selectOptions.bind(catalog);
    this.findOne = catalog.findOne.bind(catalog);
    this.channelSources = catalog.channelSources.bind(catalog);
    this.publishingCapabilities = catalog.publishingCapabilities.bind(catalog);
    this.analyticsSources = catalog.analyticsSources.bind(catalog);
    this.create = lifecycle.create.bind(lifecycle);
    this.update = lifecycle.update.bind(lifecycle);
    this.remove = lifecycle.remove.bind(lifecycle);
    this.archive = lifecycle.archive.bind(lifecycle);
    this.restore = lifecycle.restore.bind(lifecycle);
    this.postGroups = groups.postGroups.bind(groups);
    this.postGroup = groups.postGroup.bind(groups);
    this.createPostGroup = groups.createPostGroup.bind(groups);
    this.importPostGroups = groups.importPostGroups.bind(groups);
    this.updatePostGroup = groups.updatePostGroup.bind(groups);
    this.deletePostGroup = groups.deletePostGroup.bind(groups);
    this.addPostsToGroup = groups.addPostsToGroup.bind(groups);
    this.removePostFromGroup = groups.removePostFromGroup.bind(groups);
    this.reorderPostGroup = groups.reorderPostGroup.bind(groups);
    this.managedPosts = query.managedPosts.bind(query);
    this.managedPost = query.managedPost.bind(query);
    this.managedPostsCalendar = calendar.managedPostsCalendar.bind(calendar);
    this.setManagedPostTelegramUrl =
      links.setManagedPostTelegramUrl.bind(links);
    this.managedPostLinkTargets = links.managedPostLinkTargets.bind(links);
    this.reconcileDueManagedPosts =
      reconciliation.reconcileDueManagedPosts.bind(reconciliation);
    this.reconcileAllDueManagedPosts =
      reconciliation.reconcileAllDueManagedPosts.bind(reconciliation);
    this.verifyManagedPostTelegramId =
      reconciliation.verifyManagedPostTelegramId.bind(reconciliation);
    this.verifyManagedPostTelegramIds =
      reconciliation.verifyManagedPostTelegramIds.bind(reconciliation);
    this.scheduleManagedPostsBatch = bulk.scheduleManagedPostsBatch.bind(bulk);
    this.publishPostGroup = groupBulk.publishPostGroup.bind(groupBulk);
    this.resetPostGroupToDrafts =
      groupBulk.resetPostGroupToDrafts.bind(groupBulk);
    this.schedulePostGroupSequence =
      groupBulk.schedulePostGroupSequence.bind(groupBulk);
    this.deleteManagedPostsBatch =
      deletion.deleteManagedPostsBatch.bind(deletion);
    this.syncManagedPosts = remoteSync.syncManagedPosts.bind(remoteSync);
    this.reorderManagedPostSidebar =
      commands.reorderManagedPostSidebar.bind(commands);
    this.createManagedPost = commands.createManagedPost.bind(commands);
    this.importManagedPosts =
      managedImport.importManagedPosts.bind(managedImport);
    this.managedPostHistory = history.managedPostHistory.bind(history);
    this.restoreManagedPostRevision =
      history.restoreManagedPostRevision.bind(history);
    this.updateManagedPost = history.updateManagedPost.bind(history);
    this.returnManagedPostToDraft =
      publication.returnManagedPostToDraft.bind(publication);
    this.publishManagedPostNow =
      publication.publishManagedPostNow.bind(publication);
    this.scheduleManagedPost =
      publication.scheduleManagedPost.bind(publication);
    this.moveManagedPost = moves.moveManagedPost.bind(moves);
    this.movePostGroup = moves.movePostGroup.bind(moves);
    this.deleteManagedPost = moves.deleteManagedPost.bind(moves);
    this.adAnalyses = insights.adAnalyses.bind(insights);
    this.createAdAnalysis = insights.createAdAnalysis.bind(insights);
    this.updateAdAnalysis = insights.updateAdAnalysis.bind(insights);
    this.deleteAdAnalysis = insights.deleteAdAnalysis.bind(insights);
    this.audience = insights.audience.bind(insights);
    this.createAudienceSnapshot =
      insights.createAudienceSnapshot.bind(insights);
    this.audienceSnapshots = insights.audienceSnapshots.bind(insights);
    this.financialSummary = insights.financialSummary.bind(insights);
    this.updatePostManualMetrics =
      insights.updatePostManualMetrics.bind(insights);
    this.importChannel = channelImport.importChannel.bind(channelImport);
    this.syncNow = sync.syncNow.bind(sync);
    this.deepSync = deepSync.deepSync.bind(deepSync);
    this.syncHistorical = historical.syncHistorical.bind(historical);
    this.syncPostsMetrics = metrics.syncPostsMetrics.bind(metrics);
    this.syncPostsMetricsForWorkspace =
      metrics.syncPostsMetricsForWorkspace.bind(metrics);
    this.exportChannelWorkbook = workbook.exportChannelWorkbook.bind(workbook);
    this.syncBroadcastStats = stats.syncBroadcastStats.bind(stats);
    this.syncBroadcastStatsForWorkspace =
      stats.syncBroadcastStatsForWorkspace.bind(stats);
    this.channelStatsSnapshots = stats.channelStatsSnapshots.bind(stats);
    this.inviteLinks = reads.inviteLinks.bind(reads);
    this.inviteLinksForSelect = reads.inviteLinksForSelect.bind(reads);
    this.inviteLinkHistory = reads.inviteLinkHistory.bind(reads);
    this.promosByChannel = content.promosByChannel.bind(content);
    this.posts = content.posts.bind(content);
    this.publishedPostsForSelect =
      content.publishedPostsForSelect.bind(content);
    this.analytics = content.analytics.bind(content);
    this.attachInviteLinkCampaign =
      campaign.attachInviteLinkCampaign.bind(campaign);
    this.detachInviteLinkCampaign =
      campaign.detachInviteLinkCampaign.bind(campaign);
    this.recalculateCampaignMetricsById =
      campaign.recalculateCampaignMetricsById.bind(campaign);
  }
}
