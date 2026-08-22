import { BadRequestException, Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramRemoteScheduledPostImportService } from './telegram-remote-scheduled-post-import.service';

@Injectable()
export class TelegramManagedPostRemoteLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly support: TelegramChannelsSupportService,
    private readonly access: TelegramChannelAccessService,
    private readonly catalog: TelegramChannelCatalogService,
    private readonly scheduledImport: TelegramRemoteScheduledPostImportService,
  ) {}

  async load(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const [channel, channelRow] = await Promise.all([
      this.catalog.findOne(userId, channelId),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId },
        select: { assignedMemberId: true },
      }),
    ]);
    const account = await this.access.connectedAccount(workspaceId, channelId);
    const channelReference = this.access.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username) {
      throw new BadRequestException('Channel has no Telegram reference');
    }
    const scheduledSync =
      await this.scheduledImport.syncRemoteScheduledManagedPosts({
        workspaceId,
        channelId,
        channel,
        assignedMemberId: channelRow?.assignedMemberId ?? null,
        account,
      });
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        OR: [
          {
            status: {
              in: [
                TelegramManagedPostStatus.SCHEDULED,
                TelegramManagedPostStatus.PUBLISHED,
                TelegramManagedPostStatus.FAILED,
              ],
            },
            telegramMessageIds: { isEmpty: false },
          },
          { telegramMessageUrls: { isEmpty: false } },
          { status: TelegramManagedPostStatus.SCHEDULED },
        ],
      },
    });
    const publishedMessageIds = [
      ...new Set([
        ...posts.flatMap((post) => post.telegramMessageIds),
        ...posts.flatMap((post) =>
          post.telegramMessageUrls.flatMap((url) => {
            const parsed = parseTelegramPostUrl(url);
            return parsed ? [parsed.messageId] : [];
          }),
        ),
      ]),
    ];
    const scheduledMessageIds = [
      ...new Set(
        posts
          .filter((post) => post.status === TelegramManagedPostStatus.SCHEDULED)
          .flatMap((post) => post.telegramScheduledMessageIds),
      ),
    ];
    const remote = await this.mtprotoClient.getManagedPostMessages({
      ...this.access.accountCredentials(account),
      channel: channelReference,
      publishedMessageIds,
      scheduledMessageIds,
    });
    return {
      workspaceId,
      channel,
      account,
      posts,
      scheduledSync,
      remote,
      publishedById: new Map(
        remote.published.map((message) => [message.id, message]),
      ),
      scheduledById: new Map(
        [...scheduledSync.remoteScheduledHistory, ...remote.scheduled].map(
          (message) => [message.id, message],
        ),
      ),
    };
  }
}
