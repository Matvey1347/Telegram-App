import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import type { ResetChannelScheduledPostsResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramManagedPostRemoteSyncService } from './telegram-managed-post-remote-sync.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { telegramChannelNotFound } from './telegram-posts.errors';

@Injectable()
export class TelegramManagedPostScheduledResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly support: TelegramChannelsSupportService,
    private readonly access: TelegramChannelAccessService,
    private readonly revisions: TelegramManagedPostRevisionStore,
    private readonly groups: TelegramPostGroupsService,
    private readonly remoteSync: TelegramManagedPostRemoteSyncService,
  ) {}

  async resetChannelScheduledPosts(
    userId: string,
    channelId: string,
  ): Promise<ResetChannelScheduledPostsResult> {
    // Telegram can publish a native scheduled message before our local state is
    // refreshed. Reconcile first so a now-published post keeps its real message
    // IDs and is excluded from the destructive scheduled-message reset below.
    await this.remoteSync.syncManagedPosts(userId, channelId);

    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        inviteLink: true,
        telegramAccessHash: true,
      },
    });
    if (!channel) throw telegramChannelNotFound();

    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
      },
      orderBy: { createdAt: 'asc' },
    });
    const account = await this.access.connectedAccount(workspaceId, channelId);
    const channelReference = this.access.mtprotoChannelReference(channel);
    const credentials = this.access.accountCredentials(account);
    const remoteScheduled = await this.mtprotoClient.getScheduledHistory({
      ...credentials,
      channel: channelReference,
    });
    const remoteMessageIds = [
      ...new Set(remoteScheduled.map((message) => message.id).filter(Boolean)),
    ];

    if (remoteMessageIds.length) {
      await this.mtprotoClient.deleteScheduledPost({
        ...credentials,
        channel: channelReference,
        messageIds: remoteMessageIds,
      });
    }

    if (!posts.length) {
      return {
        action: 'RESET_CHANNEL_SCHEDULED_TO_DRAFT',
        channelId,
        remoteScheduledDeletedCount: remoteMessageIds.length,
        postsReturnedToDraftCount: 0,
        postIds: [],
      };
    }

    const postIds = posts.map((post) => post.id);
    const affectedGroupIds = [
      ...new Set(posts.flatMap((post) => (post.groupId ? [post.groupId] : []))),
    ];
    const resetAt = new Date();
    const postsReturnedToDraftCount = await this.prisma.$transaction(
      async (tx) => {
        await this.revisions.createManagedPostRevisions(
          tx,
          posts,
          'before_channel_scheduled_reset',
        );
        const updated = await tx.telegramManagedPost.updateMany({
          where: {
            id: { in: postIds },
            workspaceId,
            telegramChannelId: channelId,
            status: TelegramManagedPostStatus.SCHEDULED,
          },
          data: {
            remoteImportKey: null,
            status: TelegramManagedPostStatus.DRAFT,
            scheduledAt: null,
            scheduleMode: null,
            publishedAt: null,
            telegramScheduledMessageIds: [],
            telegramMessageIds: [],
            telegramMessageUrls: [],
            telegramIdVerificationStatus:
              TelegramManagedPostIdVerificationStatus.UNVERIFIED,
            telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
            telegramIdVerifiedAt: null,
            telegramIdLastCheckedAt: null,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
            lastTelegramSyncedAt: resetAt,
            lastTelegramSyncNote:
              'All channel scheduled messages were deleted in Telegram and returned to drafts.',
            sourceType: null,
            sourceId: null,
            sourceWasPremium: null,
            captionLengthMaxUsed: null,
            messageLengthMaxUsed: null,
            publishMode: null,
            lastError: null,
          },
        });
        for (const groupId of affectedGroupIds) {
          await this.groups.normalizePostGroupNumbering(tx, groupId);
        }
        return updated.count;
      },
    );

    return {
      action: 'RESET_CHANNEL_SCHEDULED_TO_DRAFT',
      channelId,
      remoteScheduledDeletedCount: remoteMessageIds.length,
      postsReturnedToDraftCount,
      postIds,
    };
  }
}
