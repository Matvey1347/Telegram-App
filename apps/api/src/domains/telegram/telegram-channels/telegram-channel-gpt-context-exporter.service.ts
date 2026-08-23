import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostOrigin,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import {
  buildTelegramCalendarPlanInstructionFilename,
  buildTelegramGptContextFilename,
  type TelegramPostEngagementMetrics,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TELEGRAM_RICH_FORMATTING_GUIDE } from '../../../telegram/shared/telegram-rich-markup';
import { extractInternalPostLinkIds } from '../../../telegram/shared/internal-post-links';
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

  private localDateTime(value: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }

  private calendarPostBlock(
    post: {
      id: string;
      title: string;
      status: string;
      group: { title: string } | null;
      text: string | null;
      createdAt: Date;
    },
    availability: 'AVAILABLE' | 'BLOCKED',
    reasons: string[],
  ) {
    return [
      'POST',
      `postId: ${post.id}`,
      `availability: ${availability}`,
      `reasons: ${reasons.length ? reasons.join('; ') : 'none'}`,
      `status: ${post.status}`,
      `group: ${post.group?.title || 'Ungrouped'}`,
      `created_at: ${post.createdAt.toISOString()}`,
      'text:',
      post.text || '',
    ].join('\n');
  }

  private calendarOccupiedPostBlock(post: {
    id: string;
    title: string;
    text: string | null;
    imageUrls: string[];
    scheduledAt: Date;
  }) {
    const imageUrls = post.imageUrls.filter((url) => /^https?:\/\//i.test(url));
    return [
      'OCCUPIED POST',
      `scheduled_at: ${post.scheduledAt.toISOString()}`,
      `postId: ${post.id}`,
      `title: ${post.title}`,
      'images:',
      ...(imageUrls.length ? imageUrls.map((url) => `- ${url}`) : ['[]']),
      'text:',
      post.text || '',
    ].join('\n');
  }

  async exportCalendarPlanInstruction(
    userId: string,
    channelId: string,
    exportedAt = new Date(),
  ) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const historyFrom = new Date(exportedAt.getTime() - 30 * 24 * 60 * 60_000);
    const horizonEnd = new Date(exportedAt.getTime() + 30 * 24 * 60 * 60_000);
    const [channel, workspace, managedPosts, publishedHistory] =
      await Promise.all([
        this.prisma.telegramChannel.findFirst({
          where: { id: channelId, workspaceId },
          select: {
            id: true,
            title: true,
            telegramChatId: true,
            timePosts: {
              select: { id: true, title: true, time: true, position: true },
              orderBy: [{ position: 'asc' }, { time: 'asc' }],
            },
          },
        }),
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { timezone: true },
        }),
        this.prisma.telegramManagedPost.findMany({
          where: { workspaceId, telegramChannelId: channelId },
          select: {
            id: true,
            title: true,
            text: true,
            imageUrls: true,
            origin: true,
            status: true,
            scheduledAt: true,
            createdAt: true,
            telegramRemoteStatus: true,
            telegramIdVerificationStatus: true,
            telegramMessageIds: true,
            lastError: true,
            group: { select: { title: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.telegramPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            postDate: { gte: historyFrom, lte: exportedAt },
          },
          select: {
            id: true,
            postDate: true,
            text: true,
            formattedText: true,
            hasMedia: true,
          },
          orderBy: [{ postDate: 'desc' }, { id: 'desc' }],
          take: 60,
        }),
      ]);
    if (!channel) throw new NotFoundException('Telegram channel not found.');
    const timezone = workspace?.timezone || 'Europe/Warsaw';
    const managedPostById = new Map(
      managedPosts.map((post) => [post.id, post] as const),
    );
    const available: string[] = [];
    const blocked: string[] = [];
    const excluded: string[] = [];
    for (const post of managedPosts) {
      if (
        post.origin !== TelegramManagedPostOrigin.SYSTEM ||
        (post.status !== TelegramManagedPostStatus.DRAFT &&
          post.status !== TelegramManagedPostStatus.FAILED)
      ) {
        excluded.push(
          `- ${post.id} — ${post.title} — ${post.origin}/${post.status}`,
        );
        continue;
      }
      const reasons: string[] = [];
      if (!post.text?.trim()) reasons.push('post text is empty');
      for (const targetId of extractInternalPostLinkIds(post.text || '')) {
        const target = managedPostById.get(targetId);
        if (targetId === post.id) {
          reasons.push(`internal link ${targetId} points to the same post`);
        } else if (!target) {
          reasons.push(`internal link target ${targetId} was not found`);
        } else if (target.status !== TelegramManagedPostStatus.PUBLISHED) {
          reasons.push(
            `internal link target "${target.title}" is not published`,
          );
        } else if (
          target.telegramRemoteStatus !==
          TelegramManagedPostRemoteStatus.PUBLISHED
        ) {
          reasons.push(
            `internal link target "${target.title}" is not confirmed as published in Telegram`,
          );
        } else if (
          target.telegramIdVerificationStatus !==
          TelegramManagedPostIdVerificationStatus.VERIFIED
        ) {
          reasons.push(
            `internal link target "${target.title}" has no verified Telegram ID`,
          );
        } else if (
          !target.telegramMessageIds.length ||
          !channel.telegramChatId
        ) {
          reasons.push(
            `internal link target "${target.title}" has no stable Telegram URL`,
          );
        } else if (target.lastError) {
          reasons.push(
            `internal link target "${target.title}" has an error: ${target.lastError}`,
          );
        }
      }
      const block = this.calendarPostBlock(
        post,
        reasons.length ? 'BLOCKED' : 'AVAILABLE',
        reasons,
      );
      (reasons.length ? blocked : available).push(block);
    }
    const occupied = managedPosts
      .filter(
        (post) =>
          post.status === TelegramManagedPostStatus.SCHEDULED &&
          post.scheduledAt &&
          post.scheduledAt > exportedAt &&
          post.scheduledAt <= horizonEnd,
      )
      .map((post) =>
        this.calendarOccupiedPostBlock({
          ...post,
          scheduledAt: post.scheduledAt!,
        }),
      );
    const history = [...publishedHistory].reverse().map((post) => {
      const text = post.text || post.formattedText || '';
      return `PUBLISHED\nlocal_time: ${this.localDateTime(post.postDate, timezone)}\nsource_id: ${post.id}\nhas_media: ${post.hasMedia}\ntext:\n${text}`;
    });
    const planningFrom = this.localDateTime(exportedAt, timezone).slice(0, 10);
    const planningTo = this.localDateTime(horizonEnd, timezone).slice(0, 10);
    const content = [
      'TELEGRAM CALENDAR PLAN — GPT INSTRUCTION',
      'FORMAT VERSION: 2',
      `CHANNEL: ${channel.title}`,
      `CHANNEL_ID: ${channel.id}`,
      `TIMEZONE: ${timezone}`,
      `EXPORTED_AT: ${exportedAt.toISOString()}`,
      `PLANNING_WINDOW: ${planningFrom} through ${planningTo}`,
      '',
      'TASK',
      'Build a Telegram publication plan using only AVAILABLE POSTS and only the stable publication times listed below. Choose post order and time by learning from RECENT PUBLISHED HISTORY. Avoid repeating similar topics consecutively. Never invent a post ID or publication time.',
      '',
      'MANDATORY OUTPUT',
      'Return only valid JSON without markdown fences or commentary.',
      'Schema: {"items":[{"postId":"exact available post ID","scheduledAt":"ISO 8601 timestamp with the correct explicit UTC offset"}]}',
      'Use every post at most once. Use every timestamp at most once. Keep every timestamp inside PLANNING_WINDOW, in TIMEZONE, and at an exact STABLE PUBLICATION TIME. Do not use FUTURE OCCUPIED TIMES. If no valid assignment exists, return {"items":[]}.',
      '',
      'STABLE PUBLICATION TIMES',
      ...(channel.timePosts.length
        ? channel.timePosts.map(
            (slot) => `- ${slot.time} — ${slot.title} — slot_id: ${slot.id}`,
          )
        : ['[] — no publication times are configured; return {"items":[]}']),
      '',
      'FUTURE OCCUPIED TIMES',
      ...(occupied.length ? occupied : ['[]']),
      '',
      `AVAILABLE POSTS (${available.length})`,
      ...(available.length ? available : ['[]']),
      '',
      `BLOCKED POSTS (${blocked.length})`,
      'Blocked posts must never be included in the returned plan.',
      ...(blocked.length ? blocked : ['[]']),
      '',
      `EXCLUDED POSTS (${excluded.length})`,
      'These posts are already scheduled/published, read-only imports, or otherwise outside the candidate pool.',
      ...(excluded.length ? excluded : ['[]']),
      '',
      `RECENT PUBLISHED HISTORY — LAST 30 DAYS, MAX 60 (${history.length})`,
      ...(history.length ? history : ['[]']),
    ].join('\n\n');
    return {
      buffer: Buffer.from(`${content}\n`, 'utf8'),
      filename: buildTelegramCalendarPlanInstructionFilename(
        channel.title,
        exportedAt,
      ),
    };
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
          groupId: true,
          imageUrls: true,
          text: true,
          createdAt: true,
          scheduledAt: true,
          publishedAt: true,
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
    const groupTitleById = new Map(
      groups.map((group) => [group.id, group.title] as const),
    );
    const groupStats = new Map<
      string | null,
      { total: number; statuses: Map<string, number> }
    >();
    for (const post of managedPosts) {
      const stats = groupStats.get(post.groupId) ?? {
        total: 0,
        statuses: new Map<string, number>(),
      };
      stats.total += 1;
      stats.statuses.set(
        post.status,
        (stats.statuses.get(post.status) ?? 0) + 1,
      );
      groupStats.set(post.groupId, stats);
    }
    const groupContext = (
      id: string | null,
      title: string,
      stats = groupStats.get(id),
    ) => {
      const statuses = stats
        ? [...stats.statuses.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([status, count]) => `${status}=${count}`)
            .join(', ')
        : 'none';
      return `- ${title} — ${id ?? 'null'} — posts: ${stats?.total ?? 0} — statuses: ${statuses}`;
    };
    const groupSummaryLines = [
      ...groups.map((group) =>
        groupContext(group.id, group.title, groupStats.get(group.id)),
      ),
      ...(groupStats.has(null)
        ? [groupContext(null, 'Ungrouped', groupStats.get(null))]
        : []),
    ];
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
    const permanentImageUrls = (urls: string[] | undefined) =>
      (urls ?? []).filter((url) => /^https?:\/\//i.test(url));
    const managedPostBlocks = managedPosts.map((post) => {
      const linkedTelegramPosts = this.linkedTelegramMessageIds(post).flatMap(
        (messageId) => {
          const telegramPost = telegramPostByMessageId.get(messageId);
          if (!telegramPost || matchedTelegramPostIds.has(telegramPost.id)) {
            return [];
          }
          matchedTelegramPostIds.add(telegramPost.id);
          return [telegramPost];
        },
      );
      const metrics = linkedTelegramPosts.map((telegramPost) =>
        this.metricContext(
          engagementFor(telegramPost),
          telegramPostUrl(channel, telegramPost.telegramMessageId),
        ),
      );
      const linkedPublishedAt = linkedTelegramPosts
        .map((telegramPost) => telegramPost.postDate)
        .sort((left, right) => left.getTime() - right.getTime())[0];
      const publishedAt = post.publishedAt ?? linkedPublishedAt ?? null;
      const imageUrls = permanentImageUrls(post.imageUrls);
      return `POST\nid: ${post.id}\nreference: tg-post:${post.id}\ntitle: ${post.title}\nstatus: ${post.status}\npublished_at: ${publishedAt?.toISOString() ?? 'null'}\nscheduled_at: ${post.scheduledAt?.toISOString() ?? 'null'}\ngroup_id: ${post.groupId ?? 'null'}\ngroup_title: ${post.groupId ? (groupTitleById.get(post.groupId) ?? 'unknown') : 'Ungrouped'}\nimages:\n${imageUrls.length ? imageUrls.map((url) => `- ${url}`).join('\n') : '[]'}\nengagement:\n${metrics.length ? metrics.join('\n---\n') : 'unavailable'}\ntext:\n${post.text || ''}`;
    });
    const importedPostBlocks = typedTelegramPosts
      .filter((post) => !matchedTelegramPostIds.has(post.id))
      .map((post) => {
        const url = telegramPostUrl(channel, post.telegramMessageId);
        const imageUrls = permanentImageUrls(post.imageUrls);
        const imageContext = imageUrls.length
          ? imageUrls.map((imageUrl) => `- ${imageUrl}`).join('\n')
          : post.hasMedia &&
              post.mediaKind &&
              !/photo|image/i.test(post.mediaKind)
            ? `[]\nmedia: ${post.mediaKind}`
            : '[]';
        return `POST\nid: telegram-post:${post.id}\nreference: telegram-source-post:${post.id}\ntitle: ${telegramPostTitle(post)}\nstatus: PUBLISHED\npublished_at: ${post.postDate.toISOString()}\nscheduled_at: null\ngroup_id: null\ngroup_title: Ungrouped\nsource: synchronized_telegram\nimages:\n${imageContext}\nengagement:\n${this.metricContext(engagementFor(post), url)}\ntext:\n${post.text || post.formattedText || ''}`;
      });

    const exportedAt = new Date();
    const content = [
      'TELEGRAM GPT CONTEXT',
      'FORMAT VERSION: 5',
      `CHANNEL: ${channel.title}`,
      `CHANNEL_ID: ${channel.id}`,
      `EXPORTED_AT: ${exportedAt.toISOString()}`,
      '',
      'GPT RULES',
      'This is the canonical source of truth for this channel. Return canonical post text exactly; do not change tg-post IDs; do not invent Premium Emoji document IDs. published_at is the actual Telegram publication time when known; scheduled_at is the reserved publication time when present. Engagement metrics show which published posts resonated with the audience. Subscribers and ERR use the last recorded audience snapshot at or before each post publication; unknown means no audience history existed yet. Only managed posts with a tg-post:<id> reference may be used as internal tg-post links; telegram-source-post references are read-only analytics context.',
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
      ...(groupSummaryLines.length ? groupSummaryLines : ['[]']),
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
