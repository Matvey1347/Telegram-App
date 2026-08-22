import { Injectable } from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramInviteLinkCreatorMatchSource,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { attributeInviteLinkCreator } from '../../../telegram/shared/telegram-invite-link-attribution';
import {
  TelegramMtprotoClient,
  type TelegramInviteLinksResult,
} from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteCampaignService } from './telegram-invite-campaign.service';
import { TelegramInviteHistoryService } from './telegram-invite-history.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';
import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';

@Injectable()
export class TelegramInviteSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly telegramInviteAttributionService: TelegramInviteAttributionService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramInviteHistoryService: TelegramInviteHistoryService,
    private readonly telegramInvitePersistenceService: TelegramInvitePersistenceService,
    private readonly telegramInviteCampaignService: TelegramInviteCampaignService,
    private readonly telegramInviteSnapshotStore: TelegramInviteSnapshotStore,
  ) {}

  private readonly inviteLinkSyncExistingSelect = {
    id: true,
    name: true,
    createdBy: true,
    adCampaignId: true,
  } as const;

  public async persistInviteLinkFromRemote(params: {
    workspaceId: string;
    channelId: string;
    link: TelegramInviteLinksResult['links'][number];
    maps: Awaited<
      ReturnType<TelegramInviteAttributionService['buildInviteAttributionMaps']>
    >;
    processedCount: number;
    totalLinks: number;
    warnings: string[];
    onProgress?: BulkProgressCallback;
    progressStep: { current: number; total: number };
  }) {
    const attribution = attributeInviteLinkCreator(
      {
        creatorTelegramUserId: params.link.telegramCreatorUserId,
        creatorUsername: params.link.creatorUsername,
        creatorFirstName: params.link.creatorFirstName,
        creatorLastName: params.link.creatorLastName,
        creatorPhotoUrl: params.link.creatorPhotoUrl,
      },
      params.maps,
    );
    const existing = await this.prisma.telegramInviteLink.findUnique({
      where: {
        workspaceId_telegramChannelId_url: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          url: params.link.url,
        },
      },
      select: this.inviteLinkSyncExistingSelect,
    });
    const inferredCampaignId =
      await this.telegramInviteAttributionService.inferInviteLinkCampaignId({
        workspaceId: params.workspaceId,
        channelId: params.channelId,
        title: params.link.title,
        existingCampaignId: existing?.adCampaignId ?? null,
      });
    const payload = {
      name: params.link.title || existing?.name || 'Imported MTProto link',
      adCampaignId: existing?.adCampaignId ?? inferredCampaignId ?? null,
      telegramInviteLinkId: params.link.url,
      createdBy:
        existing?.createdBy ||
        [params.link.creatorFirstName, params.link.creatorLastName]
          .filter(Boolean)
          .join(' ') ||
        attribution.creatorUsername ||
        null,
      createsJoinRequest: params.link.requestNeeded,
      expireDate: params.link.expireDate,
      memberLimit: params.link.usageLimit,
      joinedCount: params.link.usage,
      requestedCount: params.link.requested,
      isRevoked: params.link.revoked,
      lastSyncedAt: new Date(),
      creatorTelegramUserId: params.link.telegramCreatorUserId,
      creatorUsername: attribution.creatorUsername,
      creatorFirstName: params.link.creatorFirstName,
      creatorLastName: params.link.creatorLastName,
      creatorPhotoUrl: params.link.creatorPhotoUrl,
      creatorMemberId: attribution.creatorMemberId,
      creatorMatchSource: attribution.creatorMatchSource,
    };

    const upserted =
      await this.telegramInvitePersistenceService.upsertInviteLinkWithRequestedCountFallback(
        {
          workspaceId: params.workspaceId,
          channelId: params.channelId,
          url: params.link.url,
          existingId: existing?.id,
          create: {
            workspaceId: params.workspaceId,
            telegramChannelId: params.channelId,
            url: params.link.url,
            ...payload,
          },
          update: payload,
        },
      );

    await this.telegramChannelsSupportService.notifyInviteLinksProgress(
      params.onProgress,
      params.progressStep.current,
      params.progressStep.total,
      {
        phase: 'saving_invite_links',
        message: `Saving invite links ${params.processedCount}/${params.totalLinks}`,
        stageCurrent: params.processedCount,
        stageTotal: params.totalLinks,
        warnings: params.warnings,
      },
    );

    return {
      existing,
      upserted,
      matchedMember: Boolean(attribution.creatorMemberId),
      unresolved:
        attribution.creatorMatchSource ===
        TelegramInviteLinkCreatorMatchSource.UNRESOLVED,
    };
  }

  public async finalizeInviteLinkSync(params: {
    workspaceId: string;
    channelId: string;
    account: {
      id: string;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked?: string | null;
    };
    remote: TelegramInviteLinksResult;
    importedCount: number;
    updatedCount: number;
    matchedMembersCount: number;
    unresolvedCreatorsCount: number;
    affectedCampaignIds: Set<string>;
    onProgress?: BulkProgressCallback;
    progressStep: { current: number; total: number };
  }) {
    const campaignIds = [...params.affectedCampaignIds];
    if (campaignIds.length) {
      await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
        params.onProgress,
        params.progressStep.current,
        params.progressStep.total,
        `Recalculating metrics for ${campaignIds.length} affected campaigns`,
      );
    }
    for (const [index, campaignId] of campaignIds.entries()) {
      await this.telegramInviteCampaignService.recalculateCampaignMetricsById(
        campaignId,
      );
      const processedCampaigns = index + 1;
      if (
        processedCampaigns === campaignIds.length ||
        processedCampaigns === 1 ||
        processedCampaigns % 10 === 0
      ) {
        await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
          params.onProgress,
          params.progressStep.current,
          params.progressStep.total,
          `Recalculated ${processedCampaigns}/${campaignIds.length} affected campaigns`,
        );
      }
    }

    const status =
      params.remote.scope === 'ALL_ADMINS'
        ? TelegramDataSourceStatus.SUCCESS
        : TelegramDataSourceStatus.PARTIAL;
    const fetchedTotalLinks = params.remote.links.length;
    const missingTotalLinks = Math.max(
      0,
      (params.remote.expectedTotalLinks ?? 0) - fetchedTotalLinks,
    );
    await this.sourceAccessService.recordDataSource({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      sourceId: params.account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.INVITE_LINKS,
      status,
      sourceDisplayName: this.telegramChannelAccessService.sourceDisplayName(
        params.account,
      ),
      metadata: {
        scope: params.remote.scope,
        adminsCount: params.remote.admins.length,
        expectedTotalLinks: params.remote.expectedTotalLinks,
        fetchedTotalLinks,
        missingTotalLinks,
        activeLinksCount: params.remote.links.filter((link) => !link.revoked)
          .length,
        revokedLinksCount: params.remote.links.filter((link) => link.revoked)
          .length,
        importedCount: params.importedCount,
        updatedCount: params.updatedCount,
        matchedMembersCount: params.matchedMembersCount,
        unresolvedCreatorsCount: params.unresolvedCreatorsCount,
        warnings: params.remote.warnings,
      },
    });

    return {
      imported: params.importedCount,
      updated: params.updatedCount,
      scope: params.remote.scope,
      expectedTotalLinks: params.remote.expectedTotalLinks,
      fetchedTotalLinks,
      missingTotalLinks,
      warnings: params.remote.warnings,
    };
  }

  public async syncChannelInviteLinks(params: {
    workspaceId: string;
    channelId: string;
    account: {
      id: string;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked?: string | null;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
    };
    channelReference: {
      username?: string | null;
      telegramChatId?: string | null;
      inviteLink?: string | null;
      telegramAccessHash?: string | null;
    };
    prefetchedRemote?: TelegramInviteLinksResult | null;
    onProgress?: BulkProgressCallback;
    progressStep?: { current: number; total: number };
  }) {
    const remote =
      params.prefetchedRemote ??
      (await this.mtprotoClient.getAllChannelInviteLinks({
        ...this.telegramChannelAccessService.accountCredentials(params.account),
        channel: params.channelReference,
      }));
    const progressStep = params.progressStep ?? { current: 2, total: 8 };
    const maps =
      await this.telegramInviteAttributionService.buildInviteAttributionMaps(
        params.workspaceId,
      );
    let importedCount = 0;
    let updatedCount = 0;
    let matchedMembersCount = 0;
    let unresolvedCreatorsCount = 0;
    const affectedCampaignIds = new Set<string>();
    const persistedLinks: Array<{
      id: string;
      telegramChannelId: string;
      adCampaignId: string | null;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean;
    }> = [];
    const syncedAt = new Date();
    const totalLinks = remote.links.length;

    await this.telegramChannelsSupportService.notifyInviteLinksProgress(
      params.onProgress,
      progressStep.current,
      progressStep.total,
      {
        phase: 'saving_invite_links',
        message:
          totalLinks > 0
            ? `Saving invite links 0/${totalLinks}`
            : 'Saving invite links',
        stageCurrent: 0,
        stageTotal: totalLinks,
        warnings: remote.warnings,
      },
    );

    for (const [index, link] of remote.links.entries()) {
      const persisted = await this.persistInviteLinkFromRemote({
        workspaceId: params.workspaceId,
        channelId: params.channelId,
        link,
        maps,
        processedCount: index + 1,
        totalLinks,
        warnings: remote.warnings,
        onProgress: params.onProgress,
        progressStep,
      });
      if (persisted.matchedMember) matchedMembersCount += 1;
      if (persisted.unresolved) unresolvedCreatorsCount += 1;
      if (persisted.existing) {
        updatedCount += 1;
        if (persisted.existing.adCampaignId) {
          affectedCampaignIds.add(persisted.existing.adCampaignId);
        }
      } else {
        importedCount += 1;
      }
      if (persisted.upserted.adCampaignId) {
        affectedCampaignIds.add(persisted.upserted.adCampaignId);
      }
      persistedLinks.push({
        id: persisted.upserted.id,
        telegramChannelId: persisted.upserted.telegramChannelId,
        adCampaignId: persisted.upserted.adCampaignId ?? null,
        joinedCount: persisted.upserted.joinedCount,
        requestedCount: persisted.upserted.requestedCount,
        isRevoked: persisted.upserted.isRevoked,
      });
    }

    await this.telegramInviteSnapshotStore.persistInviteLinkSnapshots({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      syncedAt,
      links: persistedLinks,
    });

    return this.finalizeInviteLinkSync({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      account: params.account,
      remote,
      importedCount,
      updatedCount,
      matchedMembersCount,
      unresolvedCreatorsCount,
      affectedCampaignIds,
      onProgress: params.onProgress,
      progressStep,
    });
  }
}
