import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  extractInternalPostLinkIds,
  replaceInternalPostLinks,
} from '../../../telegram/shared/internal-post-links';
import { parseTelegramHtml } from '../../../telegram/shared/telegram-html-parser';
import {
  telegramHtmlToManagedMarkup,
  telegramMarkupToHtml,
} from '../../../telegram/shared/telegram-markup';
import { buildStableTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import {
  MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE,
  managedPostIdentityCandidateWhere,
  managedPostIdentityReadyWhere,
} from '../../operations/scheduled-tasks/due-work-predicates';
import { telegramPostsBadRequest } from './telegram-posts.errors';

export type ManagedPostIdentityMessage = {
  id: string;
  text: string;
  date: string | null;
  hasMedia: boolean;
  groupedId: string | null;
  html?: string;
};

type IdentityCandidate = {
  text: string | null;
  imageCount: number;
  publishMode: string | null;
  scheduledAt: Date | null;
};

type ManagedPostIdentityReconcileSummary = {
  checked: number;
  verified: number;
  corrected: number;
  manualMismatch: number;
  missing: number;
  skipped: number;
};

@Injectable()
export class TelegramManagedPostIdentityService {
  private readonly publicationMatchWindowMs = 6 * 60 * 60 * 1000;
  readonly dependentRepairPendingNote =
    MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE;

  constructor(private readonly prisma?: PrismaService) {}

  normalizedPlainText(value: string) {
    const safe = (value || '').replace(
      /\[([^\]\n]+)\]\(tg-post:[a-zA-Z0-9_-]+\)/g,
      '$1',
    );
    const [plain] = parseTelegramHtml(telegramMarkupToHtml(safe));
    return plain.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  findPublishedIdentity(
    post: IdentityCandidate,
    recentPublished: ManagedPostIdentityMessage[],
  ) {
    const expected = this.normalizedPlainText(post.text || '');
    if (!expected) return null;
    const ordered = [...recentPublished].sort(
      (left, right) => Number(left.id) - Number(right.id),
    );
    const matches: Array<{
      messageIds: string[];
      matchedMessage: ManagedPostIdentityMessage;
    }> = [];
    for (let start = 0; start < ordered.length; start += 1) {
      for (
        let end = start;
        end < Math.min(ordered.length, start + post.imageCount + 10);
        end += 1
      ) {
        const sequence = ordered.slice(start, end + 1);
        const dated = sequence.filter((message) => message.date);
        if (
          dated.length > 1 &&
          new Date(dated[dated.length - 1].date!).getTime() -
            new Date(dated[0].date!).getTime() >
            120_000
        ) {
          break;
        }
        const visible = sequence
          .map((message) => message.text || '')
          .filter(Boolean)
          .join('\n\n');
        if (this.normalizedPlainText(visible) !== expected) continue;
        const matched = sequence.findLast((message) => Boolean(message.text));
        if (!matched) continue;
        if (post.scheduledAt && matched.date) {
          const distance = Math.abs(
            new Date(matched.date).getTime() - post.scheduledAt.getTime(),
          );
          if (distance > this.publicationMatchWindowMs) continue;
        }
        const media = sequence.filter((message) => message.hasMedia);
        if (media.length !== post.imageCount) continue;
        if (
          post.imageCount > 1 &&
          media.some((message) => message.groupedId) &&
          new Set(media.map((message) => message.groupedId)).size !== 1
        ) {
          continue;
        }
        if (
          post.publishMode === 'IMAGES_THEN_TEXT' &&
          post.imageCount > 0 &&
          !sequence.some((message) => !message.hasMedia && message.text)
        ) {
          continue;
        }
        matches.push({
          messageIds: sequence.map((message) => message.id),
          matchedMessage: matched,
        });
      }
    }
    const unique = [
      ...new Map(
        matches.map((match) => [match.messageIds.join(','), match] as const),
      ).values(),
    ];
    return unique.length === 1 ? unique[0] : null;
  }

  primaryMessageId(messageIds: string[], imageCount: number) {
    if (!messageIds.length) return null;
    if (imageCount > 1) {
      return messageIds[Math.min(imageCount - 1, messageIds.length - 1)];
    }
    return messageIds[0];
  }

  findLegacyPublishedIdentity(
    post: { title: string; text: string | null; publishMode: string | null },
    recentPublished: ManagedPostIdentityMessage[],
  ) {
    const normalizeSearch = (value: string) =>
      value
        .toLowerCase()
        .replace(/^\s*\d+(?:[.)]\d+)*(?:[.)])?\s*/g, '')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const normalizedTitle = normalizeSearch(post.title);
    const titleClue =
      normalizedTitle &&
      normalizedTitle !== 'pinned' &&
      (normalizedTitle.split(' ').length >= 2 || normalizedTitle.length >= 8)
        ? normalizedTitle
        : null;
    const normalizedLocal = this.normalizedPlainText(post.text || '');
    const byExactText = normalizedLocal
      ? recentPublished.find(
          (message) =>
            this.normalizedPlainText(message.text || '') === normalizedLocal,
        )
      : null;
    const byTitle = titleClue
      ? recentPublished.find((message) =>
          normalizeSearch(message.text || '').includes(titleClue),
        )
      : null;
    const matched = byExactText ?? byTitle ?? null;
    if (!matched) return null;
    const previousMedia =
      post.publishMode === 'IMAGES_THEN_TEXT'
        ? recentPublished.find(
            (candidate) =>
              candidate.hasMedia &&
              candidate.date === matched.date &&
              Number(candidate.id) < Number(matched.id),
          )
        : null;
    return {
      messageIds: [previousMedia?.id, matched.id].filter((id): id is string =>
        Boolean(id),
      ),
      matchedMessage: matched,
      remoteText: telegramHtmlToManagedMarkup(matched.html || ''),
    };
  }

  async resolveInternalLinks(params: {
    workspaceId: string;
    currentPostId: string;
    text: string;
    currentScheduleAt?: Date;
  }) {
    if (!this.prisma) throw new Error('Prisma is required for link resolution');
    const targetIds = extractInternalPostLinkIds(params.text);
    if (!targetIds.length) return params.text;
    if (targetIds.includes(params.currentPostId)) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_EDITABLE',
        'Cannot publish post because it contains an internal link to itself.',
      );
    }
    const targets = await this.prisma.telegramManagedPost.findMany({
      where: { workspaceId: params.workspaceId, id: { in: targetIds } },
      select: {
        id: true,
        title: true,
        status: true,
        telegramRemoteStatus: true,
        lastError: true,
        scheduledAt: true,
        imageUrls: true,
        telegramMessageIds: true,
        telegramIdVerificationStatus: true,
        telegramChannel: { select: { telegramChatId: true } },
      },
    });
    const byId = new Map(targets.map((target) => [target.id, target]));
    const errors = targetIds.flatMap((targetId) => {
      const target = byId.get(targetId);
      if (!target) return [`${targetId}: post was not found`];
      if (
        params.currentScheduleAt &&
        target.status === TelegramManagedPostStatus.SCHEDULED &&
        target.telegramRemoteStatus ===
          TelegramManagedPostRemoteStatus.SCHEDULED &&
        target.telegramIdVerificationStatus !==
          TelegramManagedPostIdVerificationStatus.MISSING
      ) {
        return !target.scheduledAt ||
          target.scheduledAt.getTime() >= params.currentScheduleAt.getTime()
          ? [
              `"${target.title}" (${target.id}) must be scheduled before the post that links to it`,
            ]
          : [];
      }
      const publishedAndVerified =
        target.status === TelegramManagedPostStatus.PUBLISHED &&
        target.telegramIdVerificationStatus ===
          TelegramManagedPostIdVerificationStatus.VERIFIED &&
        target.telegramRemoteStatus === TelegramManagedPostRemoteStatus.PUBLISHED;
      if (!publishedAndVerified) {
        return [
          `"${target.title}" (${target.id}) is not published or has a broken Telegram link`,
        ];
      }
      const primaryId = this.primaryMessageId(
        target.telegramMessageIds,
        target.imageUrls.length,
      );
      return primaryId &&
        buildStableTelegramPostUrl({
          telegramChatId: target.telegramChannel.telegramChatId,
          messageId: primaryId,
        })
        ? []
        : [
            'Target channel has no stable Telegram channel ID. Sync or re-import the channel.',
          ];
    });
    if (errors.length) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_PUBLISH_FAILED',
        `Cannot publish post because some internal post links are unresolved: ${errors.join('; ')}.`,
        { unresolvedCount: errors.length },
      );
    }
    const urls = new Map<string, string>();
    for (const target of targets) {
      if (
        target.status !== TelegramManagedPostStatus.PUBLISHED ||
        target.telegramIdVerificationStatus !==
          TelegramManagedPostIdVerificationStatus.VERIFIED
      ) {
        continue;
      }
      const primaryId = this.primaryMessageId(
        target.telegramMessageIds,
        target.imageUrls.length,
      );
      const url = primaryId
        ? buildStableTelegramPostUrl({
            telegramChatId: target.telegramChannel.telegramChatId,
            messageId: primaryId,
          })
        : null;
      if (url) urls.set(target.id, url);
    }
    const rendered = replaceInternalPostLinks(params.text, urls);
    return params.currentScheduleAt
      ? rendered.replace(/\[([^\]\n]+)\]\(tg-post:[a-zA-Z0-9_-]+\)/g, '$1')
      : rendered;
  }

  async updateIdentityIfUnchanged(
    post: {
      id: string;
      telegramLinkSource: TelegramManagedPostLinkSource;
      telegramMessageIds: string[];
      telegramScheduledMessageIds: string[];
    },
    data: Record<string, unknown>,
    targetDelegate?: unknown,
  ) {
    if (!this.prisma) return false;
    const delegate = (targetDelegate ??
      this.prisma.telegramManagedPost) as unknown as {
      updateMany?: (
        args: Record<string, unknown>,
      ) => Promise<{ count: number }>;
      update: (args: Record<string, unknown>) => Promise<unknown>;
    };
    if (delegate.updateMany) {
      const result = await delegate.updateMany({
        where: {
          id: post.id,
          telegramLinkSource: post.telegramLinkSource,
          telegramMessageIds: { equals: post.telegramMessageIds },
          telegramScheduledMessageIds: {
            equals: post.telegramScheduledMessageIds,
          },
        },
        data,
      });
      return result.count === 1;
    }
    await delegate.update({ where: { id: post.id }, data });
    return true;
  }

  async repairDependants(params: {
    workspaceId: string;
    channelId: string;
    targetPostId: string;
    publishedAt: Date;
    reschedule: (post: {
      id: string;
      scheduledAt: Date;
      publishMode: string | null;
    }) => Promise<unknown>;
  }) {
    if (!this.prisma) throw new Error('Prisma is required for repair');
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          status: TelegramManagedPostStatus.SCHEDULED,
          scheduledAt: { gt: params.publishedAt },
          text: { contains: `tg-post:${params.targetPostId}` },
        },
        select: { id: true, text: true, scheduledAt: true, publishMode: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const post of page) {
        if (
          post.scheduledAt &&
          extractInternalPostLinkIds(post.text || '').includes(
            params.targetPostId,
          )
        ) {
          await params.reschedule({
            id: post.id,
            scheduledAt: post.scheduledAt,
            publishMode: post.publishMode,
          });
        }
      }
      if (page.length < 100) break;
      cursor = page[page.length - 1].id;
    }
  }

  async pendingWorkspaceIds() {
    if (!this.prisma) return [];
    const rows = await this.prisma.telegramManagedPost.findMany({
      where: {
        ...managedPostIdentityCandidateWhere(new Date()),
      },
      select: { workspaceId: true, telegramIdLastCheckedAt: true },
      orderBy: [{ telegramIdLastCheckedAt: 'asc' }, { workspaceId: 'asc' }],
      take: 500,
    });
    return [...new Set(rows.map((row) => row.workspaceId))];
  }

  async reconcilePendingWorkspaces(
    reconcileWorkspace: (
      workspaceId: string,
    ) => Promise<ManagedPostIdentityReconcileSummary>,
  ) {
    const total = { checked: 0, verified: 0, missing: 0 };
    for (const workspaceId of await this.pendingWorkspaceIds()) {
      const result = await reconcileWorkspace(workspaceId);
      total.checked += result.checked;
      total.verified += result.verified;
      total.missing += result.missing;
    }
    return total;
  }

  async reconcilePublishedChannel(
    reconcilePage: () => Promise<ManagedPostIdentityReconcileSummary>,
  ) {
    const total = {
      checked: 0,
      verified: 0,
      corrected: 0,
      manualMismatch: 0,
      missing: 0,
      skipped: 0,
    };
    for (;;) {
      const page = await reconcilePage();
      for (const key of Object.keys(total) as Array<keyof typeof total>) {
        total[key] += page[key];
      }
      if (page.checked < 100 || page.skipped === page.checked) return total;
    }
  }

  async reconcile(params: {
    workspaceId: string;
    channelId?: string;
    postId?: string;
    explicit?: boolean;
    publishedOnly?: boolean;
    loadRemote: (
      channelId: string,
      posts: any[],
    ) => Promise<{
      published: ManagedPostIdentityMessage[];
      recentPublished: ManagedPostIdentityMessage[];
    }>;
    repairDependants: (
      workspaceId: string,
      channelId: string,
      postId: string,
      publishedAt: Date,
    ) => Promise<void>;
  }) {
    if (!this.prisma) throw new Error('Prisma is required for reconciliation');
    const now = new Date();
    let posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...(params.channelId ? { telegramChannelId: params.channelId } : {}),
        ...(params.postId ? { id: params.postId } : {}),
        ...(params.explicit
          ? {
              status: params.publishedOnly
                ? TelegramManagedPostStatus.PUBLISHED
                : { in: ['SCHEDULED', 'PUBLISHED'] },
              ...(params.publishedOnly
                ? {
                    telegramIdVerificationStatus:
                      TelegramManagedPostIdVerificationStatus.UNVERIFIED,
                  }
                : {}),
            }
          : {
              ...managedPostIdentityReadyWhere(now),
            }),
      },
      include: { telegramChannel: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: params.explicit ? 100 : 25,
    });
    if (!params.explicit && this.prisma.telegramManagedPost.updateMany) {
      const claimed = [] as typeof posts;
      for (const post of posts) {
        const claim = await this.prisma.telegramManagedPost.updateMany({
          where: {
            id: post.id,
            telegramIdVerificationStatus:
              TelegramManagedPostIdVerificationStatus.UNVERIFIED,
            OR: [
              { telegramIdLastCheckedAt: null },
              {
                telegramIdLastCheckedAt: {
                  lte: new Date(now.getTime() - 45_000),
                },
              },
            ],
          },
          data: { telegramIdLastCheckedAt: now },
        });
        if (claim.count === 1) claimed.push(post);
      }
      posts = claimed;
    }
    const result = {
      checked: 0,
      verified: 0,
      corrected: 0,
      manualMismatch: 0,
      missing: 0,
      skipped: 0,
    };
    const byChannel = new Map<string, typeof posts>();
    for (const post of posts) {
      byChannel.set(post.telegramChannelId, [
        ...(byChannel.get(post.telegramChannelId) ?? []),
        post,
      ]);
    }
    for (const [channelId, channelPosts] of byChannel) {
      let remote;
      try {
        remote = await params.loadRemote(channelId, channelPosts);
      } catch (error) {
        if (params.explicit) throw error;
        result.skipped += channelPosts.length;
        continue;
      }
      for (const post of channelPosts) {
        result.checked += 1;
        const match = this.findPublishedIdentity(
          {
            text: post.text,
            imageCount: post.imageUrls.length,
            publishMode: post.publishMode,
            scheduledAt: post.scheduledAt ?? post.publishedAt,
          },
          remote.recentPublished,
        );
        const currentIdsMatch =
          Boolean(match) &&
          match!.messageIds.length === post.telegramMessageIds.length &&
          match!.messageIds.every(
            (id, index) => id === post.telegramMessageIds[index],
          );
        const checkedAt = new Date();
        if (post.telegramLinkSource === TelegramManagedPostLinkSource.MANUAL) {
          const verification = currentIdsMatch
            ? TelegramManagedPostIdVerificationStatus.VERIFIED
            : match
              ? TelegramManagedPostIdVerificationStatus.MISMATCH
              : TelegramManagedPostIdVerificationStatus.MISSING;
          const updated = await this.updateIdentityIfUnchanged(post, {
            telegramIdVerificationStatus: verification,
            telegramIdVerifiedAt: currentIdsMatch ? checkedAt : null,
            telegramIdLastCheckedAt: checkedAt,
          });
          if (!updated) {
            result.skipped += 1;
            continue;
          }
          if (verification === 'VERIFIED') result.verified += 1;
          else if (verification === 'MISMATCH') result.manualMismatch += 1;
          else result.missing += 1;
          continue;
        }
        if (!match) {
          const graceExpired =
            params.explicit ||
            Boolean(
              post.scheduledAt &&
              checkedAt.getTime() - post.scheduledAt.getTime() >= 15 * 60_000,
            );
          const updated = await this.updateIdentityIfUnchanged(post, {
            telegramIdLastCheckedAt: checkedAt,
            ...(graceExpired
              ? {
                  telegramIdVerificationStatus:
                    TelegramManagedPostIdVerificationStatus.MISSING,
                }
              : {}),
          });
          if (!updated) {
            result.skipped += 1;
            continue;
          }
          if (graceExpired) result.missing += 1;
          else result.skipped += 1;
          continue;
        }
        const urls = match.messageIds.flatMap((messageId) => {
          const url = buildStableTelegramPostUrl({
            telegramChatId: post.telegramChannel.telegramChatId,
            messageId,
          });
          return url ? [url] : [];
        });
        const primaryId = this.primaryMessageId(
          match.messageIds,
          post.imageUrls.length,
        );
        const primaryUrl = primaryId
          ? buildStableTelegramPostUrl({
              telegramChatId: post.telegramChannel.telegramChatId,
              messageId: primaryId,
            })
          : null;
        const orderedUrls = primaryUrl
          ? [primaryUrl, ...urls.filter((url) => url !== primaryUrl)]
          : urls;
        const corrected =
          post.telegramMessageIds.join(',') !== match.messageIds.join(',');
        const publishedAt = match.matchedMessage.date
          ? new Date(match.matchedMessage.date)
          : (post.scheduledAt ?? checkedAt);
        const identityUpdated = await this.updateIdentityIfUnchanged(post, {
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
          telegramScheduledMessageIds: [],
          telegramMessageIds: match.messageIds,
          telegramMessageUrls: orderedUrls,
          scheduledAt: null,
          publishedAt,
          telegramIdVerificationStatus:
            TelegramManagedPostIdVerificationStatus.VERIFIED,
          telegramIdVerifiedAt: checkedAt,
          telegramIdLastCheckedAt: checkedAt,
          lastTelegramSyncedAt: checkedAt,
          lastTelegramSyncNote:
            'Published Telegram identity verified remotely.',
          lastError: null,
        });
        if (!identityUpdated) {
          result.skipped += 1;
          continue;
        }
        try {
          await params.repairDependants(
            params.workspaceId,
            post.telegramChannelId,
            post.id,
            publishedAt,
          );
          result.verified += 1;
          if (corrected) result.corrected += 1;
        } catch {
          const retryData = {
            telegramIdVerificationStatus:
              TelegramManagedPostIdVerificationStatus.UNVERIFIED,
            telegramIdVerifiedAt: null,
            telegramIdLastCheckedAt: checkedAt,
            lastTelegramSyncNote: this.dependentRepairPendingNote,
          };
          const delegate = this.prisma.telegramManagedPost as unknown as {
            updateMany?: (args: Record<string, unknown>) => Promise<unknown>;
            update: (args: Record<string, unknown>) => Promise<unknown>;
          };
          if (delegate.updateMany) {
            await delegate.updateMany({
              where: {
                id: post.id,
                telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
                telegramMessageIds: { equals: match.messageIds },
              },
              data: retryData,
            });
          } else {
            await delegate.update({
              where: { id: post.id },
              data: retryData,
            });
          }
          result.skipped += 1;
        }
      }
    }
    return result;
  }
}
