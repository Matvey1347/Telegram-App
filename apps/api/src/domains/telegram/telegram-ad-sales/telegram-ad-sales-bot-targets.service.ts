import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';

export const TELEGRAM_AD_SALES_BOT_TARGET_LIMIT = 100;
export const TELEGRAM_AD_SALES_BOT_EXISTING_POST_LIMIT = 20;

export const TELEGRAM_AD_SALES_STANDARD_FORMATS = [
  '1/24',
  '2/48',
  '3/72',
  'No auto-delete',
] as const;

export type TelegramAdSalesStandardFormatName =
  (typeof TELEGRAM_AD_SALES_STANDARD_FORMATS)[number];

export type TelegramAdSalesBotTarget =
  | { kind: 'CHANNELS'; channelIds: string[] }
  | { kind: 'NETWORK'; networkId: string };

@Injectable()
export class TelegramAdSalesBotTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async options(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const [channels, networks] = await Promise.all([
      this.prisma.telegramChannel.findMany({
        where: {
          workspaceId: membership.workspaceId,
          isActive: true,
          archivedAt: null,
          adminLinks: { some: {} },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
        select: { id: true, title: true, username: true, photoUrl: true },
      }),
      this.prisma.telegramChannelNetwork.findMany({
        where: { workspaceId: membership.workspaceId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
        select: {
          id: true,
          name: true,
          channels: {
            where: {
              telegramChannel: {
                isActive: true,
                archivedAt: null,
                adminLinks: { some: {} },
              },
            },
            orderBy: { telegramChannelId: 'asc' },
            take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1,
            select: { telegramChannelId: true },
          },
        },
      }),
    ]);
    return {
      workspaceId: membership.workspaceId,
      channels,
      networks: networks.map((network) => ({
        id: network.id,
        name: network.name,
        channelIds: network.channels
          .slice(0, TELEGRAM_AD_SALES_BOT_TARGET_LIMIT)
          .map((item) => item.telegramChannelId),
        channelCount: network.channels.length,
        selectable:
          network.channels.length > 0 &&
          network.channels.length <= TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
      })),
    };
  }

  async resolve(userId: string, target: TelegramAdSalesBotTarget) {
    const targetChannels = await this.resolveTargetChannels(userId, target);
    const products = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: targetChannels.workspaceId,
        telegramChannelId: { in: targetChannels.channelIds },
        isActive: true,
        name: { in: [...TELEGRAM_AD_SALES_STANDARD_FORMATS] },
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take:
        TELEGRAM_AD_SALES_BOT_TARGET_LIMIT *
        TELEGRAM_AD_SALES_STANDARD_FORMATS.length,
      select: {
        id: true,
        telegramChannelId: true,
        name: true,
        deleteAfterHours: true,
        isPermanent: true,
      },
    });
    const formats = TELEGRAM_AD_SALES_STANDARD_FORMATS.flatMap((name) => {
      const matches = products.filter((product) => product.name === name);
      if (
        targetChannels.channelIds.some(
          (channelId) =>
            !matches.some((product) => product.telegramChannelId === channelId),
        )
      ) {
        return [];
      }
      return [
        {
          name,
          deleteAfterHours: matches[0]?.deleteAfterHours ?? null,
          isPermanent: matches[0]?.isPermanent ?? false,
          productIdsByChannel: Object.fromEntries(
            matches.map((product) => [product.telegramChannelId, product.id]),
          ),
        },
      ];
    });
    return { ...targetChannels, formats };
  }

  async existingManagedPosts(userId: string, target: TelegramAdSalesBotTarget) {
    const targetChannels = await this.resolveTargetChannels(userId, target);
    if (target.kind !== 'CHANNELS' || targetChannels.channelIds.length !== 1) {
      throw new BadRequestException(
        'Existing managed posts are available for one channel only',
      );
    }
    return this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: targetChannels.workspaceId,
        telegramChannelId: targetChannels.channelIds[0],
        status: {
          in: [
            TelegramManagedPostStatus.DRAFT,
            TelegramManagedPostStatus.SCHEDULED,
            TelegramManagedPostStatus.PUBLISHED,
          ],
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: TELEGRAM_AD_SALES_BOT_EXISTING_POST_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
  }

  private async resolveTargetChannels(
    userId: string,
    target: TelegramAdSalesBotTarget,
  ) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const resolved =
      target.kind === 'NETWORK'
        ? await this.resolveNetwork(membership.workspaceId, target.networkId)
        : await this.resolveChannels(membership.workspaceId, target.channelIds);
    return { workspaceId: membership.workspaceId, ...resolved };
  }

  private async resolveNetwork(workspaceId: string, networkId: string) {
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: {
        id: true,
        name: true,
        channels: {
          where: {
            telegramChannel: {
              isActive: true,
              archivedAt: null,
              adminLinks: { some: {} },
            },
          },
          orderBy: { telegramChannelId: 'asc' },
          take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1,
          select: {
            telegramChannelId: true,
            telegramChannel: { select: { currentSubscribersCount: true } },
          },
        },
      },
    });
    if (!network) throw new NotFoundException('Telegram network not found');
    if (!network.channels.length) {
      throw new BadRequestException('Telegram network has no active channels');
    }
    if (network.channels.length > TELEGRAM_AD_SALES_BOT_TARGET_LIMIT) {
      throw new BadRequestException(
        `Telegram network exceeds ${TELEGRAM_AD_SALES_BOT_TARGET_LIMIT} channels`,
      );
    }
    return {
      networkId: network.id,
      networkName: network.name,
      channelIds: network.channels.map((item) => item.telegramChannelId),
      audienceWeightsByChannel: Object.fromEntries(
        network.channels.map((item) => [
          item.telegramChannelId,
          item.telegramChannel?.currentSubscribersCount ?? 0,
        ]),
      ),
    };
  }

  private async resolveChannels(workspaceId: string, rawIds: string[]) {
    const channelIds = rawIds.map((id) => id.trim()).filter(Boolean);
    if (!channelIds.length) {
      throw new BadRequestException('At least one channel is required');
    }
    if (new Set(channelIds).size !== channelIds.length) {
      throw new BadRequestException('Telegram channel ids must be unique');
    }
    if (channelIds.length > TELEGRAM_AD_SALES_BOT_TARGET_LIMIT) {
      throw new BadRequestException(
        `A maximum of ${TELEGRAM_AD_SALES_BOT_TARGET_LIMIT} channels is allowed`,
      );
    }
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        id: { in: channelIds },
        workspaceId,
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      },
      select: { id: true, currentSubscribersCount: true },
    });
    if (channels.length !== channelIds.length) {
      throw new NotFoundException(
        'One or more Telegram channels are unavailable',
      );
    }
    return {
      networkId: null,
      networkName: null,
      channelIds,
      audienceWeightsByChannel: Object.fromEntries(
        channels.map((channel) => [
          channel.id,
          channel.currentSubscribersCount ?? 0,
        ]),
      ),
    };
  }
}
