import { Injectable } from '@nestjs/common';
import type { TelegramChannelNetworkOption } from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL } from '../telegram-channels/telegram-channels.internal';
import { SYSTEM_ALL_NETWORK_ID } from './telegram-channel-network.constants';

const SYSTEM_ALL_ICON = {
  type: 'image' as const,
  id: 'telegram-system-all-network',
  url: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
  name: 'Telegram',
};

@Injectable()
export class TelegramChannelNetworkOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async list(userId: string): Promise<TelegramChannelNetworkOption[]> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const [workspace, networks] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { systemNetworkExcludedChannelIds: true },
      }),
      this.prisma.telegramChannelNetwork.findMany({
        where: { workspaceId, channels: { some: {} } },
        select: {
          id: true,
          name: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          channels: { select: { telegramChannelId: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const allChannels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        id: { notIn: workspace?.systemNetworkExcludedChannelIds ?? [] },
        isActive: true,
        archivedAt: null,
        isTest: false,
        adminLinks: { some: {} },
      },
      select: { id: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });

    return [
      ...(allChannels.length
        ? [
            {
              id: SYSTEM_ALL_NETWORK_ID,
              name: 'All',
              iconPresentation: SYSTEM_ALL_ICON,
              channels: allChannels.map(({ id }) => ({ id })),
            },
          ]
        : []),
      ...networks.map((network) => ({
        id: network.id,
        name: network.name,
        iconPresentation: iconToResolvedEmoji(network.icon),
        channels: network.channels.map(({ telegramChannelId }) => ({
          id: telegramChannelId,
        })),
      })),
    ];
  }
}
