import { Injectable, NotFoundException } from '@nestjs/common';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

type LookupPostRow = {
  id: string;
  title: string;
  icon: string | null;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  telegramRemoteStatus: string;
  telegramMessageIds: string[];
  telegramIdVerificationStatus: string;
  lastError: string | null;
};

@Injectable()
export class TelegramManagedPostLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly presentation: TelegramManagedPostGroupPresentationService,
  ) {}

  async lookup(userId: string, channelId: string, requestedIds: string[]) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const posts = (await this.prisma.telegramManagedPost.findMany({
      where: {
        id: { in: requestedIds },
        workspaceId,
        telegramChannelId: channelId,
      },
      select: {
        id: true,
        title: true,
        icon: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        telegramRemoteStatus: true,
        telegramMessageIds: true,
        telegramIdVerificationStatus: true,
        lastError: true,
      },
    })) as LookupPostRow[];
    const iconsById = await this.presentation.loadIconsByIds(
      workspaceId,
      posts.map((post) => post.icon),
    );
    const items = posts.map((post) => {
      return {
        id: post.id,
        title: post.title,
        icon: post.icon,
        iconPresentation: post.icon
          ? iconToResolvedEmoji(iconsById.get(post.icon))
          : null,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        telegramRemoteStatus: post.telegramRemoteStatus,
        telegramMessageIds: post.telegramMessageIds,
        telegramIdVerificationStatus: post.telegramIdVerificationStatus,
        lastError: post.lastError,
      };
    });
    const postsById = new Map(items.map((post) => [post.id, post]));

    return {
      items: requestedIds.flatMap((id) => {
        const post = postsById.get(id);
        return post ? [post] : [];
      }),
      missingIds: requestedIds.filter((id) => !postsById.has(id)),
    };
  }
}
