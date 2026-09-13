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
};
const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

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
    const maxBoundary = boundaries.length
      ? new Date(Math.max(...boundaries.map((date) => date.getTime())))
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
        select: { id: true, title: true },
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
        select: { id: true, telegramChannelId: true, telegramMessageIds: true },
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
    const channelById = new Map(
      channels.map((channel) => [channel.id, channel]),
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
      const linkAtEnd = (id: string) =>
        boundary == null
          ? null
          : linkSnapshots.find(
              (snapshot) =>
                snapshot.inviteLinkId === id &&
                new Date(snapshot.syncedAt).getTime() <= boundary,
            );
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
        status:
          row.status === 'SCHEDULED' &&
          new Date(row.scheduledAt).getTime() <= Date.now()
            ? 'ACTIVE'
            : row.status,
        advertiser: row.advertiserId
          ? (advertiserById.get(row.advertiserId) ?? null)
          : null,
        iconPresentation: iconToResolvedEmoji(
          publicationPost.iconId ? iconById.get(publicationPost.iconId) : null,
        ),
        publicationPost,
        targets,
        placementPostIds: placements,
        baselineTargetCounters: baselines,
        baselinePublisherSubscribers: publisherBaselines,
        targetResults: targets.map((target) => {
          const channel = channelById.get(target.telegramChannelId);
          const currentLink = linkById.get(target.inviteLinkId);
          const link = linkAtEnd(target.inviteLinkId) ?? currentLink;
          const baseline = baselineByLink.get(target.inviteLinkId);
          return {
            telegramChannelId: target.telegramChannelId,
            title: channel?.title ?? 'Unavailable channel',
            photoUrl: channel?.photoUrl ?? null,
            promoTitle:
              (target.promoId
                ? promoById.get(target.promoId)?.title
                : 'Custom promo') ?? 'Unavailable promo',
            inviteLinkUrl: currentLink?.url ?? '',
            joinedCount: Math.max(
              0,
              Number(link?.joinedCount ?? 0) -
                Number(baseline?.joinedCount ?? 0),
            ),
            requestedCount: Math.max(
              0,
              Number(link?.requestedCount ?? 0) -
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
          const managedPostId = placements.find(
            (placement) => placement.telegramChannelId === channelId,
          )?.managedPostId;
          const managedPost = managedPosts.find(
            (post) => post.id === managedPostId,
          );
          const publishedRows = telegramPosts.filter(
            (post) =>
              post.telegramChannelId === channelId &&
              managedPost?.telegramMessageIds.includes(post.telegramMessageId),
          );
          return {
            telegramChannelId: channelId,
            title: channel?.title ?? 'Unavailable channel',
            photoUrl: channel?.photoUrl ?? null,
            subscribersLost:
              before == null || after == null
                ? null
                : Math.max(0, before - after),
            postViews: publishedRows.length
              ? publishedRows.reduce(
                  (sum, post) => sum + Number(post.viewsCount ?? 0),
                  0,
                )
              : null,
            postReactions: publishedRows.length
              ? publishedRows.reduce(
                  (sum, post) => sum + Number(post.reactionsCount ?? 0),
                  0,
                )
              : null,
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
