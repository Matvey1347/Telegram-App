import { Injectable } from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramInviteLinkCreatorMatchSource,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { attributeInviteLinkCreator } from '@api/telegram/shared/invites/telegram-invite-link-attribution';
import {
  TelegramMtprotoClient,
  type TelegramInviteLinksResult,
} from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
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
    peakAttributedCount: true,
    joinedCount: true,
    requestedCount: true,
    creatorTelegramUserId: true,
    joinedObservedAt: true,
    requestedObservedAt: true,
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
    const joinedCount = params.link.usageObserved === false ? existing?.joinedCount : params.link.usage;
    const requestedCount = params.link.requestedObserved === false ? existing?.requestedCount : params.link.requested;
    const joinedObserved = params.link.usageObserved !== false;
    const requestedObserved = params.link.requestedObserved !== false;
    const countersConfirmed = joinedObserved && requestedObserved;
    const observedAt = new Date();
    const currentAttributedCount = (joinedCount ?? 0) + (requestedCount ?? 0);
    const preserveCreator = existing?.creatorTelegramUserId === params.link.telegramCreatorUserId &&
      !params.link.creatorUsername && !params.link.creatorFirstName && !params.link.creatorLastName && !params.link.creatorPhotoUrl;
    const payload = {
      name: params.link.title || existing?.name || 'Imported MTProto link',
      // A link can be used by a promo, mutual promotion, or campaign and a
      // title/date is not a reliable signal. Campaign ownership is assigned
      // only by the explicit campaign form, never while importing from
      // Telegram.
      adCampaignId: existing?.adCampaignId ?? null,
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
      joinedCount,
      requestedCount,
      peakAttributedCount: Math.max(
        Number(existing?.peakAttributedCount ?? 0),
        currentAttributedCount,
      ),
      isRevoked: params.link.revoked,
      lastSyncedAt: countersConfirmed ? observedAt : undefined,
      joinedObserved,
      requestedObserved,
      joinedObservedAt: joinedObserved ? observedAt : undefined,
      requestedObservedAt: requestedObserved ? observedAt : undefined,
      creatorTelegramUserId: params.link.telegramCreatorUserId,
      creatorUsername: attribution.creatorUsername,
      creatorFirstName: params.link.creatorFirstName,
      creatorLastName: params.link.creatorLastName,
      creatorPhotoUrl: params.link.creatorPhotoUrl,
      creatorMemberId: attribution.creatorMemberId,
      creatorMatchSource: attribution.creatorMatchSource,
      telegramCreatedAt: params.link.createdAt,
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
          update: {
            ...payload,
            ...(preserveCreator ? {
              creatorUsername: undefined, creatorFirstName: undefined,
              creatorLastName: undefined, creatorPhotoUrl: undefined,
              creatorMemberId: undefined, creatorMatchSource: undefined,
            } : {}),
            ...(params.link.usageObserved === false ? { joinedCount: undefined } : {}),
            ...(params.link.requestedObserved === false ? { requestedCount: undefined } : {}),
          },
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

    if (existing?.adCampaignId && existing.joinedObservedAt && existing.requestedObservedAt &&
      countersConfirmed && params.link.requestNeeded && !params.link.revoked &&
      params.link.usage > existing.joinedCount && params.link.requested < existing.requestedCount) {
      await this.prisma.adCampaign.updateMany({
        where: {
          id: existing.adCampaignId, workspaceId: params.workspaceId, telegramChannelId: params.channelId,
          endedAt: null,
          OR: [{ placementDate: { lte: observedAt } }, { placementDate: null, createdAt: { lte: observedAt } }],
          botInviteLinks: { some: {} },
          inviteLinks: { some: { id: existing.id } },
        },
        data: { endedAt: observedAt },
      });
    }

    return {
      existing,
      upserted,
      observedAt,
      joinedObservation: joinedObserved ? params.link.usage : null,
      requestedObservation: requestedObserved ? params.link.requested : null,
      matchedMember: Boolean(attribution.creatorMemberId),
      unresolved:
        attribution.creatorMatchSource ===
        TelegramInviteLinkCreatorMatchSource.UNRESOLVED,
    };
  }

  async recordSingleInviteObservation(
    workspaceId: string,
    channelId: string,
    observation: Awaited<ReturnType<TelegramInviteSyncService['persistInviteLinkFromRemote']>>,
  ) {
    if (observation.joinedObservation == null && observation.requestedObservation == null) return;
    const link = observation.upserted;
    await this.telegramInviteSnapshotStore.persistInviteLinkSnapshots({
      workspaceId, channelId, syncedAt: observation.observedAt,
      links: [{ id: link.id, telegramChannelId: channelId, adCampaignId: link.adCampaignId,
        joinedCount: observation.joinedObservation, requestedCount: observation.requestedObservation, isRevoked: link.isRevoked }],
    });
  }

  public async finalizeInviteLinkSync(params: {
    workspaceId: string;
    channelId: string;
    account: Parameters<TelegramInviteSyncService['syncChannelInviteLinks']>[0]['account'];
    channelReference?: Parameters<TelegramInviteSyncService['syncChannelInviteLinks']>[0]['channelReference'];
    remote: TelegramInviteLinksResult;
    importedCount: number;
    updatedCount: number;
    matchedMembersCount: number;
    unresolvedCreatorsCount: number;
    affectedCampaignIds: Set<string>;
    onProgress?: BulkProgressCallback;
    progressStep: { current: number; total: number };
  }) {
    if (params.channelReference) await this.refreshMissingCampaignLinks({ ...params, channelReference: params.channelReference });
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
      params.remote.scope === 'ALL_ADMINS' && params.remote.expectedTotalLinks != null
        ? TelegramDataSourceStatus.SUCCESS
        : TelegramDataSourceStatus.PARTIAL;
    const fetchedTotalLinks = params.remote.links.length;
    const missingTotalLinks = params.remote.expectedTotalLinks == null ? null :
      Math.max(0, params.remote.expectedTotalLinks - fetchedTotalLinks);
    // Invite requested counters are link-specific and may omit revoked/deleted
    // links or pending metadata. They must never overwrite the channel queue.
    const pendingJoinRequestsCount = params.remote.pendingJoinRequestsCount;
    if (
      typeof pendingJoinRequestsCount === 'number' &&
      Number.isInteger(pendingJoinRequestsCount) &&
      pendingJoinRequestsCount >= 0
    ) {
      const pendingRequestsUpdate =
        await this.prisma.telegramChannel.updateMany({
          where: {
            id: params.channelId,
            workspaceId: params.workspaceId,
            pendingJoinRequestsCount: { not: pendingJoinRequestsCount },
          },
          data: { pendingJoinRequestsCount },
        });
      // Store a comparable audience point only when the pending-request value
      // actually changed; this keeps the rolling request delta useful without
      // creating idle snapshots on every invite-link sync.
      if ((pendingRequestsUpdate?.count ?? 0) > 0) {
        await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
          params.channelId,
          'invite-links',
        );
      }
    }
    await this.sourceAccessService.recordDataSource({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      sourceId: params.account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.INVITE_LINKS,
      status,
      errorMessage: status === TelegramDataSourceStatus.PARTIAL
        ? 'Telegram invite visibility is partial. Previously known links are retained.'
        : null,
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

  private async refreshMissingCampaignLinks(
    params: Parameters<TelegramInviteSyncService['finalizeInviteLinkSync']>[0] & {
      channelReference: NonNullable<Parameters<TelegramInviteSyncService['finalizeInviteLinkSync']>[0]['channelReference']>;
    },
  ) {
    const confirmedUrls = params.remote.links.filter((link) =>
      link.usageObserved !== false && link.requestedObserved !== false).map((link) => link.url);
    const tracked = await this.prisma.telegramInviteLink.findMany({
      where: {
        workspaceId: params.workspaceId, telegramChannelId: params.channelId, isRevoked: false,
        ...(confirmedUrls.length ? { url: { notIn: confirmedUrls } } : {}),
        OR: [{ adCampaign: { endedAt: null } }, { botRequestTrackingCampaigns: { some: { adCampaign: { endedAt: null } } } }],
      },
      orderBy: [{ requestedObservedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      select: { url: true }, take: 12,
    });
    if (!tracked.length) return;
    const listedByUrl = new Map(params.remote.links.map((link) => [link.url, link]));
    const maps = await this.telegramInviteAttributionService.buildInviteAttributionMaps(params.workspaceId);
    for (const { url } of tracked) {
      const listed = listedByUrl.get(url);
      let detail: Awaited<ReturnType<TelegramMtprotoClient['getChannelInviteLink']>>;
      try {
        detail = await this.mtprotoClient.getChannelInviteLink({
          ...this.telegramChannelAccessService.accountCredentials(params.account),
          channel: params.channelReference, inviteLink: url,
        });
      } catch {
        const unavailable = {
          ...(!listed || listed.usageObserved === false ? { joinedObserved: false as const } : {}),
          ...(!listed || listed.requestedObserved === false ? { requestedObserved: false as const } : {}),
        };
        await this.prisma.telegramInviteLink.updateMany({
          where: { workspaceId: params.workspaceId, telegramChannelId: params.channelId, url,
            OR: Object.keys(unavailable).flatMap((field) => [{ [field]: true }, { [field]: null }]) },
          data: unavailable,
        });
        continue;
      }
      const observation = await this.persistInviteLinkFromRemote({
          workspaceId: params.workspaceId, channelId: params.channelId, maps,
          link: {
            ...detail,
            ...(detail.usageObserved === false && listed && listed.usageObserved !== false
              ? { usage: listed.usage, usageObserved: true } : {}),
            ...(detail.requestedObserved === false && listed && listed.requestedObserved !== false
              ? { requested: listed.requested, requestedObserved: true } : {}),
          },
          processedCount: 1, totalLinks: 1, warnings: [], progressStep: params.progressStep,
        });
        await this.recordSingleInviteObservation(params.workspaceId, params.channelId, observation);
        if (observation.upserted.adCampaignId) params.affectedCampaignIds.add(observation.upserted.adCampaignId);
    }
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
      joinedCount: number | null;
      requestedCount: number | null;
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
      if (persisted.joinedObservation != null || persisted.requestedObservation != null) persistedLinks.push({
        id: persisted.upserted.id,
        telegramChannelId: persisted.upserted.telegramChannelId,
        adCampaignId: persisted.upserted.adCampaignId ?? null,
        joinedCount: persisted.joinedObservation,
        requestedCount: persisted.requestedObservation,
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
      channelReference: params.channelReference,
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
