import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { ManagedPostRevisionSource } from './telegram-channels.internal';

type ReschedulerPersistence = {
  prisma: PrismaService;
  access: TelegramChannelAccessService;
  revisions: TelegramManagedPostRevisionStore;
  groups: TelegramPostGroupsService;
};

export async function markScheduledPostPublished(
  deps: ReschedulerPersistence,
  workspaceId: string,
  channelId: string,
  post: ManagedPostRevisionSource,
  channel: {
    username: string | null;
    telegramChatId: string | null;
    inviteLink: string | null;
    telegramAccessHash: string | null;
  },
  match: { messageIds: string[]; matchedMessage: { date: string | null } },
) {
  const publishedAt = match.matchedMessage.date
    ? new Date(match.matchedMessage.date)
    : new Date();
  const urls = deps.access.telegramMessageUrlsForPost(
    channel,
    match.messageIds,
    normalizeTelegramPostMediaItems(post.mediaItems, post.imageUrls).length,
  );
  await deps.prisma.$transaction(async (tx) => {
    await deps.revisions.createManagedPostRevision(
      tx,
      post,
      'before_reschedule_confirmed_published',
    );
    const updated = await tx.telegramManagedPost.updateMany({
      where: {
        id: post.id,
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
      },
      data: {
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
        scheduledAt: null,
        publishedAt,
        telegramScheduledMessageIds: [],
        telegramMessageIds: match.messageIds,
        telegramMessageUrls: urls,
        telegramIdVerificationStatus:
          TelegramManagedPostIdVerificationStatus.VERIFIED,
        telegramIdVerifiedAt: new Date(),
        telegramIdLastCheckedAt: new Date(),
        lastTelegramSyncedAt: new Date(),
        lastTelegramSyncNote:
          'Confirmed as already published during channel rescheduling.',
        lastError: null,
      },
    });
    if (updated.count && post.groupId)
      await deps.groups.normalizePostGroupNumbering(tx, post.groupId);
  });
}

export async function returnScheduledPostToDraft(
  deps: ReschedulerPersistence,
  userId: string,
  workspaceId: string,
  channelId: string,
  post: ManagedPostRevisionSource,
) {
  await deps.prisma.$transaction(async (tx) => {
    await deps.revisions.createManagedPostRevision(
      tx,
      post,
      'before_reschedule_missed_post_to_draft',
      userId,
    );
    await tx.telegramManagedPost.updateMany({
      where: {
        id: post.id,
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
      },
      data: {
        status: TelegramManagedPostStatus.DRAFT,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
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
        sourceType: null,
        sourceId: null,
        sourceWasPremium: null,
        publishMode: null,
        lastError: null,
        lastTelegramSyncedAt: new Date(),
        lastTelegramSyncNote:
          'Missed Telegram publication was not found remotely and returned to drafts during channel rescheduling.',
      },
    });
    if (post.groupId)
      await deps.groups.normalizePostGroupNumbering(tx, post.groupId);
  });
}
