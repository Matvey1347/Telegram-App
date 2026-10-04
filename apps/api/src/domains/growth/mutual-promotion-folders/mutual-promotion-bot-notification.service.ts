import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
import { renderPublicationConfirmation } from '../../telegram/telegram-system-bot/telegram-system-bot-publication-confirmation';

@Injectable()
export class MutualPromotionBotNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramSystemBotNotificationsService))
    private readonly notifications: TelegramSystemBotNotificationsService,
  ) {}

  async sendScheduledOnce(folderId: string) {
    const folder = await this.folder(folderId);
    if (
      folder.scheduledBotConfirmationSentAt ||
      !folder.posts.length ||
      folder.posts.some((post) =>
        post.deliveries.some(
          (delivery) =>
            !delivery.managedPost ||
            !['SCHEDULED', 'PUBLISHED'].includes(delivery.managedPost.status),
        ),
      )
    ) {
      return;
    }
    const delivery = await this.notifications.sendToWorkspaceUser({
      workspaceId: folder.workspaceId,
      userId: folder.createdByUserId,
      text: this.render(folder, 'scheduled'),
      parseMode: 'HTML',
    });
    if (delivery.status !== 'SENT') return;
    await this.prisma.mutualPromotionFolder.updateMany({
      where: { id: folder.id, scheduledBotConfirmationSentAt: null },
      data: { scheduledBotConfirmationSentAt: new Date() },
    });
  }

  async sendPublishedOnce(folderPostId: string) {
    const post = await this.prisma.mutualPromotionFolderPost.findUnique({
      where: { id: folderPostId },
      select: {
        id: true,
        publishedBotConfirmationSentAt: true,
        folder: { select: { workspaceId: true, createdByUserId: true } },
        deliveries: {
          select: {
            status: true,
            telegramChannelId: true,
            managedPost: {
              select: {
                title: true,
                scheduledAt: true,
                deleteAt: true,
                telegramMessageUrls: true,
              },
            },
          },
        },
      },
    });
    if (
      !post ||
      post.publishedBotConfirmationSentAt ||
      !post.deliveries.length ||
      post.deliveries.some(
        (delivery) =>
          delivery.status !== 'PUBLISHED' ||
          !delivery.managedPost?.telegramMessageUrls.length,
      )
    ) {
      return;
    }
    const folder = await this.folderForPosts([post.id]);
    const delivery = await this.notifications.sendToWorkspaceUser({
      workspaceId: post.folder.workspaceId,
      userId: post.folder.createdByUserId,
      text: this.render(folder, 'published'),
      parseMode: 'HTML',
    });
    if (delivery.status !== 'SENT') return;
    await this.prisma.mutualPromotionFolderPost.updateMany({
      where: { id: post.id, publishedBotConfirmationSentAt: null },
      data: { publishedBotConfirmationSentAt: new Date() },
    });
  }

  private folder(id: string) {
    return this.folderForPosts(undefined, id);
  }

  private folderForPosts(postIds?: string[], folderId?: string) {
    return this.prisma.mutualPromotionFolder.findFirstOrThrow({
      where: {
        ...(folderId ? { id: folderId } : {}),
        ...(postIds ? { posts: { some: { id: { in: postIds } } } } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        createdByUserId: true,
        scheduledBotConfirmationSentAt: true,
        workspace: { select: { timezone: true } },
        participants: {
          select: {
            telegramChannel: {
              select: {
                id: true,
                title: true,
                publicInviteLink: { select: { url: true } },
                defaultInviteLink: { select: { url: true } },
                presentationIcon: { select: { emoji: true } },
              },
            },
          },
        },
        posts: {
          where: postIds ? { id: { in: postIds } } : undefined,
          orderBy: { position: 'asc' },
          select: {
            title: true,
            deliveries: {
              select: {
                telegramChannelId: true,
                managedPost: {
                  select: {
                    status: true,
                    scheduledAt: true,
                    deleteAt: true,
                    telegramMessageUrls: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private render(
    folder: Awaited<
      ReturnType<MutualPromotionBotNotificationService['folder']>
    >,
    state: 'scheduled' | 'published',
  ) {
    return renderPublicationConfirmation({
      state,
      timezone: folder.workspace.timezone,
      channels: folder.participants.map(
        (participant) => participant.telegramChannel,
      ),
      groups: folder.posts.map((post) => ({
        title: post.title,
        placements: post.deliveries.flatMap((delivery) =>
          delivery.managedPost
            ? [
                {
                  telegramChannelId: delivery.telegramChannelId,
                  scheduledAt: delivery.managedPost.scheduledAt ?? undefined,
                  deleteAt: delivery.managedPost.deleteAt,
                  telegramMessageUrls: delivery.managedPost.telegramMessageUrls,
                },
              ]
            : [],
        ),
      })),
    });
  }
}
