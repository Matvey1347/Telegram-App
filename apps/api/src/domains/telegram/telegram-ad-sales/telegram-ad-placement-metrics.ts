import { NotFoundException } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { decimal } from './domain/decimal';

export async function reconcileTelegramAdPlacementMetrics(
  prisma: PrismaService,
  workspaceId: string,
  placementId: string,
) {
  const placement = await prisma.telegramAdSalePlacement.findFirst({
    where: { id: placementId, workspaceId },
    include: { managedPost: true, telegramPost: true },
  });
  if (!placement)
    throw new NotFoundException('Telegram ad sale placement not found');

  const identityVerified =
    !placement.managedPost ||
    (placement.managedPost.status === TelegramManagedPostStatus.PUBLISHED &&
      placement.managedPost.telegramIdVerificationStatus ===
        TelegramManagedPostIdVerificationStatus.VERIFIED);
  let telegramPost = identityVerified ? placement.telegramPost : null;
  if (
    !telegramPost &&
    identityVerified &&
    placement.managedPost?.telegramMessageIds.length
  ) {
    telegramPost = await prisma.telegramPost.findFirst({
      where: {
        workspaceId,
        telegramChannelId: placement.telegramChannelId,
        telegramMessageId: { in: placement.managedPost.telegramMessageIds },
      },
      orderBy: { postDate: 'desc' },
    });
    if (telegramPost) {
      await prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: { telegramPostId: telegramPost.id },
      });
    }
  }

  if (!telegramPost) {
    return {
      actualViews24h: null,
      actualViews48h: null,
      actualViewsFinal: null,
      actualReactionsFinal: null,
      actualCpm: null,
    };
  }
  const snapshots = await prisma.telegramPostMetricSnapshot.findMany({
    where: { telegramPostId: telegramPost.id },
    orderBy: { collectedAt: 'asc' },
  });
  const publishedAt = placement.publishedAt ?? telegramPost.postDate;
  const withinHours = (hours: number) =>
    snapshots
      .filter(
        (snapshot) =>
          Math.abs(snapshot.collectedAt.getTime() - publishedAt.getTime()) <=
          hours * 60 * 60 * 1000,
      )
      .sort(
        (left, right) =>
          right.collectedAt.getTime() - left.collectedAt.getTime(),
      )[0] ?? null;
  const finalViews =
    telegramPost.viewsCount ?? snapshots.at(-1)?.viewsCount ?? null;
  const actualViewsFinal = finalViews == null ? null : Math.max(0, finalViews);
  const actualReactionsFinal = telegramPost.reactionsCount == null
    ? null
    : Math.max(0, telegramPost.reactionsCount);
  return {
    actualViews24h: withinHours(26)?.viewsCount ?? null,
    actualViews48h: withinHours(50)?.viewsCount ?? null,
    actualViewsFinal,
    actualReactionsFinal,
    actualCpm:
      actualViewsFinal && actualViewsFinal > 0
        ? decimal(placement.agreedPrice)
            .div(decimal(actualViewsFinal))
            .mul(1000)
            .toDecimalPlaces(2)
        : null,
  };
}
