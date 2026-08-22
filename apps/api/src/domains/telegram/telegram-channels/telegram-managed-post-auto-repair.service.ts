import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostAutoRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
  ) {}

  private readonly logger = new Logger('TelegramChannelsService');

  public async autoRepairImportedManagedPostsOnRead(params: {
    workspaceId: string;
    channelId: string;
    channel: Parameters<
      TelegramChannelAccessService['mtprotoChannelReference']
    >[0];
    account?: Parameters<TelegramChannelAccessService['accountCredentials']>[0];
  }) {
    const candidates = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        origin: 'TELEGRAM',
        telegramMessageIds: { isEmpty: false },
        OR: [
          {
            status: TelegramManagedPostStatus.FAILED,
            telegramRemoteStatus: {
              in: [
                TelegramManagedPostRemoteStatus.MISSING,
                TelegramManagedPostRemoteStatus.BROKEN,
              ],
            },
          },
          {
            status: TelegramManagedPostStatus.SCHEDULED,
          },
          {
            status: TelegramManagedPostStatus.PUBLISHED,
            OR: [
              {
                telegramRemoteStatus: {
                  in: [
                    TelegramManagedPostRemoteStatus.MISSING,
                    TelegramManagedPostRemoteStatus.BROKEN,
                  ],
                },
              },
              { telegramMessageUrls: { isEmpty: true } },
            ],
          },
        ],
      },
    });
    if (!candidates.length) return;

    let account = params.account;
    try {
      account =
        account ??
        (await this.telegramChannelAccessService.connectedAccount(
          params.workspaceId,
          params.channelId,
        ));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'unknown Telegram account error';
      this.logger.warn(
        `Managed posts auto-repair skipped for channel ${params.channelId}: ${message}`,
      );
      return;
    }

    const publishedMessageIds = [
      ...new Set(
        candidates.flatMap((post) => [
          ...(post.telegramMessageIds ?? []),
          ...(post.telegramMessageUrls ?? []).flatMap((url) => {
            const parsed = parseTelegramPostUrl(url);
            return parsed ? [parsed.messageId] : [];
          }),
        ]),
      ),
    ];
    const scheduledMessageIds = [
      ...new Set(
        candidates
          .filter((post) => post.status === TelegramManagedPostStatus.SCHEDULED)
          .flatMap((post) => post.telegramScheduledMessageIds ?? []),
      ),
    ];
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(params.channel);
    if (!channelReference.telegramChatId && !channelReference.username) return;

    const remote = await this.mtprotoClient.getManagedPostMessages({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
      publishedMessageIds,
      scheduledMessageIds,
    });
    const publishedById = new Map(
      remote.published.map((message) => [message.id, message]),
    );
    const scheduledById = new Map(
      remote.scheduled.map((message) => [message.id, message]),
    );

    for (const post of candidates) {
      const postIds = [
        ...new Set([
          ...(post.telegramMessageIds ?? []),
          ...(post.telegramMessageUrls ?? []).flatMap((url) => {
            const parsed = parseTelegramPostUrl(url);
            return parsed ? [parsed.messageId] : [];
          }),
        ]),
      ];
      const scheduledMessages = postIds
        .map((id) => scheduledById.get(id))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );
      if (scheduledMessages.length) continue;

      let publishedMessages = postIds
        .map((id) => publishedById.get(id))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );
      publishedMessages =
        this.telegramChannelAccessService.appendFollowupTextMessageForImagesThenText(
          post.publishMode,
          publishedMessages,
          remote.recentPublished,
        );
      const currentRemoteVisibleText = publishedMessages
        .map((message) => message.text || '')
        .filter(Boolean)
        .join('\n\n');
      const exactCurrentTextMatch =
        Boolean(post.text?.trim()) &&
        this.telegramChannelAccessService.normalizedPlainText(
          currentRemoteVisibleText,
        ) ===
          this.telegramChannelAccessService.normalizedPlainText(
            post.text || '',
          );

      if (!publishedMessages.length || !exactCurrentTextMatch) {
        const reconciled =
          this.telegramChannelAccessService.findMatchingRecentPublishedMessage(
            {
              title: post.title,
              text: post.text,
              publishMode: post.publishMode,
            },
            remote.recentPublished,
          );
        if (reconciled) {
          publishedMessages = reconciled.messageIds
            .map(
              (id) =>
                publishedById.get(id) ??
                remote.recentPublished.find((message) => message.id === id),
            )
            .filter((message): message is NonNullable<typeof message> =>
              Boolean(message),
            );
          publishedMessages =
            this.telegramChannelAccessService.appendFollowupTextMessageForImagesThenText(
              post.publishMode,
              publishedMessages,
              remote.recentPublished,
            );
        }
      }
      if (!publishedMessages.length) continue;

      const actualMessageIds = publishedMessages.map((message) => message.id);
      const remoteUrls =
        this.telegramChannelAccessService.telegramMessageUrlsForPost(
          params.channel,
          actualMessageIds,
          post.imageUrls.length,
        );
      const publishedAt = new Date(
        publishedMessages[0]?.date || post.publishedAt || Date.now(),
      );
      const changed =
        post.status !== TelegramManagedPostStatus.PUBLISHED ||
        post.telegramRemoteStatus !==
          TelegramManagedPostRemoteStatus.PUBLISHED ||
        post.scheduledAt !== null ||
        post.lastError !== null ||
        post.telegramMessageUrls.length !== remoteUrls.length ||
        (post.telegramMessageUrls ?? []).some(
          (url, index) => url !== remoteUrls[index],
        ) ||
        (post.telegramMessageIds ?? []).length !== actualMessageIds.length ||
        (post.telegramMessageIds ?? []).some(
          (messageId, index) => messageId !== actualMessageIds[index],
        );
      if (!changed) continue;

      await this.prisma.$transaction(async (tx) => {
        await this.telegramManagedPostRevisionStore.createManagedPostRevision(
          tx,
          post,
          'before_sync_publish_transition',
        );
        await tx.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.PUBLISHED,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
            publishedAt,
            scheduledAt: null,
            telegramMessageIds: actualMessageIds,
            telegramMessageUrls: remoteUrls,
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote:
              'Published Telegram post was repaired automatically while loading posts.',
          },
        });
        if (post.groupId) {
          await this.telegramPostGroupsService.normalizePostGroupNumbering(
            tx,
            post.groupId,
          );
        }
      });
    }
  }
}
