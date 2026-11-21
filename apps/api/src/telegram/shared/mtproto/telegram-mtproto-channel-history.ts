import type { TelegramMtprotoChannelResolution } from './telegram-mtproto-channel-resolution';
import {
  readTelegramHistoryFromCutoff,
  type TelegramHistoryCutoff,
} from './telegram-history-cutoff';
import { withTelegramReadDeadline } from './telegram-publication-deadline';
import { BadRequestException } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import type { TelegramInviteLinksResult } from './telegram-invite-links.types';
import { HTMLParser } from 'telegram/extensions/html';
import {
  type StoredTelegramChannelReference,
  type InviteLinksProgressCallback,
  type InviteLinkLoadedCallback,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  asImportableTelegramEntity: TelegramMtprotoChannelResolution['asImportableTelegramEntity'];
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
  getAllChannelInviteLinksInternal: TelegramMtprotoClient['getAllChannelInviteLinksInternal'];
  getTelegramErrorCode: TelegramMtprotoClient['getTelegramErrorCode'];
  logger: TelegramMtprotoClient['logger'];
  resolveStoredChannel: TelegramMtprotoClient['resolveStoredChannel'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toTelegramDate: TelegramMtprotoClient['toTelegramDate'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoChannelHistory {
  constructor(private readonly context: Dependencies) {}

  private readonly maxPostBackfillLimit = 10_000;

  private readonly postCutoffPageSize = 100;

  async getChannelHistorical(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    postLimit?: number;
    postsFrom?: Date | null;
    syncPosts?: boolean;
    syncInviteLinks?: boolean;
    inviteLinksCreatedFrom?: Date | null;
    onInviteLinksProgress?: InviteLinksProgressCallback;
    onInviteLinkLoaded?: InviteLinkLoadedCallback;
  }) {
    return withTelegramReadDeadline({
      timeoutMs: 60_000,
      label: 'Telegram channel history sync',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel)
          : null;
        const entity = resolved
          ? resolved.entity
          : await this.context.withTimeout(
              client.getEntity(params.channelRef as string),
              this.context.telegramResolveTimeoutMs,
              'Telegram history channel lookup',
            );
        const posts =
          params.syncPosts === false
            ? []
            : params.postsFrom
              ? await this.getChannelMessagesFromCutoff(client, entity, {
                  postLimit: params.postLimit,
                  postsFrom: params.postsFrom,
                })
              : await this.context.withTimeout(
                  client.getMessages(entity, {
                    limit: Math.max(
                      1,
                      Math.min(
                        this.maxPostBackfillLimit,
                        params.postLimit || 100,
                      ),
                    ),
                  }),
                  this.context.telegramMetadataTimeoutMs,
                  'Telegram channel history lookup',
                );
        const dailyMap = new Map<
          string,
          {
            date: string;
            viewsCount: number;
            reactionsCount: number;
            forwardsCount: number;
          }
        >();
        for (const post of posts) {
          if (!post?.date) continue;
          const day = new Date(post.date);
          const date = new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
          )
            .toISOString()
            .slice(0, 10);
          const existing = dailyMap.get(date) || {
            date,
            viewsCount: 0,
            reactionsCount: 0,
            forwardsCount: 0,
          };
          const reactionsCount = Array.isArray(post.reactions?.results)
            ? post.reactions.results.reduce(
                (sum: number, row: any) => sum + Number(row?.count || 0),
                0,
              )
            : 0;
          existing.viewsCount += Number(post.views || 0);
          existing.forwardsCount += Number(post.forwards || 0);
          existing.reactionsCount += reactionsCount;
          dailyMap.set(date, existing);
        }

        const inviteLinksResult =
          params.syncInviteLinks === false
            ? null
            : await this.context
                .getAllChannelInviteLinksInternal(
                  client,
                  this.context.asImportableTelegramEntity(entity, 'channel'),
                  params.onInviteLinksProgress,
                  params.onInviteLinkLoaded,
                  params.inviteLinksCreatedFrom ?? null,
                )
                .catch(
                  (error: unknown): TelegramInviteLinksResult => ({
                    scope: 'PARTIAL_ADMINS',
                    expectedTotalLinks: null,
                    admins: [],
                    links: [],
                    warnings: [
                      `Invite-link visibility could not be verified: ${this.context.getTelegramErrorCode(error).match(/^[A-Z][A-Z0-9_]{1,79}$/u)?.[0] ?? 'UNAVAILABLE'}`,
                    ],
                  }),
                );
        const inviteLinks = (inviteLinksResult?.links ?? []).map((inv) => ({
          url: inv.url,
          name: inv.title,
          joinedCount: inv.usage,
          isRevoked: inv.revoked,
        }));

        return {
          channel: resolved?.channel,
          inviteLinks,
          inviteLinksDetailed: inviteLinksResult?.links,
          inviteLinkWarnings: inviteLinksResult?.warnings,
          inviteLinksScope: inviteLinksResult?.scope,
          inviteLinksExpectedTotal: inviteLinksResult?.expectedTotalLinks,
          pendingJoinRequestsCount: inviteLinksResult?.pendingJoinRequestsCount,
          dailyStats: Array.from(dailyMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        };
      },
    });
  }

  async getChannelPostsMetrics(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds?: Array<string | number>;
    postLimit?: number;
    beforeMessageId?: string | number | null;
    postsFrom?: Date | null;
  }) {
    return withTelegramReadDeadline({
      timeoutMs: 60_000,
      label: 'Telegram post metrics read',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: async (client) => {
        const resolved = params.channel
          ? await this.context.resolveStoredChannel(client, params.channel)
          : null;
        const entity = resolved
          ? resolved.entity
          : await this.context.withTimeout(
              client.getEntity(params.channelRef as string),
              this.context.telegramResolveTimeoutMs,
              'Telegram metrics channel lookup',
            );
        const requestedMessageIds = [...new Set(params.messageIds ?? [])];
        const normalizedMessageIds = requestedMessageIds
          .map((messageId) => this.context.toFiniteNumber(messageId))
          .filter(
            (messageId): messageId is number =>
              messageId != null &&
              Number.isInteger(messageId) &&
              messageId > 0 &&
              messageId <= 2_147_483_647,
          );
        if (
          requestedMessageIds.length > 0 &&
          normalizedMessageIds.length !== requestedMessageIds.length
        ) {
          throw new BadRequestException('Invalid Telegram message ID');
        }
        const messages = normalizedMessageIds.length
          ? await this.context.withTimeout(
              client.getMessages(entity, { ids: normalizedMessageIds }),
              this.context.telegramMetadataTimeoutMs,
              'Telegram post lookup by message ID',
            )
          : params.postsFrom
            ? await this.getChannelMessagesFromCutoff(client, entity, {
                postLimit: params.postLimit,
                beforeMessageId: params.beforeMessageId,
                postsFrom: params.postsFrom,
              })
            : await this.context.withTimeout(
                client.getMessages(entity, {
                  limit: Math.max(
                    1,
                    Math.min(
                      this.maxPostBackfillLimit,
                      params.postLimit || 100,
                    ),
                  ),
                  offsetId:
                    this.context.toFiniteNumber(params.beforeMessageId) != null
                      ? Number(
                          this.context.toFiniteNumber(params.beforeMessageId),
                        )
                      : 0,
                }),
                this.context.telegramMetadataTimeoutMs,
                'Telegram post metrics history lookup',
              );

        return messages
          .filter((message) => message?.id && message?.date)
          .map((message) => {
            const postDate = this.context.toTelegramDate(message.date);
            if (!postDate) return null;
            const reactionRows = Array.isArray(message?.reactions?.results)
              ? message.reactions.results
              : [];
            const reactions = reactionRows
              .map((row: any) => {
                const count = this.context.toFiniteNumber(row?.count) ?? 0;
                const rawReaction = row?.reaction;
                const reaction =
                  typeof rawReaction === 'string'
                    ? rawReaction
                    : rawReaction?.emoticon ||
                      rawReaction?.emoticonId ||
                      String(rawReaction || '');
                return { reaction, count };
              })
              .filter(
                (row: { reaction: string; count: number }) => !!row.reaction,
              );
            const reactionsCount = reactions.reduce(
              (sum: number, row: { reaction: string; count: number }) =>
                sum + row.count,
              0,
            );

            return {
              telegramMessageId: String(message.id),
              postDate,
              text: message.message || null,
              formattedText: HTMLParser.unparse(
                String(message.message || ''),
                message.entities || [],
              ),
              hasMedia: Boolean(message.media),
              mediaKind: message.media?.className
                ? String(message.media.className)
                : null,
              viewsCount: this.context.toFiniteNumber(message.views),
              forwardsCount: this.context.toFiniteNumber(message.forwards),
              reactionsCount,
              commentsCount:
                this.context.toFiniteNumber(message?.replies?.replies) ?? 0,
              reactions,
              rawMessage: message,
            };
          })
          .filter((row): row is NonNullable<typeof row> => !!row);
      },
    });
  }

  async getChannelMessagesFromCutoff(
    client: TelegramClient,
    entity: unknown,
    params: TelegramHistoryCutoff,
  ) {
    return readTelegramHistoryFromCutoff(
      (page) =>
        this.context.withTimeout(
          client.getMessages(entity as any, page),
          this.context.telegramMetadataTimeoutMs,
          'Telegram post-history page',
        ),
      params,
      {
        maxPostBackfillLimit: this.maxPostBackfillLimit,
        pageSize: this.postCutoffPageSize,
        toFiniteNumber: (value) => this.context.toFiniteNumber(value),
        toTelegramDate: (value) => this.context.toTelegramDate(value),
      },
    );
  }

  async downloadChannelMessagesMedia(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }) {
    const uniqueMessageIds = [...new Set(params.messageIds)];
    if (uniqueMessageIds.length > 100)
      throw new BadRequestException(
        'Telegram media batch limit is 100 messages.',
      );
    if (!uniqueMessageIds.length) return [];
    const client = await this.context.createClient(params);
    try {
      const resolved = params.channel
        ? await this.context.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const media: Array<{
        messageId: string;
        buffer: Buffer;
        mimeType: string;
      }> = [];
      for (let offset = 0; offset < uniqueMessageIds.length; offset += 25) {
        const chunk = uniqueMessageIds.slice(offset, offset + 25);
        let messages: any[] = [];
        try {
          messages = (await client.getMessages(entity, {
            ids: chunk.map(Number),
          })) as any[];
        } catch (error) {
          this.context.logger.warn(
            `Telegram media message batch unavailable: count=${chunk.length} reason=${error instanceof Error ? error.message : 'unknown error'}`,
          );
          continue;
        }
        const byId = new Map(
          messages
            .filter((message) => message?.id && message?.media)
            .map((message) => [String(message.id), message] as const),
        );
        for (const messageId of chunk) {
          const message = byId.get(messageId);
          if (!message) continue;
          let downloaded: unknown = null;
          try {
            downloaded = await client.downloadMedia(message, {});
          } catch (error) {
            this.context.logger.warn(
              `Telegram media unavailable for message=${messageId}: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            continue;
          }
          if (!Buffer.isBuffer(downloaded)) continue;
          const mimeType = String(
            message.media?.document?.mimeType ||
              (String(message.media?.className || '').includes('Photo')
                ? 'image/jpeg'
                : 'application/octet-stream'),
          );
          media.push({ messageId, buffer: downloaded, mimeType });
        }
      }
      return media;
    } finally {
      await this.context.closeClient(client);
    }
  }
}
