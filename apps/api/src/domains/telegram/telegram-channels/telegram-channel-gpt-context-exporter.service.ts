import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildTelegramGptContextFilename,
  type TelegramPostEngagementMetrics,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TELEGRAM_RICH_FORMATTING_GUIDE } from '../../../telegram/shared/telegram-rich-markup';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import {
  telegramPostEngagementMetrics,
  telegramPostEngagementSelect,
  telegramPostTitle,
  telegramPostUrl,
  type TelegramPostEngagementRow,
} from './telegram-post-engagement';

@Injectable()
export class TelegramChannelGptContextExporter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
  ) {}

  private linkedTelegramMessageIds(post: {
    telegramMessageIds: string[];
    telegramMessageUrls: string[];
  }) {
    return [
      ...new Set([
        ...post.telegramMessageIds,
        ...post.telegramMessageUrls.flatMap((url) => {
          const parsed = parseTelegramPostUrl(url);
          return parsed ? [parsed.messageId] : [];
        }),
      ]),
    ];
  }

  private metricContext(
    metric: TelegramPostEngagementMetrics,
    url: string | null,
  ) {
    const display = (value: number | null) =>
      value == null ? 'unknown' : String(value);
    const percent = (value: number | null) =>
      value == null ? 'unknown' : `${value.toFixed(2)}%`;
    return [
      `telegram_message_id: ${metric.telegramMessageId}`,
      `telegram_url: ${url || 'unavailable'}`,
      `views: ${display(metric.viewsCount)}`,
      `adjusted_views: ${metric.adjustedViewsCount}`,
      `forwards: ${display(metric.forwardsCount)}`,
      `reactions_count: ${display(metric.reactionsCount)}`,
      `adjusted_reactions: ${metric.adjustedReactionsCount}`,
      `comments: ${display(metric.commentsCount)}`,
      `subscribers: ${display(metric.subscriberCount)}`,
      `err: ${percent(metric.err)}`,
      `reaction_rate: ${percent(metric.reactionRate)}`,
      `forward_rate: ${percent(metric.forwardRate)}`,
      `comment_rate: ${percent(metric.commentRate)}`,
      `reactions: ${metric.reactions ? JSON.stringify(metric.reactions) : '[]'}`,
    ].join('\n');
  }

  private async subscriberCountsAtPublication(
    workspaceId: string,
    channelId: string,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ telegramPostId: string; subscriberCount: number | null }>
    >(Prisma.sql`
      SELECT
        post."id" AS "telegramPostId",
        audience."subscribersCount" AS "subscriberCount"
      FROM "TelegramPost" AS post
      LEFT JOIN LATERAL (
        SELECT snapshot."subscribersCount"
        FROM "TelegramChannelAudienceSnapshot" AS snapshot
        WHERE snapshot."workspaceId" = ${workspaceId}
          AND snapshot."telegramChannelId" = ${channelId}
          AND snapshot."subscribersCount" IS NOT NULL
          AND snapshot."collectedAt" <= post."postDate"
        ORDER BY snapshot."collectedAt" DESC, snapshot."id" DESC
        LIMIT 1
      ) AS audience ON TRUE
      WHERE post."workspaceId" = ${workspaceId}
        AND post."telegramChannelId" = ${channelId}
    `);
    return new Map(
      rows.map((row) => [row.telegramPostId, row.subscriberCount] as const),
    );
  }

  async export(userId: string, channelId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const [
      channel,
      managedPosts,
      telegramPosts,
      links,
      groups,
      subscriberCountByTelegramPostId,
    ] = await Promise.all([
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId },
        select: {
          id: true,
          title: true,
          username: true,
          telegramChatId: true,
          currentSubscribersCount: true,
          ownViewsPerPost: true,
          ownReactionsPerPost: true,
        },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        select: {
          id: true,
          title: true,
          status: true,
          imageUrls: true,
          text: true,
          createdAt: true,
          telegramMessageIds: true,
          telegramMessageUrls: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        select: telegramPostEngagementSelect,
        orderBy: [{ postDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.telegramChannelCustomEmojiPack.findMany({
        where: { channelId, pack: { workspaceId } },
        select: {
          pack: {
            select: {
              title: true,
              shortName: true,
              telegramLink: true,
              emojis: {
                orderBy: { position: 'asc' },
                select: { documentId: true, alt: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.postGroup.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
      this.subscriberCountsAtPublication(workspaceId, channelId),
    ]);
    if (!channel) throw new NotFoundException('Telegram channel not found.');

    const typedTelegramPosts = telegramPosts as TelegramPostEngagementRow[];
    const telegramPostByMessageId = new Map(
      typedTelegramPosts.map((post) => [post.telegramMessageId, post]),
    );
    const matchedTelegramPostIds = new Set<string>();
    const engagementFor = (post: TelegramPostEngagementRow) =>
      telegramPostEngagementMetrics(
        post,
        channel,
        subscriberCountByTelegramPostId.get(post.id) ?? null,
      );
    const managedPostBlocks = managedPosts.map((post) => {
      const metrics = this.linkedTelegramMessageIds(post).flatMap(
        (messageId) => {
          const telegramPost = telegramPostByMessageId.get(messageId);
          if (!telegramPost || matchedTelegramPostIds.has(telegramPost.id)) {
            return [];
          }
          matchedTelegramPostIds.add(telegramPost.id);
          return [
            this.metricContext(
              engagementFor(telegramPost),
              telegramPostUrl(channel, telegramPost.telegramMessageId),
            ),
          ];
        },
      );
      return `POST\nid: ${post.id}\nreference: tg-post:${post.id}\ntitle: ${post.title}\nstatus: ${post.status}\nimages:\n${post.imageUrls.length ? post.imageUrls.map((url) => `- ${url}`).join('\n') : '[]'}\nengagement:\n${metrics.length ? metrics.join('\n---\n') : 'unavailable'}\ntext:\n${post.text || ''}`;
    });
    const importedPostBlocks = typedTelegramPosts
      .filter((post) => !matchedTelegramPostIds.has(post.id))
      .map((post) => {
        const url = telegramPostUrl(channel, post.telegramMessageId);
        return `POST\nid: telegram-post:${post.id}\nreference: telegram-source-post:${post.id}\ntitle: ${telegramPostTitle(post)}\nstatus: PUBLISHED\nsource: synchronized_telegram\nimages:\n${post.hasMedia ? `media: ${post.mediaKind || 'present'}` : '[]'}\nengagement:\n${this.metricContext(engagementFor(post), url)}\ntext:\n${post.text || post.formattedText || ''}`;
      });

    const exportedAt = new Date();
    const content = [
      'TELEGRAM GPT CONTEXT',
      'FORMAT VERSION: 3',
      `CHANNEL: ${channel.title}`,
      `CHANNEL_ID: ${channel.id}`,
      `EXPORTED_AT: ${exportedAt.toISOString()}`,
      '',
      'GPT RULES',
      'This is the canonical source of truth for this channel. Return canonical post text exactly; do not change tg-post IDs; do not invent Premium Emoji document IDs. Engagement metrics show which published posts resonated with the audience. Subscribers and ERR use the last recorded audience snapshot at or before each post publication; unknown means no audience history existed yet. Only managed posts with a tg-post:<id> reference may be used as internal tg-post links; telegram-source-post references are read-only analytics context.',
      '',
      'ALL FORMATTING',
      TELEGRAM_RICH_FORMATTING_GUIDE,
      '',
      'PREMIUM EMOJI',
      ...links.flatMap(({ pack }) => [
        `PACK\ntitle: ${pack.title}\nshort_name: ${pack.shortName}\ntelegram_link: ${pack.telegramLink}`,
        ...pack.emojis.map(
          (emoji) =>
            `EMOJI\nid: ${emoji.documentId}\nalt: ${emoji.alt}\nsyntax: ![${emoji.alt}](tg://emoji?id=${emoji.documentId})`,
        ),
      ]),
      '',
      'POST GROUPS',
      ...(groups.length
        ? groups.map((group) => `- ${group.title} — ${group.id}`)
        : ['[]']),
      '',
      'MANAGED POST IMPORT JSON',
      'Return a JSON array with title, text, icon, urls, groupId, scheduledAt, imported, approved, imageSearch. For new generated posts use imported: false and approved: false. Use an exact groupId from POST GROUPS; use groupId: null when no group is needed. Never invent an ID.',
      '[{"title":"Post title","text":"Telegram-ready post text","icon":"🔥","urls":[],"groupId":null,"scheduledAt":null,"imported":false,"approved":false,"imageSearch":[]}]',
      '',
      'ALL POSTS',
      ...managedPostBlocks,
      ...importedPostBlocks,
    ].join('\n\n');
    return {
      buffer: Buffer.from(`${content}\n`, 'utf8'),
      filename: buildTelegramGptContextFilename(channel.title, exportedAt),
    };
  }
}
