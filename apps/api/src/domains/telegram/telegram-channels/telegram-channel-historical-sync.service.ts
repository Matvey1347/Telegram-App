import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { HistoricalSyncDto } from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteHistoryService } from './telegram-invite-history.service';
import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';
import { TelegramInviteSyncService } from './telegram-invite-sync.service';

@Injectable()
export class TelegramChannelHistoricalSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramInviteAttributionService: TelegramInviteAttributionService,
    private readonly telegramInviteSyncService: TelegramInviteSyncService,
    private readonly telegramInviteHistoryService: TelegramInviteHistoryService,
    private readonly telegramInviteSnapshotStore: TelegramInviteSnapshotStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}

  private readonly defaultPostSyncLimit = 50;

  public async syncPublicChannelInfo(
    workspaceId: string,
    channelId: string,
    account: {
      id: string;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked: string | null;
    },
  ) {
    const channel = (await (this.prisma.telegramChannel as any).findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    })) as {
      id: string;
      username: string | null;
      telegramChatId: string | null;
      postsSyncFrom?: Date | null;
      inviteLinksSyncFrom?: Date | null;
    } | null;
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const info = await this.mtprotoClient.getPublicChannelInfo({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
    });
    if (info.kind !== 'channel') {
      return {
        updated: false,
        reason: 'Resolved Telegram entity is not a channel',
      };
    }
    const updated = await this.prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...this.telegramChannelAccessService.channelIdentityPatch(info),
        lastPublicSyncedAt: new Date(),
      },
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName:
        this.telegramChannelAccessService.sourceDisplayName(account),
      metadata: {
        source: 'sync_public_channel_info',
        subscribersCount: updated.currentSubscribersCount,
      },
    });
    return {
      updated: true,
      title: updated.title,
      subscribersCount: updated.currentSubscribersCount,
      username: updated.username,
    };
  }

  async syncHistorical(
    userId: string,
    channelId: string,
    dto: HistoricalSyncDto,
    onProgress?: BulkProgressCallback,
    progressStep = { current: 2, total: 8 },
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    );
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const liveInviteLinkSync = dto.syncInviteLinks
      ? {
          maps: await this.telegramInviteAttributionService.buildInviteAttributionMaps(
            workspaceId,
          ),
          importedCount: 0,
          updatedCount: 0,
          matchedMembersCount: 0,
          unresolvedCreatorsCount: 0,
          affectedCampaignIds: new Set<string>(),
          processedUrls: new Set<string>(),
          syncedAt: new Date(),
          persistedLinksById: new Map<
            string,
            {
              id: string;
              telegramChannelId: string;
              adCampaignId: string | null;
              joinedCount: number;
              requestedCount: number;
              isRevoked: boolean;
            }
          >(),
        }
      : null;
    const historical = await this.mtprotoClient.getChannelHistorical({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
      postLimit: dto.postLimit || this.defaultPostSyncLimit,
      postsFrom: channel.postsSyncFrom ?? null,
      inviteLinksCreatedFrom: channel.inviteLinksSyncFrom ?? null,
      onInviteLinksProgress: async (item) => {
        await this.telegramChannelsSupportService.notifyInviteLinksProgress(
          onProgress,
          progressStep.current,
          progressStep.total,
          item,
        );
      },
      onInviteLinkLoaded: liveInviteLinkSync
        ? async (link, loadedCount, expectedTotal, warnings) => {
            if (liveInviteLinkSync.processedUrls.has(link.url)) return;
            liveInviteLinkSync.processedUrls.add(link.url);
            const persisted =
              await this.telegramInviteSyncService.persistInviteLinkFromRemote({
                workspaceId,
                channelId,
                link,
                maps: liveInviteLinkSync.maps,
                processedCount: loadedCount,
                totalLinks: Math.max(expectedTotal, loadedCount),
                warnings,
                onProgress,
                progressStep,
              });
            if (persisted.matchedMember)
              liveInviteLinkSync.matchedMembersCount += 1;
            if (persisted.unresolved) {
              liveInviteLinkSync.unresolvedCreatorsCount += 1;
            }
            if (persisted.existing) {
              liveInviteLinkSync.updatedCount += 1;
              if (persisted.existing.adCampaignId) {
                liveInviteLinkSync.affectedCampaignIds.add(
                  persisted.existing.adCampaignId,
                );
              }
            } else {
              liveInviteLinkSync.importedCount += 1;
            }
            if (persisted.upserted.adCampaignId) {
              liveInviteLinkSync.affectedCampaignIds.add(
                persisted.upserted.adCampaignId,
              );
            }
            liveInviteLinkSync.persistedLinksById.set(persisted.upserted.id, {
              id: persisted.upserted.id,
              telegramChannelId: persisted.upserted.telegramChannelId,
              adCampaignId: persisted.upserted.adCampaignId ?? null,
              joinedCount: Number(persisted.upserted.joinedCount || 0),
              requestedCount: Number(persisted.upserted.requestedCount || 0),
              isRevoked: Boolean(persisted.upserted.isRevoked),
            });
          }
        : undefined,
    });
    await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
      onProgress,
      progressStep.current,
      progressStep.total,
      'Telegram history loaded, saving channel details',
    );
    if (historical.channel) {
      await this.telegramChannelAccessService.persistResolvedChannelIdentity(
        workspaceId,
        channelId,
        historical.channel,
      );
    }
    let imported = 0;
    let updated = 0;
    let inviteResult: Awaited<
      ReturnType<TelegramInviteSyncService['syncChannelInviteLinks']>
    > | null = null;
    if (dto.syncInviteLinks) {
      await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        'Matching invite link creators and saving invite links',
      );
      const remote = historical?.inviteLinksDetailed
        ? {
            scope: historical.inviteLinksScope ?? 'ALL_ADMINS',
            expectedTotalLinks:
              historical.inviteLinksExpectedTotal ??
              historical.inviteLinksDetailed.length,
            admins: [],
            links: historical.inviteLinksDetailed,
            warnings: historical.inviteLinkWarnings ?? [],
          }
        : null;
      if (remote && liveInviteLinkSync) {
        for (const [index, link] of remote.links.entries()) {
          if (liveInviteLinkSync.processedUrls.has(link.url)) continue;
          liveInviteLinkSync.processedUrls.add(link.url);
          const persisted =
            await this.telegramInviteSyncService.persistInviteLinkFromRemote({
              workspaceId,
              channelId,
              link,
              maps: liveInviteLinkSync.maps,
              processedCount: index + 1,
              totalLinks: remote.links.length,
              warnings: remote.warnings,
              onProgress,
              progressStep,
            });
          if (persisted.matchedMember)
            liveInviteLinkSync.matchedMembersCount += 1;
          if (persisted.unresolved) {
            liveInviteLinkSync.unresolvedCreatorsCount += 1;
          }
          if (persisted.existing) {
            liveInviteLinkSync.updatedCount += 1;
            if (persisted.existing.adCampaignId) {
              liveInviteLinkSync.affectedCampaignIds.add(
                persisted.existing.adCampaignId,
              );
            }
          } else {
            liveInviteLinkSync.importedCount += 1;
          }
          if (persisted.upserted.adCampaignId) {
            liveInviteLinkSync.affectedCampaignIds.add(
              persisted.upserted.adCampaignId,
            );
          }
          liveInviteLinkSync.persistedLinksById.set(persisted.upserted.id, {
            id: persisted.upserted.id,
            telegramChannelId: persisted.upserted.telegramChannelId,
            adCampaignId: persisted.upserted.adCampaignId ?? null,
            joinedCount: Number(persisted.upserted.joinedCount || 0),
            requestedCount: Number(persisted.upserted.requestedCount || 0),
            isRevoked: Boolean(persisted.upserted.isRevoked),
          });
        }
        await this.telegramInviteSnapshotStore.persistInviteLinkSnapshots({
          workspaceId,
          channelId,
          syncedAt: liveInviteLinkSync.syncedAt,
          links: Array.from(liveInviteLinkSync.persistedLinksById.values()),
        });
        inviteResult =
          await this.telegramInviteSyncService.finalizeInviteLinkSync({
            workspaceId,
            channelId,
            account,
            remote,
            importedCount: liveInviteLinkSync.importedCount,
            updatedCount: liveInviteLinkSync.updatedCount,
            matchedMembersCount: liveInviteLinkSync.matchedMembersCount,
            unresolvedCreatorsCount: liveInviteLinkSync.unresolvedCreatorsCount,
            affectedCampaignIds: liveInviteLinkSync.affectedCampaignIds,
            onProgress,
            progressStep,
          });
      } else {
        inviteResult =
          await this.telegramInviteSyncService.syncChannelInviteLinks({
            workspaceId,
            channelId,
            account,
            channelReference,
            prefetchedRemote: remote,
            onProgress,
            progressStep,
          });
      }
      imported = inviteResult.imported;
      updated = inviteResult.updated;
    }
    let postsUpdated = 0;
    if (dto.syncPosts) {
      await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        `Updating ${historical.dailyStats?.length ?? 0} historical daily stats`,
      );
      for (const row of historical.dailyStats || []) {
        const date = new Date(`${row.date}T00:00:00.000Z`);
        await this.prisma.telegramChannelDailyStats.upsert({
          where: {
            telegramChannelId_date: { telegramChannelId: channelId, date },
          },
          create: {
            telegramChannelId: channelId,
            date,
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
          update: {
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
        });
        postsUpdated += 1;
      }
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.POSTS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName:
          this.telegramChannelAccessService.sourceDisplayName(account),
        metadata: { postsUpdated },
      });
    }
    const audienceSnapshot =
      dto.syncPosts || dto.syncInviteLinks
        ? await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
            channelId,
            'sync',
          )
        : null;
    const result = {
      message: 'Historical MTProto sync completed',
      source: 'mtproto',
      ...this.telegramChannelCatalogService.syncCutoffMetadata(channel),
      imported,
      updated,
      postsUpdated,
      inviteLinksScope:
        inviteResult?.scope ?? historical?.inviteLinksScope ?? null,
      inviteLinksExpectedTotal:
        inviteResult?.expectedTotalLinks ??
        historical?.inviteLinksExpectedTotal ??
        null,
      inviteLinksFetchedTotal:
        inviteResult?.fetchedTotalLinks ??
        historical?.inviteLinksDetailed?.length ??
        0,
      inviteLinksMissingTotal:
        inviteResult?.missingTotalLinks ??
        Math.max(
          0,
          (historical?.inviteLinksExpectedTotal ?? 0) -
            (historical?.inviteLinksDetailed?.length ?? 0),
        ),
      inviteLinkWarnings:
        inviteResult?.warnings ?? historical?.inviteLinkWarnings ?? [],
      audienceSnapshot,
    };
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    return result;
  }
}
