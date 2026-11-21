import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramAdPlacementStatus, TelegramManagedPostStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';

export async function loadAdPublicationPlacement(
  prisma: PrismaService, workspaceId: string, saleId: string, placementId: string,
) {
  const placement = await prisma.telegramAdSalePlacement.findFirst({
    where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
    include: { managedPost: true },
  });
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  return placement;
}

export type AdPublicationPlacement = Awaited<ReturnType<typeof loadAdPublicationPlacement>>;

export async function publishAdPlacement(
  prisma: PrismaService,
  placement: AdPublicationPlacement,
  publish: () => Promise<{ publishedAt: Date | null }>,
) {
  if (!placement.managedPostId) throw new BadRequestException('Managed post is required');
  const publication = await publish();
  const publishedAt = publication.publishedAt ?? new Date();
  return prisma.telegramAdSalePlacement.update({
    where: {
      id: placement.id, workspaceId: placement.workspaceId,
      telegramAdSaleId: placement.telegramAdSaleId, managedPostId: placement.managedPostId,
      updatedAt: placement.updatedAt,
    },
    data: {
      status: TelegramAdPlacementStatus.PUBLISHED,
      publishedAt,
      plannedDeleteAt: calculateAdPlacementDeleteAt({ ...placement, publishedAt }),
    },
    include: { paymentAllocations: { include: { payment: true } } },
  });
}

export async function reconcileAdPlacement(prisma: PrismaService, placement: AdPublicationPlacement) {
  const post = placement.managedPost;
  if (!post || post.status !== TelegramManagedPostStatus.PUBLISHED || !post.publishedAt ||
      !post.telegramMessageIds.length || post.telegramIdVerificationStatus !== 'VERIFIED') {
    throw new BadRequestException('Managed post must have a confirmed and Telegram-verified publication to reconcile');
  }
  if (placement.status === 'PUBLISHED') return;
  const result = await prisma.telegramAdSalePlacement.updateMany({
    where: {
      id: placement.id, workspaceId: placement.workspaceId, telegramAdSaleId: placement.telegramAdSaleId,
      managedPostId: placement.managedPostId, updatedAt: placement.updatedAt,
      status: { in: ['DRAFT', 'RESERVED', 'SCHEDULED'] },
    },
    data: {
      status: TelegramAdPlacementStatus.PUBLISHED,
      publishedAt: post.publishedAt,
      plannedDeleteAt: calculateAdPlacementDeleteAt({ ...placement, publishedAt: post.publishedAt }),
      telegramPostId: post.telegramPostId,
    },
  });
  if (result.count !== 1) throw new ConflictException('Placement changed during reconciliation. Reload before acting.');
}
