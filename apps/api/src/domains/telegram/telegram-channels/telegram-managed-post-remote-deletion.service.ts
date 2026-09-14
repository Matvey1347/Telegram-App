import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { selectTelegramDeletionSource } from '../../../telegram/shared/telegram-deletion-policy';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import {
  ManagedPostDeletionSource,
  TelegramManagedPostRemoteDeleteExecutor,
} from './telegram-managed-post-remote-delete-executor.service';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';

const CHANNEL_DELETE_CONCURRENCY = 5;

type ManagedPostDeletionCandidate = {
  id: string;
  text: string | null;
  imageUrls: string[];
  mediaItems: unknown;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  scheduleMode: string | null;
  publishMode: string | null;
  telegramScheduledMessageIds: string[];
  telegramMessageIds: string[];
  sourceId: string | null;
  sourceType: TelegramSourceType | null;
  telegramChannelId: string;
  telegramChannel: {
    username: string | null;
    telegramChatId: string | null;
    inviteLink: string | null;
    telegramAccessHash: string | null;
  };
};

export type ManagedPostRemoteDeletionResult = {
  considered: number;
  deleted: number;
  skipped: number;
  failed: number;
  results: Array<{ postId: string; success: boolean; error?: string }>;
};

/**
 * Deletes Telegram copies while retaining the managed-post business record.
 * Calls are grouped by channel/source so albums and split messages are removed
 * with bounded Telegram requests instead of one remote request per row.
 */
