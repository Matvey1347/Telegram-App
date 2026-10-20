import { Injectable } from '@nestjs/common';
import { TelegramManagedPostRemoteStatus } from '@prisma/client';
import type { CrossPromotionPlacementPost } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

type ScheduledPlacement = {
  telegramChannelId: string;
  managedPostId: string;
  publicationId?: string | null;
};

const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

const contentKey = (post: {
  title: string;
  text?: string | null;
  imageUrls?: string[];
  mediaItems?: unknown;
  buttonRows?: unknown;
}) =>
  stableJson({
    title: post.title,
    text: post.text ?? '',
    imageUrls: post.imageUrls ?? [],
    mediaItems: post.mediaItems ?? [],
    buttonRows: post.buttonRows ?? [],
  });

@Injectable()
export class CrossPromotionPublicationPostResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: {
    workspaceId: string;
    placementPostIds: unknown;
    publicationPost: unknown;
    publicationId: string;
  }) {
    const placements = json<ScheduledPlacement[]>(
      params.placementPostIds,
      [],
    ).filter((placement) => placement.publicationId === params.publicationId);
    const exact = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        id: { in: placements.map((placement) => placement.managedPostId) },
      },
      select: this.select(),
    });
    const exactById = new Map(exact.map((post) => [post.id, post]));
    const missing = placements.filter(
      (placement) =>
        exactById.get(placement.managedPostId)?.telegramChannelId !==
        placement.telegramChannelId,
    );
    if (!missing.length) {
      return exact.map((post) => ({ ...post, linkedManagedPostId: post.id }));
    }

    const configured = json<CrossPromotionPlacementPost>(
      params.publicationPost,
      { title: '', text: '', imageUrls: [], buttonRows: [] },
    );
    const publication = configured.publisherPublications?.find(
      (item) => item.id === params.publicationId,
    );
    if (!publication) {
      return exact.map((post) => ({ ...post, linkedManagedPostId: post.id }));
    }
    const expectedKey = contentKey(publication.post);
    const candidates = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: {
          in: missing.map((placement) => placement.telegramChannelId),
        },
        id: { notIn: placements.map((placement) => placement.managedPostId) },
        telegramRemoteStatus: {
          notIn: [
            TelegramManagedPostRemoteStatus.AUTO_DELETED,
            TelegramManagedPostRemoteStatus.MISSING,
          ],
        },
        OR: [
          { telegramMessageIds: { isEmpty: false } },
          { telegramScheduledMessageIds: { isEmpty: false } },
        ],
      },
      select: this.select(),
    });
    const used = new Set(exact.map((post) => post.id));
    const resolved = exact.map((post) => ({
      ...post,
      linkedManagedPostId: post.id,
    }));
    for (const placement of missing) {
      const expectedTime = Date.parse(
        publication.placements.find(
          (item) => item.telegramChannelId === placement.telegramChannelId,
        )?.scheduledAt ?? '',
      );
      const match = candidates
        .filter(
          (post) =>
            !used.has(post.id) &&
            post.telegramChannelId === placement.telegramChannelId &&
            contentKey(post) === expectedKey,
        )
        .map((post) => ({
          post,
          distance: this.timeDistance(post, expectedTime),
        }))
        .filter(({ distance }) => distance <= 12 * 60 * 60 * 1000)
        .sort((a, b) => a.distance - b.distance)[0]?.post;
      if (!match) continue;
      used.add(match.id);
      resolved.push({ ...match, linkedManagedPostId: placement.managedPostId });
    }
    return resolved;
  }

  private select() {
    return {
      id: true,
      telegramChannelId: true,
      title: true,
      text: true,
      imageUrls: true,
      mediaItems: true,
      buttonRows: true,
      scheduledAt: true,
      publishedAt: true,
      createdAt: true,
    } as const;
  }

  private timeDistance(
    post: {
      scheduledAt?: Date | null;
      publishedAt?: Date | null;
      createdAt?: Date;
    },
    expectedTime: number,
  ) {
    if (!Number.isFinite(expectedTime)) return Number.POSITIVE_INFINITY;
    return Math.min(
      ...[post.scheduledAt, post.publishedAt, post.createdAt]
        .filter((value): value is Date => Boolean(value))
        .map((value) => Math.abs(value.getTime() - expectedTime)),
    );
  }
}
