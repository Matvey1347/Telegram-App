import { Injectable } from '@nestjs/common';
import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
} from '@telegram-system/shared';
import type { CrossPromotionPlan } from '@prisma/client';
import {
  iconToResolvedEmoji,
  type ResolvedEmojiIconSource,
} from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { publisherPlacements } from './cross-promotion-plan-input';

// Permanent Telegram posts can outlive the campaign shown in the promotion inbox.
function maxMeasuredCount(values: Array<number | null>) {
  const measured = values.filter((value): value is number => value != null);
  return measured.length ? Math.max(...measured) : null;
}

function sumMeasuredCount(values: Array<number | null>) {
  const measured = values.filter((value): value is number => value != null);
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) : null;
}

const OWN_PROMOTION_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

type CounterBaseline = {
  inviteLinkId: string;
  joinedCount: number;
  requestedCount: number;
};
type SubscriberBaseline = {
  telegramChannelId: string;
  subscribersCount: number | null;
};
type Placement = {
  telegramChannelId: string;
  managedPostId: string;
  postGroupId?: string | null;
  publicationId?: string | null;
};
const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

function partnerTrackingEndsAt(post: CrossPromotionPlacementPost) {
  const placements = post.partnerPublications?.length
    ? post.partnerPublications.flatMap((publication) => publication.placements)
    : (post.partnerPlacements ?? []);
  const timestamps = placements
    .flatMap((placement) =>
      placement.deleteAt ? [Date.parse(placement.deleteAt)] : [],
    )
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

@Injectable()
export class CrossPromotionPlanReadService {
  constructor(private readonly prisma: PrismaService) {}
  private unique(ids: string[]) {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  public async shape(workspaceId: string, row: CrossPromotionPlan) {
    return (await this.shapeMany(workspaceId, [row]))[0];
  }

  public async shapeMany(workspaceId: string, rows: CrossPromotionPlan[]) {
    if (!rows.length) return [];
    const targetsByPlan = new Map(
      rows.map((row) => [
        row.id,
        json<CrossPromotionTargetInput[]>(row.targets, []),
      ]),
    );
    const publicationPostsByPlan = new Map(
      rows.map((row) => [
        row.id,
        json<CrossPromotionPlacementPost>(row.publicationPost, {
          title: '',
          text: '',
          imageUrls: [],
          buttonRows: [],
        }),
      ]),
    );
    const allTargets = [...targetsByPlan.values()].flat();
    const placementsByPlan = new Map(
      rows.map((row) => [row.id, json<Placement[]>(row.placementPostIds, [])]),
    );
    const managedPostIds = this.unique(
      [...placementsByPlan.values()]
        .flat()
        .map((placement) => placement.managedPostId),
    );
    const channelIds = this.unique(
      rows.flatMap((row) => [
        ...row.publisherChannelIds,
        ...row.partnerChannelIds,
        ...(targetsByPlan.get(row.id) ?? []).map(
          (target) => target.telegramChannelId,
        ),
      ]),
    );
    const promoIds = this.unique(
      allTargets.flatMap((target) => (target.promoId ? [target.promoId] : [])),
    );
    const linkIds = this.unique(
      allTargets.map((target) => target.inviteLinkId),
    );
    const advertiserIds = this.unique(
      rows.flatMap((row) => (row.advertiserId ? [row.advertiserId] : [])),
    );
    const iconIds = this.unique(
      [...publicationPostsByPlan.values()].flatMap((post) =>
        post.iconId ? [post.iconId] : [],
      ),
    );
    const boundaries = rows.flatMap((row) =>
      row.trackingEndsAt ? [new Date(row.trackingEndsAt)] : [],
    );
    // Invite-link counters are sampled in batches. Fetch through the next
    // expected sample so an end-of-placement counter is not understated just
    // because the sync landed shortly after the precise end time.
    const maxBoundary = boundaries.length
      ? new Date(
          Math.max(...boundaries.map((date) => date.getTime())) +
            30 * 3_600_000,
        )
      : null;
    const [
      channels,
      promos,
      links,
      linkSnapshots,
      audienceSnapshots,
      managedPosts,
      advertisers,
      icons,
    ] = await Promise.all([
      this.prisma.telegramChannel.findMany({
        where: { workspaceId, id: { in: channelIds } },
        select: {
          id: true,
          title: true,
          photoUrl: true,
          currentSubscribersCount: true,
        },
      }),
      this.prisma.promo.findMany({
        where: { workspaceId, id: { in: promoIds } },
        select: {
          id: true,
          title: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, id: { in: linkIds } },
        select: {
          id: true,
          url: true,
          joinedCount: true,
          requestedCount: true,
        },
      }),
      maxBoundary
        ? this.prisma.telegramInviteLinkSnapshot.findMany({
            where: {
              workspaceId,
              inviteLinkId: { in: linkIds },
              syncedAt: { lte: maxBoundary },
            },
            orderBy: { syncedAt: 'desc' },
            take: 5000,
            select: {
              inviteLinkId: true,
              syncedAt: true,
              joinedCount: true,
              requestedCount: true,
            },
          })
        : Promise.resolve(
            [] as Array<{
              inviteLinkId: string;
              syncedAt: Date;
              joinedCount: number;
              requestedCount: number;
            }>,
          ),
      maxBoundary
        ? this.prisma.telegramChannelAudienceSnapshot.findMany({
            where: {
              workspaceId,
              telegramChannelId: { in: channelIds },
              collectedAt: { lte: maxBoundary },
            },
            orderBy: { collectedAt: 'desc' },
            take: 5000,
            select: {
              telegramChannelId: true,
              collectedAt: true,
              subscribersCount: true,
            },
          })
        : Promise.resolve(
            [] as Array<{
              telegramChannelId: string;
              collectedAt: Date;
              subscribersCount: number | null;
            }>,
          ),
      this.prisma.telegramManagedPost.findMany({
        where: { workspaceId, id: { in: managedPostIds } },
        select: {
          id: true,
          telegramChannelId: true,
          telegramMessageIds: true,
          telegramRemoteStatus: true,
          publishedAt: true,
        },
      }),
      advertiserIds.length
        ? this.prisma.telegramAdvertiser.findMany({
            where: { workspaceId, id: { in: advertiserIds } },
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              crmPeers: {
                orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                take: 10,
                select: { photoUrl: true },
              },
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              displayName: string;
              telegramUsername: string | null;
              crmPeers: Array<{ photoUrl: string | null }>;
            }>,
          ),
      iconIds.length
        ? this.prisma.icon.findMany({
            where: {
              id: { in: iconIds },
              OR: [{ workspaceId }, { workspaceId: null }],
            },
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          })
        : Promise.resolve([] as ResolvedEmojiIconSource[]),
    ]);
    const telegramPostKeys = managedPosts.flatMap((post) =>
      post.telegramMessageIds.map((telegramMessageId) => ({
        telegramChannelId: post.telegramChannelId,
        telegramMessageId,
      })),
    );
    const telegramPosts = telegramPostKeys.length
      ? await this.prisma.telegramPost.findMany({
          where: { workspaceId, OR: telegramPostKeys },
          select: {
            telegramChannelId: true,
            telegramMessageId: true,
            viewsCount: true,
            reactionsCount: true,
          },
        })
      : [];
    const telegramPostByMessage = new Map(telegramPosts.map((post) =>
      [`${post.telegramChannelId}:${post.telegramMessageId}`, post] as const,
    ));
    // A legacy failed re-schedule could clear placementPostIds even though the
    // Telegram posts remain in our import. Recover only an exact post text at
    // its planned channel and time, so we never attribute an arbitrary post.
    const recoveryByPlan = new Map(rows.flatMap((row) => {
      const post = publicationPostsByPlan.get(row.id)!;
      if (placementsByPlan.get(row.id)?.length) return [];
      const publications = post.publisherPublications?.length
        ? post.publisherPublications
        : [{ post, placements: post.publisherPlacements ?? [] }];
      const candidates = publications.flatMap(({ post: draft, placements }) => {
        const text = draft.plainText?.trim() || draft.text.trim();
        if (!text) return [];
        return placements.flatMap(({ telegramChannelId, scheduledAt }) => {
          const instant = Date.parse(scheduledAt);
          if (!Number.isFinite(instant)) return [];
          return [{
            telegramChannelId, text, instant,
            postDate: {
              gte: new Date(instant - 2 * 3_600_000),
              lte: new Date(instant + 2 * 3_600_000),
            },
          }];
        });
      });
      return [[row.id, candidates] as const];
    }));
    const recoveryCandidates = [...recoveryByPlan.values()].flatMap((candidates) =>
      candidates.map(({ telegramChannelId, text, postDate }) => ({ telegramChannelId, text, postDate })),
    );
    const recoveredTelegramPosts = recoveryCandidates.length
      ? await this.prisma.telegramPost.findMany({
          where: { workspaceId, OR: recoveryCandidates },
          select: {
            telegramChannelId: true,
            telegramMessageId: true,
            text: true,
            postDate: true,
            viewsCount: true,
            reactionsCount: true,
          },
        })
      : [];
    const channelById = new Map(
      channels.map((channel) => [channel.id, channel]),
    );
    const managedPostById = new Map(managedPosts.map((post) => [post.id, post]));
    const publishedManagedPostIds = new Set(
      managedPosts
        .filter(
          (post) =>
            post.telegramRemoteStatus === 'PUBLISHED' &&
            post.telegramMessageIds.length > 0,
        )
        .map((post) => post.id),
    );
    const promoById = new Map(promos.map((promo) => [promo.id, promo]));
    const linkById = new Map(links.map((link) => [link.id, link]));
    const advertiserById = new Map(
      advertisers.map((advertiser) => [
        advertiser.id,
        {
          id: advertiser.id,
          displayName: advertiser.displayName,
          telegramUsername: advertiser.telegramUsername,
          photoUrl:
            advertiser.crmPeers.find((peer) => peer.photoUrl)?.photoUrl ?? null,
        },
      ]),
    );
    const iconById = new Map(icons.map((icon) => [icon.id, icon] as const));
    const now = Date.now();
    return rows.map((row) => {
      const targets = targetsByPlan.get(row.id) ?? [];
      const baselines = json<CounterBaseline[]>(row.baselineTargetCounters, []);
      const publisherBaselines = json<SubscriberBaseline[]>(
        row.baselinePublisherSubscribers,
        [],
      );
      const baselineByLink = new Map(
        baselines.map((baseline) => [baseline.inviteLinkId, baseline]),
      );
      const baselineByPublisher = new Map(
        publisherBaselines.map((baseline) => [
          baseline.telegramChannelId,
          baseline,
        ]),
      );
      const boundary = row.trackingEndsAt
        ? new Date(row.trackingEndsAt).getTime()
        : null;
      const placements = placementsByPlan.get(row.id) ?? [];
      const publicationPost = publicationPostsByPlan.get(row.id)!;
      const ownPlacementPublished = placements.some((placement) =>
        publishedManagedPostIds.has(placement.managedPostId),
      );
      const hasLiveOwnPlacement = placements.some((placement) => {
        const managedPost = managedPostById.get(placement.managedPostId);
        return Boolean(
          managedPost && managedPost.telegramRemoteStatus !== 'AUTO_DELETED',
        );
      });
      const partnerPlacements = publicationPost.partnerPublications?.length
        ? publicationPost.partnerPublications.flatMap((publication) => publication.placements)
        : (publicationPost.partnerPlacements ?? []);
      const hasLivePartnerPlacement = partnerPlacements.some((placement) =>
        Date.parse(placement.scheduledAt) <= now &&
        (!placement.deleteAt || Date.parse(placement.deleteAt) > now),
      );
      const configuredPlacements = publisherPlacements(publicationPost);
      const publicationHasStarted = configuredPlacements.length
        ? configuredPlacements.some(
            (placement) => Date.parse(placement.scheduledAt) <= now,
          )
        : row.scheduledAt.getTime() <= now;
      const hasActivePlacement =
        (ownPlacementPublished && publicationHasStarted) ||
        hasLivePartnerPlacement;
      const campaignPlacements = [...configuredPlacements, ...partnerPlacements];
      const allPlacementsEnded =
        campaignPlacements.length > 0 &&
        campaignPlacements.every(
          ({ deleteAt }) => deleteAt && Date.parse(deleteAt) <= now,
        );
      let ownCampaignWindowEnded = false;
      if (
        boundary == null &&
        row.kind === 'OWN_CHANNELS' &&
        ownPlacementPublished &&
        campaignPlacements.every(({ deleteAt }) => !deleteAt)
      ) {
        let lastPublicationAt = row.scheduledAt.getTime();
        for (const { scheduledAt } of configuredPlacements) {
          const scheduledTime = Date.parse(scheduledAt);
          if (Number.isFinite(scheduledTime)) {
            lastPublicationAt = Math.max(lastPublicationAt, scheduledTime);
          }
        }
        for (const { managedPostId } of placements) {
          const publishedAt = managedPostById.get(managedPostId)?.publishedAt;
          if (publishedAt) {
            lastPublicationAt = Math.max(lastPublicationAt, publishedAt.getTime());
          }
        }
        ownCampaignWindowEnded =
          lastPublicationAt + OWN_PROMOTION_ACTIVITY_WINDOW_MS <= now;
      }
      const isTrackedPlacement =
        row.status === 'ACTIVE' || row.status === 'SCHEDULED';
      const trackingEnded =
        isTrackedPlacement &&
        (row.status === 'ACTIVE' || hasActivePlacement) &&
        (boundary == null
          ? allPlacementsEnded || ownCampaignWindowEnded
          : boundary <= now);

      const historicalDraft =
        row.status === 'DRAFT' &&
        row.scheduledAt.getTime() <= now &&
        baselines.length > 0;
      const linkAtEnd = (id: string, boundaryAt: number | null = boundary) => {
        if (boundaryAt == null) return null;
        const snapshots = linkSnapshots.filter(
          (snapshot) => snapshot.inviteLinkId === id,
        );
        const firstAtOrAfterEnd = snapshots
          .filter(
            (snapshot) => new Date(snapshot.syncedAt).getTime() >= boundaryAt,
          )
          .sort(
            (left, right) =>
              new Date(left.syncedAt).getTime() -
              new Date(right.syncedAt).getTime(),
          )[0];
        return (
          firstAtOrAfterEnd ??
          snapshots.find(
            (snapshot) => new Date(snapshot.syncedAt).getTime() <= boundaryAt,
          ) ??
          null
        );
      };
      const channelAtEnd = (id: string) =>
        boundary == null
          ? null
          : audienceSnapshots.find(
              (snapshot) =>
                snapshot.telegramChannelId === id &&
                new Date(snapshot.collectedAt).getTime() <= boundary,
            );
      return {
        ...row,
        status: historicalDraft || trackingEnded
          ? 'COMPLETED'
          : row.status === 'ACTIVE' && !hasLiveOwnPlacement && !partnerPlacements.length
            ? 'DRAFT'
            : isTrackedPlacement
              ? (hasActivePlacement ? 'ACTIVE' : 'SCHEDULED')
              : row.status,
        lastError: historicalDraft ? null : row.lastError,
        advertiser: row.advertiserId
          ? (advertiserById.get(row.advertiserId) ?? null)
          : null,
        iconPresentation: iconToResolvedEmoji(
          publicationPost.iconId ? iconById.get(publicationPost.iconId) : null,
        ),
        publicationPost,
        targets,
        placementPostIds: placements.map((placement) => ({
          ...placement,
          isPublishedInTelegram: publishedManagedPostIds.has(
            placement.managedPostId,
          ),
        })),
        baselineTargetCounters: baselines,
        baselinePublisherSubscribers: publisherBaselines,
        targetResults: targets.map((target) => {
          const channel = channelById.get(target.telegramChannelId);
          const currentLink = linkById.get(target.inviteLinkId);
          const targetBoundary =
            partnerTrackingEndsAt(publicationPost) ?? boundary;
          const link =
            linkAtEnd(target.inviteLinkId, targetBoundary) ?? currentLink;
          const baseline = baselineByLink.get(target.inviteLinkId);
          const promo = target.promoId
            ? promoById.get(target.promoId)
            : undefined;
          const inviteLinkTotalJoinedCount = Number(link?.joinedCount ?? 0);
          const inviteLinkTotalRequestedCount = Number(
            link?.requestedCount ?? 0,
          );
          return {
            telegramChannelId: target.telegramChannelId,
            inviteLinkId: target.inviteLinkId,
            title: channel?.title ?? 'Unavailable channel',
            photoUrl: channel?.photoUrl ?? null,
            promoId: target.promoId ?? null,
            promoTitle:
              (target.promoId ? promo?.title : 'Custom promo') ??
              'Unavailable promo',
            promoIconPresentation: iconToResolvedEmoji(promo?.icon ?? null),
            inviteLinkUrl: currentLink?.url ?? '',
            inviteLinkTotalJoinedCount,
            inviteLinkTotalRequestedCount,
            joinedCount: Math.max(
              0,
              inviteLinkTotalJoinedCount - Number(baseline?.joinedCount ?? 0),
            ),
            requestedCount: Math.max(
              0,
              inviteLinkTotalRequestedCount -
                Number(baseline?.requestedCount ?? 0),
            ),
          };
        }),
        publisherResults: row.publisherChannelIds.map((channelId: string) => {
          const channel = channelById.get(channelId);
          const before = baselineByPublisher.get(channelId)?.subscribersCount;
          const after =
            channelAtEnd(channelId)?.subscribersCount ??
            channel?.currentSubscribersCount;
          const channelPlacements = placements.filter(
            (placement) => placement.telegramChannelId === channelId,
          );
          const managedPostsForChannel = channelPlacements.flatMap((placement) => {
            const managed = managedPostById.get(placement.managedPostId);
            const slot = publicationPost.publisherPublications
              ?.find(({ id }) => id === placement.publicationId)
              ?.placements.find(({ telegramChannelId }) => telegramChannelId === channelId);
            return managed && (!slot || Date.parse(slot.scheduledAt) <= now) ? [managed] : [];
          });
          const scheduledTimes = configuredPlacements
            .filter((placement) => placement.telegramChannelId === channelId)
            .map((placement) => Date.parse(placement.scheduledAt))
            .filter(Number.isFinite);
          // A scheduled post can retain old imported message metadata while
          // Telegram has not published this placement yet. Never present that
          // as an actual campaign reach before its configured publication time.
          const publicationHasStarted =
            !scheduledTimes.length || Math.min(...scheduledTimes) <= now;
          const resultPosts: Array<{ viewsCount: number | null; reactionsCount: number | null }> = [];
          if (publicationHasStarted) {
            const countedMessages = new Set<string>();
            for (const managed of managedPostsForChannel) {
              const messages = [...new Set(managed.telegramMessageIds)].flatMap((id) => {
                const post = telegramPostByMessage.get(`${channelId}:${id}`);
                return post && !countedMessages.has(id) ? [post] : [];
              });
              if (!messages.length) continue;
              messages.forEach((post) => countedMessages.add(post.telegramMessageId));
              // Telegram media albums can have several message IDs for one placement.
              resultPosts.push({
                viewsCount: maxMeasuredCount(messages.map((post) => post.viewsCount)),
                reactionsCount: maxMeasuredCount(messages.map((post) => post.reactionsCount)),
              });
            }
            for (const candidate of recoveryByPlan.get(row.id) ?? []) {
              if (candidate.telegramChannelId !== channelId || candidate.instant > now) continue;
              const match = recoveredTelegramPosts
                .filter((post) => post.telegramChannelId === channelId &&
                  post.text === candidate.text &&
                  post.postDate >= candidate.postDate.gte &&
                  post.postDate <= candidate.postDate.lte &&
                  !countedMessages.has(post.telegramMessageId))
                .sort((left, right) =>
                  Math.abs(left.postDate.getTime() - candidate.instant) -
                  Math.abs(right.postDate.getTime() - candidate.instant),
                )[0];
              if (!match) continue;
              countedMessages.add(match.telegramMessageId);
              resultPosts.push(match);
            }
          }
          return {
            telegramChannelId: channelId,
            title: channel?.title ?? 'Unavailable channel',
            photoUrl: channel?.photoUrl ?? null,
            subscribersLost:
              before == null || after == null
                ? null
                : Math.max(0, before - after),
            postViews: sumMeasuredCount(resultPosts.map((post) => post.viewsCount)),
            postReactions: sumMeasuredCount(resultPosts.map((post) => post.reactionsCount)),
          };
        }),
        partnerResults: row.partnerChannelIds.map((channelId: string) => {
          const channel = channelById.get(channelId);
          return {
            telegramChannelId: channelId,
            title: channel?.title ?? 'Unavailable channel',
            photoUrl: channel?.photoUrl ?? null,
          };
        }),
      };
    });
  }
}