@Injectable()
export class TelegramManagedPostRemoteDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAccess: TelegramSourceAccessService,
    private readonly access: TelegramChannelAccessService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly identity: TelegramManagedPostIdentityService,
    private readonly executor: TelegramManagedPostRemoteDeleteExecutor,
  ) {}

  async deletePublishedManagedPosts(input: {
    workspaceId: string;
    managedPostIds: string[];
  }): Promise<ManagedPostRemoteDeletionResult> {
    const ids = [...new Set(input.managedPostIds.filter(Boolean))];
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: { id: { in: ids }, workspaceId: input.workspaceId },
      select: {
        id: true,
        text: true,
        imageUrls: true,
        mediaItems: true,
        scheduledAt: true,
        publishedAt: true,
        scheduleMode: true,
        publishMode: true,
        status: true,
        telegramRemoteStatus: true,
        telegramScheduledMessageIds: true,
        telegramMessageIds: true,
        sourceId: true,
        sourceType: true,
        telegramChannelId: true,
        telegramChannel: {
          select: {
            username: true,
            telegramChatId: true,
            inviteLink: true,
            telegramAccessHash: true,
          },
        },
      },
    });
    const found = new Map(posts.map((post) => [post.id, post]));
    const results: ManagedPostRemoteDeletionResult['results'] = ids
      .filter((id) => !found.has(id))
      .map((postId) => ({
        postId,
        success: false,
        error: 'Managed post not found in workspace',
      }));
    const deletedPostIds: string[] = [];
    const nativeScheduleIds = new Set<string>();
    const nativeSchedules = posts.filter(
      (post) =>
        post.scheduleMode === 'TELEGRAM_NATIVE' &&
        post.telegramMessageIds.length === 0 &&
        post.telegramScheduledMessageIds.length > 0 &&
        post.telegramRemoteStatus !==
          TelegramManagedPostRemoteStatus.AUTO_DELETED,
    );
    const nativeByChannel = groupBy(
      nativeSchedules,
      (post) => post.telegramChannelId,
    );
    const nativeChannelGroups = [...nativeByChannel.entries()];
    for (
      let index = 0;
      index < nativeChannelGroups.length;
      index += CHANNEL_DELETE_CONCURRENCY
    ) {
      const outcomes = await Promise.all(
        nativeChannelGroups
          .slice(index, index + CHANNEL_DELETE_CONCURRENCY)
          .map(([channelId, channelPosts]) =>
            this.resolveNativeScheduledPosts(
              input.workspaceId,
              channelId,
              channelPosts,
            ),
          ),
      );
      for (const resolved of outcomes) {
        deletedPostIds.push(...resolved.deletedPostIds);
        resolved.results.forEach((result) =>
          nativeScheduleIds.add(result.postId),
        );
        results.push(...resolved.results);
      }
    }
    const alreadyDeleted = posts.filter(
      (post) =>
        post.telegramRemoteStatus ===
        TelegramManagedPostRemoteStatus.AUTO_DELETED,
    );
    results.push(
      ...alreadyDeleted.map((post) => ({ postId: post.id, success: true })),
    );
    const candidates = posts.filter(
      (post) =>
        post.telegramRemoteStatus !==
          TelegramManagedPostRemoteStatus.AUTO_DELETED &&
        !nativeScheduleIds.has(post.id) &&
        post.telegramMessageIds.length > 0,
    );
    const withoutRemoteIds = posts.filter(
      (post) =>
        post.telegramRemoteStatus !==
          TelegramManagedPostRemoteStatus.AUTO_DELETED &&
        !nativeScheduleIds.has(post.id) &&
        post.telegramMessageIds.length === 0,
    );
    results.push(
      ...withoutRemoteIds.map((post) => ({
        postId: post.id,
        success: false,
        error: 'Managed post has no published Telegram message IDs',
      })),
    );

    const byChannel = groupBy(candidates, (post) => post.telegramChannelId);
    const channelGroups = [...byChannel.entries()];
    for (
      let index = 0;
      index < channelGroups.length;
      index += CHANNEL_DELETE_CONCURRENCY
    ) {
      const outcomes = await Promise.all(
        channelGroups
          .slice(index, index + CHANNEL_DELETE_CONCURRENCY)
          .map(([channelId, channelPosts]) =>
            this.deleteChannelPosts(input.workspaceId, channelId, channelPosts),
          ),
      );
      for (const outcome of outcomes) {
        deletedPostIds.push(...outcome.deletedPostIds);
        results.push(...outcome.results);
      }
    }
    if (deletedPostIds.length) {
      await this.prisma.telegramManagedPost.updateMany({
        where: {
          id: { in: deletedPostIds },
          workspaceId: input.workspaceId,
        },
        data: {
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.AUTO_DELETED,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Published Telegram messages were automatically deleted; the managed post record was retained.',
          lastError: null,
        },
      });
    }
    const failed = results.filter((result) => !result.success).length;
    return {
      considered: ids.length,
      deleted: deletedPostIds.length,
      skipped: alreadyDeleted.length,
      failed,
      results,
    };
  }

  private async resolveNativeScheduledPosts(
    workspaceId: string,
    channelId: string,
    posts: ManagedPostDeletionCandidate[],
  ) {
    const sources = await this.sourceAccess.sourcesForChannel(
      workspaceId,
      channelId,
    );
    const source =
      sources.find(
        (candidate) =>
          candidate.sourceType === TelegramSourceType.MTPROTO &&
          candidate.sourceId === posts[0].sourceId &&
          candidate.permissions.canDeleteMessages,
      ) ??
      sources.find(
        (candidate) =>
          candidate.sourceType === TelegramSourceType.MTPROTO &&
          candidate.permissions.canDeleteMessages,
      );
    if (!source) {
      return {
        deletedPostIds: [],
        results: posts.map((post) => ({
          postId: post.id,
          success: false,
          error:
            'No connected Telegram user account can reconcile and delete the native scheduled post',
        })),
      };
    }
    try {
      const account = await this.access.connectedAccount(
        workspaceId,
        channelId,
        source.sourceId,
      );
      const channel = posts[0].telegramChannel;
      const scheduledMessageIds = [
        ...new Set(posts.flatMap((post) => post.telegramScheduledMessageIds)),
      ];
      const remote = await this.mtproto.getManagedPostMessages({
        ...this.access.accountCredentials(account),
        channel: this.access.mtprotoChannelReference(channel),
        publishedMessageIds: scheduledMessageIds,
        scheduledMessageIds,
      });
      const remoteScheduledIds = new Set(
        remote.scheduled.map((message) => message.id),
      );
      const deletedPostIds: string[] = [];
      const results: ManagedPostRemoteDeletionResult['results'] = [];
      for (const post of posts) {
        const stillScheduled = post.telegramScheduledMessageIds.some((id) =>
          remoteScheduledIds.has(id),
        );
        if (stillScheduled) {
          await this.mtproto.deleteScheduledPost({
            ...this.access.accountCredentials(account),
            channel: this.access.mtprotoChannelReference(channel),
            messageIds: post.telegramScheduledMessageIds,
          });
          deletedPostIds.push(post.id);
          results.push({ postId: post.id, success: true });
          continue;
        }
        const directPublished = remote.published.filter((message) =>
          post.telegramScheduledMessageIds.includes(message.id),
        );
        const identityMatch = directPublished.length
          ? { messageIds: directPublished.map((message) => message.id) }
          : this.identity.findPublishedIdentity(
              {
                text: post.text,
                imageCount: normalizeTelegramPostMediaItems(
                  post.mediaItems,
                  post.imageUrls,
                ).length,
                publishMode: post.publishMode,
                scheduledAt: post.scheduledAt,
              },
              remote.recentPublished,
            );
        if (!identityMatch) {
          results.push({
            postId: post.id,
            success: false,
            error:
              'The native scheduled post is no longer pending and its published Telegram message could not be identified',
          });
          continue;
        }
        post.telegramMessageIds = identityMatch.messageIds;
        await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.PUBLISHED,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
            telegramScheduledMessageIds: [],
            telegramMessageIds: identityMatch.messageIds,
            publishedAt: post.scheduledAt,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote:
              'Native scheduled Telegram post was reconciled before automatic folder cleanup.',
          },
        });
      }
      return { deletedPostIds, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        deletedPostIds: [],
        results: posts.map((post) => ({
          postId: post.id,
          success: false,
          error: message,
        })),
      };
    }
  }

  private async deleteChannelPosts(
    workspaceId: string,
    channelId: string,
    channelPosts: ManagedPostDeletionCandidate[],
  ) {
    const sources = await this.sourceAccess.sourcesForChannel(
      workspaceId,
      channelId,
    );
    const bySource = groupBy(channelPosts, (post) => {
      const selected = this.selectDeletionSource(sources, post);
      return selected
        ? `${selected.sourceType}:${selected.sourceId}`
        : 'unavailable';
    });
    const deletedPostIds: string[] = [];
    const results: ManagedPostRemoteDeletionResult['results'] = [];
    for (const sourcePosts of bySource.values()) {
      const source = this.selectDeletionSource(sources, sourcePosts[0]);
      if (!source) {
        results.push(
          ...sourcePosts.map((post) => ({
            postId: post.id,
            success: false,
            error: 'No Telegram source with delete permission is available',
          })),
        );
        continue;
      }
      try {
        const failures = await this.executor.deleteMessages({
          workspaceId,
          channelId,
          channel: sourcePosts[0].telegramChannel,
          source,
          sources,
          rawMessageIds: sourcePosts.flatMap((post) => post.telegramMessageIds),
        });
        for (const post of sourcePosts) {
          const error = post.telegramMessageIds
            .map(Number)
            .map((messageId) => failures.get(messageId))
            .find(Boolean);
          results.push({ postId: post.id, success: !error, error });
          if (!error) deletedPostIds.push(post.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push(
          ...sourcePosts.map((post) => ({
            postId: post.id,
            success: false,
            error: message,
          })),
        );
      }
    }
    return { deletedPostIds, results };
  }

  private selectDeletionSource<T extends ManagedPostDeletionSource>(
    sources: T[],
    post: {
      sourceId: string | null;
      sourceType: TelegramSourceType | null;
      publishedAt: Date | null;
    },
  ) {
    return selectTelegramDeletionSource(sources, post);
  }
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}
