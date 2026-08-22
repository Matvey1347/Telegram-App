import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelInviteLinksQueryDto } from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramInviteHistoryService } from './telegram-invite-history.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';
import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';

@Injectable()
export class TelegramChannelReadModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: TelegramChannelAnalyticsService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramInviteHistoryService: TelegramInviteHistoryService,
    private readonly telegramInviteSnapshotStore: TelegramInviteSnapshotStore,
    private readonly telegramInvitePersistenceService: TelegramInvitePersistenceService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}

  async inviteLinks(
    userId: string,
    channelId: string,
    query: TelegramChannelInviteLinksQueryDto = {},
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const where = this.inviteLinksWhere(workspaceId, channelId, query.search);
    const pagination = normalizePagination(query);
    const [links, totalItems] = await Promise.all([
      this.telegramInvitePersistenceService.findInviteLinksWithRequestedCountFallback(
        {
          workspaceId,
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        },
      ),
      this.prisma.telegramInviteLink.count({ where }),
    ]);
    const items =
      await this.telegramInviteHistoryService.attachInviteLinkHistories(
        workspaceId,
        channelId,
        links,
      );
    return createPaginatedResponse(items, totalItems, pagination);
  }

  async inviteLinksForSelect(
    userId: string,
    channelId: string,
    query: Pick<
      TelegramChannelInviteLinksQueryDto,
      'search' | 'availableForCampaignId'
    > = {},
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const baseWhere = this.inviteLinksWhere(
      workspaceId,
      channelId,
      query.search,
    );
    const availableForCampaignId = String(
      query.availableForCampaignId || '',
    ).trim();
    const where: Prisma.TelegramInviteLinkWhereInput = availableForCampaignId
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { adCampaignId: null },
                { adCampaignId: availableForCampaignId },
              ],
            },
          ],
        }
      : {
          AND: [baseWhere, { adCampaignId: null }],
        };
    const links =
      await this.telegramInvitePersistenceService.findInviteLinksWithRequestedCountFallback(
        {
          workspaceId,
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      );
    return this.telegramInviteHistoryService.attachInviteLinkHistories(
      workspaceId,
      channelId,
      links,
    );
  }

  public inviteLinksWhere(
    workspaceId: string,
    channelId: string,
    search?: string,
  ): Prisma.TelegramInviteLinkWhereInput {
    const normalizedSearch = search?.trim();
    return {
      workspaceId,
      telegramChannelId: channelId,
      ...(normalizedSearch
        ? {
            OR: [
              {
                name: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                url: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                creatorUsername: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                creatorFirstName: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                creatorLastName: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };
  }

  async inviteLinkHistory(
    userId: string,
    channelId: string,
    inviteLinkId: string,
    limit = 120,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const inviteLink = await this.prisma.telegramInviteLink.findFirst({
      where: {
        id: inviteLinkId,
        workspaceId,
        telegramChannelId: channelId,
      },
      select: this.telegramInvitePersistenceService.inviteLinkReadSelect(true),
    });
    if (!inviteLink) {
      throw new NotFoundException('Invite link not found');
    }
    const rows =
      await this.telegramInviteSnapshotStore.readInviteLinkSnapshotsOrEmpty({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          inviteLinkId,
        },
        orderBy: { syncedAt: 'desc' },
        take: Math.max(2, Math.min(365, limit)),
      });
    return this.telegramInviteHistoryService.buildInviteLinkHistoryPayload(
      inviteLink,
      rows.length ? [...rows].reverse() : [],
      limit,
    );
  }
}
