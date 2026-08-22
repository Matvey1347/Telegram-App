import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import type {
  BulkActionResultItem,
  ManagedPostsSyncResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramManagedPostRemoteLoaderService } from './telegram-managed-post-remote-loader.service';

@Injectable()
export class TelegramManagedPostRemoteSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly identityService: TelegramManagedPostIdentityService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostRemoteLoaderService: TelegramManagedPostRemoteLoaderService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  async syncManagedPosts(
    userId: string,
    channelId: string,
    onProgress?: BulkProgressCallback,
  ): Promise<ManagedPostsSyncResult> {
    const {
      workspaceId,
      channel,
      account,
      posts,
      scheduledSync,
      remote,
      publishedById,
      scheduledById,
    } = await this.telegramManagedPostRemoteLoaderService.load(
      userId,
      channelId,
    );
    const emptyResult: ManagedPostsSyncResult = {
      checked: 0,
      updated: 0,
      importedScheduled: 0,
      remoteScheduledTotal: 0,
      publishedEarly: 0,
      movedToDraft: 0,
      broken: 0,
      missing: 0,
    };
    const result = {
      ...emptyResult,
      checked: posts.length,
      updated: scheduledSync.revivedScheduled,
      importedScheduled: scheduledSync.importedScheduled,
      remoteScheduledTotal: scheduledSync.remoteScheduledTotal,
    };
    let current = 0;
    for (const post of posts) {
      current += 1;
      const scheduledPostIds =
        post.status === TelegramManagedPostStatus.SCHEDULED
          ? [...(post.telegramScheduledMessageIds ?? [])]
          : [];
      const publishedPostIds = [
        ...new Set([
          ...(post.status === TelegramManagedPostStatus.PUBLISHED
            ? post.telegramMessageIds
            : []),
          ...(post.status === TelegramManagedPostStatus.PUBLISHED
            ? post.telegramMessageUrls.flatMap((url) => {
                const parsed = parseTelegramPostUrl(url);
                return parsed ? [parsed.messageId] : [];
              })
            : []),
        ]),
      ];
      const scheduledMessages = scheduledPostIds
        .map((id) => scheduledById.get(id))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );
      let publishedMessages = publishedPostIds
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
      const confidentPublishedMatch =
        this.identityService.findPublishedIdentity(
          {
            text: post.text,
            imageCount: post.imageUrls.length,
            publishMode: post.publishMode,
            scheduledAt: post.scheduledAt ?? post.publishedAt,
          },
          remote.recentPublished,
        );
      if (
        post.status === TelegramManagedPostStatus.PUBLISHED &&
        post.telegramLinkSource === TelegramManagedPostLinkSource.MANUAL
      ) {
        const manualCurrentIdsMatch =
          Boolean(confidentPublishedMatch) &&
          confidentPublishedMatch!.messageIds.length ===
            post.telegramMessageIds.length &&
          confidentPublishedMatch!.messageIds.every(
            (id, index) => id === post.telegramMessageIds[index],
          );
        const verification = manualCurrentIdsMatch
          ? TelegramManagedPostIdVerificationStatus.VERIFIED
          : confidentPublishedMatch
            ? TelegramManagedPostIdVerificationStatus.MISMATCH
            : TelegramManagedPostIdVerificationStatus.MISSING;
        await this.identityService.updateIdentityIfUnchanged(post, {
          telegramIdVerificationStatus: verification,
          telegramIdVerifiedAt: manualCurrentIdsMatch ? new Date() : null,
          telegramIdLastCheckedAt: new Date(),
          lastTelegramSyncedAt: new Date(),
        });
        result.updated += 1;
        if (verification === TelegramManagedPostIdVerificationStatus.MISSING) {
          result.missing += 1;
        }
        continue;
      }
      const shouldReconcilePublishedMessage =
        post.status === TelegramManagedPostStatus.PUBLISHED &&
        (!publishedMessages.length || !exactCurrentTextMatch);
      if (shouldReconcilePublishedMessage) {
        const reconciled = confidentPublishedMatch;
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
        } else if (post.status === TelegramManagedPostStatus.PUBLISHED) {
          publishedMessages = [];
        }
      }
      if (
        (post.status === TelegramManagedPostStatus.SCHEDULED ||
          (post.status === TelegramManagedPostStatus.FAILED &&
            post.origin === 'TELEGRAM')) &&
        !scheduledMessages.length &&
        !publishedMessages.length
      ) {
        const reconciled = confidentPublishedMatch;
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
      if (
        post.status === TelegramManagedPostStatus.PUBLISHED &&
        post.publishMode === 'IMAGES_THEN_TEXT' &&
        publishedMessages.length === 1 &&
        !publishedMessages[0].hasMedia &&
        publishedMessages[0].date
      ) {
        const previousMedia = remote.recentPublished.find(
          (message) =>
            message.hasMedia &&
            message.date === publishedMessages[0].date &&
            Number(message.id) < Number(publishedMessages[0].id),
        );
        if (previousMedia) {
          publishedMessages = [previousMedia, publishedMessages[0]];
        }
      }
      const effectiveScheduledMessages =
        post.status === TelegramManagedPostStatus.PUBLISHED
          ? []
          : scheduledMessages;
      const messages = effectiveScheduledMessages.length
        ? effectiveScheduledMessages
        : publishedMessages;
      if (!messages.length) {
        if (post.status === 'SCHEDULED') {
          result.updated += 1;
          result.missing += 1;
          await this.prisma.$transaction(async (tx) => {
            await this.telegramManagedPostRevisionStore.createManagedPostRevision(
              tx,
              post,
              'before_sync_missing',
            );
            await tx.telegramManagedPost.update({
              where: { id: post.id },
              data: {
                status: TelegramManagedPostStatus.SCHEDULED,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
                publishedAt: null,
                scheduledAt: post.scheduledAt,
                telegramScheduledMessageIds:
                  post.telegramScheduledMessageIds ?? [],
                telegramMessageIds: [],
                telegramMessageUrls: [],
                telegramIdVerificationStatus:
                  TelegramManagedPostIdVerificationStatus.MISSING,
                telegramIdLastCheckedAt: new Date(),
                lastError: null,
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote:
                  'Scheduled Telegram message was not found during explicit sync; kept pending for identity reconciliation.',
              },
            });
            if (post.groupId) {
              await this.telegramPostGroupsService.normalizePostGroupNumbering(
                tx,
                post.groupId,
              );
            }
          });
          await onProgress?.(
            {
              id: post.id,
              postId: post.id,
              index: current,
              total: posts.length,
              action: 'FAILED',
              success: true,
              status: 'success',
              message: `${post.title}: scheduled message not found; kept pending`,
            } as unknown as BulkActionResultItem,
            current,
            posts.length,
          );
        } else if (post.status === 'PUBLISHED') {
          result.updated += 1;
          result.broken += 1;
          await this.prisma.$transaction(async (tx) => {
            await this.telegramManagedPostRevisionStore.createManagedPostRevision(
              tx,
              post,
              'before_sync_broken',
            );
            await tx.telegramManagedPost.update({
              where: { id: post.id },
              data: {
                status: TelegramManagedPostStatus.PUBLISHED,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
                lastError: 'Telegram post link is broken.',
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote:
                  'Published Telegram post was not found during sync. Post was kept published and marked as broken.',
              },
            });
            if (post.groupId) {
              await this.telegramPostGroupsService.normalizePostGroupNumbering(
                tx,
                post.groupId,
              );
            }
          });
          await onProgress?.(
            {
              id: post.id,
              postId: post.id,
              index: current,
              total: posts.length,
              action: 'FAILED',
              success: false,
              status: 'error',
              message: `${post.title}: Telegram link check failed, post kept published`,
            } as unknown as BulkActionResultItem,
            current,
            posts.length,
          );
        }
        continue;
      }
      const becamePublished =
        post.status !== TelegramManagedPostStatus.PUBLISHED &&
        !effectiveScheduledMessages.length &&
        publishedMessages.length > 0;
      const actualMessageIds = publishedMessages.length
        ? publishedMessages.map((message) => message.id)
        : scheduledPostIds;
      const isScheduledRemote = effectiveScheduledMessages.length > 0;
      const remoteUrls = isScheduledRemote
        ? []
        : this.telegramChannelAccessService.telegramMessageUrlsForPost(
            channel,
            actualMessageIds,
            post.imageUrls.length,
          );
      const hasRemoteMedia = messages.some((message) => message.hasMedia);
      const mediaNote =
        hasRemoteMedia && !post.imageUrls.length
          ? 'Telegram media changed, but media download is not implemented.'
          : null;
      const nextPublishedAt =
        !isScheduledRemote && publishedMessages.length > 0
          ? (() => {
              const remotePublishedAt = messages[0]?.date
                ? new Date(messages[0].date)
                : null;
              if (
                remotePublishedAt &&
                !Number.isNaN(remotePublishedAt.getTime()) &&
                post.scheduledAt &&
                remotePublishedAt < post.scheduledAt
              ) {
                return post.scheduledAt;
              }
              return (
                remotePublishedAt ??
                post.publishedAt ??
                post.scheduledAt ??
                null
              );
            })()
          : post.publishedAt;
      await this.prisma.$transaction(async (tx) => {
        await this.telegramManagedPostRevisionStore.createManagedPostRevision(
          tx,
          post,
          becamePublished
            ? 'before_sync_publish_transition'
            : 'before_sync_update',
        );
        await this.identityService.updateIdentityIfUnchanged(
          post,
          {
            status: becamePublished ? 'PUBLISHED' : post.status,
            telegramRemoteStatus: isScheduledRemote
              ? TelegramManagedPostRemoteStatus.SCHEDULED
              : TelegramManagedPostRemoteStatus.PUBLISHED,
            publishedAt: nextPublishedAt,
            scheduledAt: isScheduledRemote
              ? new Date(messages[0].date || post.scheduledAt || Date.now())
              : null,
            telegramScheduledMessageIds: isScheduledRemote
              ? actualMessageIds
              : [],
            telegramMessageIds: isScheduledRemote ? [] : actualMessageIds,
            telegramMessageUrls: remoteUrls,
            telegramIdVerificationStatus: isScheduledRemote
              ? TelegramManagedPostIdVerificationStatus.UNVERIFIED
              : TelegramManagedPostIdVerificationStatus.VERIFIED,
            telegramIdVerifiedAt: isScheduledRemote ? null : new Date(),
            telegramIdLastCheckedAt: new Date(),
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote: becamePublished
              ? 'Post was published in Telegram before the scheduled time.'
              : mediaNote,
          },
          tx.telegramManagedPost,
        );
        if (post.groupId) {
          await this.telegramPostGroupsService.normalizePostGroupNumbering(
            tx,
            post.groupId,
          );
        }
      });
      result.updated += 1;
      if (becamePublished) result.publishedEarly += 1;
      await onProgress?.(
        {
          id: post.id,
          postId: post.id,
          index: current,
          total: posts.length,
          action: becamePublished ? 'PUBLISHED' : 'SCHEDULED',
          success: true,
          status: 'success',
          message: becamePublished
            ? `${post.title}: published earlier in Telegram`
            : `${post.title}: synced from Telegram`,
        } as unknown as BulkActionResultItem,
        current,
        posts.length,
      );
    }
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    this.applicationLogger.info({
      event: 'telegram.managed_posts.sync.completed',
      message: 'Managed post sync completed',
      workspaceId,
      metadata: {
        telegramChannelId: channelId,
        connectedAccountId: (account as { id?: string | null }).id ?? null,
        checked: result.checked,
        updated: result.updated,
        importedScheduled: result.importedScheduled,
        remoteScheduledTotal: result.remoteScheduledTotal,
        publishedEarly: result.publishedEarly,
        movedToDraft: result.movedToDraft,
        broken: result.broken,
        missing: result.missing,
      },
    });
    return result;
  }
}
