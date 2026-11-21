import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { parseTelegramPostUrl } from '@api/telegram/shared/imports/telegram-post-url';
import {
  AttachPlacementManagedPostDto,
  CreateTelegramAdSalePlacementDto,
  CreatePlacementManagedPostDto,
  UpdateTelegramAdSalePlacementDto,
} from './dto';
import { decimal, decimalOrNull } from './domain/decimal';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function addPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'findWorkspaceChannel'
    | 'findWorkspaceNetwork'
    | 'getSaleDetails'
    | 'invalidateAvailabilityCache'
    | 'mapPlacement'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  dto: CreateTelegramAdSalePlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const channel = await operations.findWorkspaceChannel(workspaceId, dto.telegramChannelId);
  if (dto.telegramChannelNetworkId) {
    const network = await operations.findWorkspaceNetwork(workspaceId, dto.telegramChannelNetworkId);
    if (!network.channels.some((item) => item.telegramChannelId === channel.id)) {
      throw new BadRequestException('Selected network does not contain chosen channel');
    }
  }
  const product = dto.telegramAdProductId
    ? await operations.prisma.telegramAdProduct.findFirst({
        where: {
          id: dto.telegramAdProductId,
          workspaceId,
          telegramChannelId: channel.id,
        },
      })
    : null;
  if (dto.telegramAdProductId && !product) {
    throw new NotFoundException('Telegram ad product not found');
  }
  const snapshot = dto.pricingSnapshotId
    ? await operations.prisma.telegramAdPriceSnapshot.findFirst({
        where: {
          id: dto.pricingSnapshotId,
          workspaceId,
          telegramChannelId: channel.id,
          ...(product ? { telegramAdProductId: product.id } : {}),
        },
      })
    : null;
  if (dto.pricingSnapshotId && !snapshot) {
    throw new NotFoundException('Pricing snapshot not found');
  }
  const expectedViewsResult = snapshot
    ? {
        expectedViews: snapshot.expectedViews,
        recommendedPrice: snapshot.recommendedPrice,
        minimumPrice: snapshot.minimumPrice,
        targetCpm: snapshot.targetCpm,
      }
    : null;
  let placement;
  try {
    placement = await operations.prisma.telegramAdSalePlacement.create({
      data: {
        workspaceId,
        telegramAdSaleId: sale.id,
        telegramChannelId: channel.id,
        telegramChannelNetworkId: dto.telegramChannelNetworkId ?? null,
        telegramAdProductId: product?.id ?? null,
        inventoryOpportunityKey: dto.inventoryOpportunityKey?.trim() || null,
        pricingSnapshotId: snapshot?.id ?? null,
        status: TelegramAdPlacementStatus.DRAFT,
        scheduledAt: new Date(dto.scheduledAt),
        timezone: dto.timezone,
        pricingMode: dto.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM,
        expectedViews: dto.expectedViews ?? expectedViewsResult?.expectedViews ?? 0,
        quotedCpm: decimalOrNull(dto.quotedCpm),
        recommendedPrice:
          decimalOrNull(dto.recommendedPrice) ?? expectedViewsResult?.recommendedPrice ?? decimal(0),
        minimumPrice: decimalOrNull(dto.minimumPrice) ?? expectedViewsResult?.minimumPrice ?? decimal(0),
        agreedPrice:
          decimalOrNull(dto.agreedPrice) ??
          expectedViewsResult?.recommendedPrice ??
          decimalOrNull(product?.defaultFixedPrice) ??
          decimal(0),
        currency: dto.currency ?? snapshot?.currency ?? product?.currency ?? sale.settlementCurrency,
        topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
        feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
        deleteAfterHoursSnapshot: product?.deleteAfterHours ?? null,
        isPermanentSnapshot: product?.isPermanent ?? false,
        manualPriceReason: dto.manualPriceReason?.trim() || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('This ad opportunity is already booked');
    }
    throw error;
  }
  operations.invalidateAvailabilityCache(workspaceId);
  return operations.mapPlacement(placement);
}

export async function updatePlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'assertPlacementTransition'
    | 'ensurePlacementBelongsToSale'
    | 'invalidateAvailabilityCache'
    | 'mapPlacement'
    | 'notificationProjector'
    | 'prisma'
    | 'telegramManagedPostPublicationService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  dto: UpdateTelegramAdSalePlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
  const agreedPrice = dto.agreedPrice === undefined ? placement.agreedPrice : decimal(dto.agreedPrice);
  const minimumPrice = dto.minimumPrice === undefined ? placement.minimumPrice : decimal(dto.minimumPrice);
  const product =
    dto.telegramAdProductId === undefined || dto.telegramAdProductId === null
      ? null
      : await operations.prisma.telegramAdProduct.findFirst({
          where: {
            id: dto.telegramAdProductId,
            workspaceId,
            telegramChannelId: placement.telegramChannelId,
            isActive: true,
          },
        });
  if (dto.telegramAdProductId && !product) {
    throw new NotFoundException('Telegram ad product not found');
  }
  const freshMissed =
    dto.status === TelegramAdPlacementStatus.MISSED && placement.status !== TelegramAdPlacementStatus.MISSED;
  if (freshMissed) {
    operations.assertPlacementTransition(placement.status, TelegramAdPlacementStatus.MISSED);
  }
  const nextScheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : placement.scheduledAt;
  const nextDeleteAfterHours =
    dto.telegramAdProductId === undefined
      ? placement.deleteAfterHoursSnapshot
      : (product?.deleteAfterHours ?? null);
  const nextIsPermanent =
    dto.telegramAdProductId === undefined ? placement.isPermanentSnapshot : (product?.isPermanent ?? false);
  const managedPostScheduleIsOutOfSync =
    placement.managedPost?.status === TelegramManagedPostStatus.SCHEDULED &&
    placement.managedPost.scheduledAt?.getTime() !== nextScheduledAt.getTime();
  const reschedulesManagedPost =
    dto.scheduledAt !== undefined &&
    (nextScheduledAt.getTime() !== placement.scheduledAt.getTime() || managedPostScheduleIsOutOfSync) &&
    (placement.status === TelegramAdPlacementStatus.SCHEDULED ||
      placement.managedPost?.status === TelegramManagedPostStatus.SCHEDULED) &&
    Boolean(placement.managedPostId);
  if (reschedulesManagedPost) {
    await operations.telegramManagedPostPublicationService.scheduleManagedPost(
      userId,
      placement.telegramChannelId,
      placement.managedPostId!,
      { scheduledAt: nextScheduledAt.toISOString() },
    );
  }
  const data: Prisma.TelegramAdSalePlacementUpdateInput = {
    ...(freshMissed ? { status: TelegramAdPlacementStatus.MISSED } : {}),
    ...(dto.scheduledAt === undefined
      ? {}
      : {
          scheduledAt: new Date(dto.scheduledAt),
          ...(reschedulesManagedPost ? { scheduledManagedAt: nextScheduledAt } : {}),
        }),
    ...(dto.telegramAdProductId === undefined
      ? {}
      : {
          telegramAdProductId: product?.id ?? null,
          topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
          feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
          deleteAfterHoursSnapshot: nextDeleteAfterHours,
          isPermanentSnapshot: nextIsPermanent,
        }),
    ...((dto.scheduledAt !== undefined || dto.telegramAdProductId !== undefined) && placement.publishedAt
      ? {
          plannedDeleteAt: calculateAdPlacementDeleteAt({
            scheduledAt: nextScheduledAt,
            publishedAt: placement.publishedAt,
            deleteAfterHoursSnapshot: nextDeleteAfterHours,
            isPermanentSnapshot: nextIsPermanent,
          }),
        }
      : {}),
    ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
    ...(dto.pricingMode === undefined ? {} : { pricingMode: dto.pricingMode }),
    ...(dto.expectedViews === undefined ? {} : { expectedViews: dto.expectedViews }),
    ...(dto.recommendedPrice === undefined ? {} : { recommendedPrice: decimal(dto.recommendedPrice) }),
    ...(dto.minimumPrice === undefined ? {} : { minimumPrice: decimal(dto.minimumPrice) }),
    ...(dto.agreedPrice === undefined ? {} : { agreedPrice: decimal(dto.agreedPrice) }),
    ...(dto.quotedCpm === undefined ? {} : { quotedCpm: decimalOrNull(dto.quotedCpm) }),
    ...(dto.currency === undefined ? {} : { currency: dto.currency }),
    ...(dto.manualPriceReason === undefined
      ? {}
      : { manualPriceReason: dto.manualPriceReason?.trim() || null }),
    ...(dto.managedPostId === undefined ? {} : { managedPostId: dto.managedPostId || null }),
    ...(dto.telegramPostId === undefined ? {} : { telegramPostId: dto.telegramPostId || null }),
  };
  let notificationIds: string[] = [];
  const updated = freshMissed
    ? await operations.prisma.$transaction(async (tx) => {
        const sale = await tx.telegramAdSale.findFirst({
          where: { id: saleId, workspaceId },
          select: { advertiserId: true },
        });
        const transition = await tx.telegramAdSalePlacement.updateMany({
          where: { id: placementId, status: placement.status },
          data,
        });
        const changed = await tx.telegramAdSalePlacement.findUniqueOrThrow({
          where: { id: placementId },
        });
        notificationIds =
          transition.count && operations.notificationProjector
            ? (
                await operations.notificationProjector.placementMissed(tx, {
                  id: changed.id,
                  workspaceId,
                  advertiserId: sale?.advertiserId ?? null,
                  telegramAdSaleId: saleId,
                })
              ).map((item) => item.id)
            : [];
        return changed;
      })
    : await operations.prisma.telegramAdSalePlacement.update({
        where: { id: placementId },
        data,
      });
  await operations.notificationProjector?.publish(notificationIds);
  operations.invalidateAvailabilityCache(workspaceId);
  return {
    ...operations.mapPlacement(updated),
    warnings: updated.agreedPrice.lt(updated.minimumPrice)
      ? [
          {
            code: 'UNDER_MINIMUM_PRICE',
            message: 'Placement price is below minimum',
          },
        ]
      : [],
  };
}

export async function createManagedPostFromPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSaleDetails'
    | 'prisma'
    | 'telegramManagedPostCommandService'
    | 'telegramPostGroupsService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  dto: CreatePlacementManagedPostDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const placement = sale.placements.find((item: any) => item.id === placementId);
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  const managedPostDeleteAfterHours = placement.isPermanentSnapshot
    ? null
    : (([24, 48, 72] as const).find((hours) => hours === placement.deleteAfterHoursSnapshot) ?? null);
  const advertiseGroup = await operations.telegramPostGroupsService.ensureAdvertiseSystemGroup(
    workspaceId,
    placement.telegramChannelId,
    dto.assignedMemberId ?? sale.assignedMemberId ?? undefined,
  );
  const managedPost = await operations.telegramManagedPostCommandService.createManagedPost(
    userId,
    placement.telegramChannelId,
    {
      title: dto.title?.trim() || `[AD] ${sale.title?.trim() || sale.advertiserName} / ${sale.id}`,
      text: dto.text ?? undefined,
      imageUrls: dto.imageUrls ?? [],
      mediaItems: dto.mediaItems,
      assignedMemberId: dto.assignedMemberId ?? sale.assignedMemberId ?? undefined,
      icon: dto.icon ?? null,
      // Keep the managed post's removal policy in sync with the immutable
      // format snapshot stored on this placement.
      deleteAfterHours: managedPostDeleteAfterHours,
      buttonRows: dto.buttonRows ?? [],
    },
    { groupId: advertiseGroup.id },
  );
  await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placementId },
    data: { managedPostId: managedPost.id },
  });
  return managedPost;
}

export async function attachManagedPost(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'appendPlacementFinancials'
    | 'ensurePlacementBelongsToSale'
    | 'mapPlacement'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'telegramPostGroupsService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  dto: AttachPlacementManagedPostDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
  if (
    placement.status === TelegramAdPlacementStatus.CANCELLED ||
    placement.status === TelegramAdPlacementStatus.COMPLETED
  ) {
    throw new BadRequestException('Placement cannot accept a managed post in its current status');
  }
  if (!dto.managedPostId && !dto.telegramPostId && !dto.telegramPostUrl) {
    throw new BadRequestException('managedPostId or telegramPostId is required');
  }
  let resolvedTelegramPostId = dto.telegramPostId;
  if (dto.telegramPostUrl) {
    const parsed = parseTelegramPostUrl(dto.telegramPostUrl.trim());
    if (!parsed) throw new BadRequestException('Invalid Telegram post URL');
    const channel = await operations.prisma.telegramChannel.findFirst({
      where: { id: placement.telegramChannelId, workspaceId },
      select: { username: true, telegramChatId: true },
    });
    const channelMatches =
      parsed.kind === 'public'
        ? channel?.username?.replace(/^@/, '').toLowerCase() === parsed.username
        : channel?.telegramChatId?.replace(/^-100/, '') === parsed.chatId;
    if (!channelMatches) {
      throw new BadRequestException('This post does not belong to this channel.');
    }
    resolvedTelegramPostId = (
      await operations.prisma.telegramPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
          telegramMessageId: parsed.messageId,
        },
        select: { id: true },
      })
    )?.id;
    if (!resolvedTelegramPostId) {
      throw new NotFoundException('Telegram post is not synchronized yet. Sync the channel and try again.');
    }
  }
  if (resolvedTelegramPostId) {
    const telegramPost = await operations.prisma.telegramPost.findFirst({
      where: {
        id: resolvedTelegramPostId,
        workspaceId,
        telegramChannelId: placement.telegramChannelId,
      },
    });
    if (!telegramPost) throw new NotFoundException('Telegram post not found');
    const updated = await operations.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        telegramPostId: telegramPost.id,
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: telegramPost.postDate,
        plannedDeleteAt: calculateAdPlacementDeleteAt({
          scheduledAt: placement.scheduledAt,
          publishedAt: telegramPost.postDate,
          deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
          isPermanentSnapshot: placement.isPermanentSnapshot,
        }),
      },
    });
    operations.notifyAdDeletionDueWorkChanged();
    return operations.mapPlacement(operations.appendPlacementFinancials(updated));
  }
  const managedPost = await operations.prisma.telegramManagedPost.findFirst({
    where: {
      id: dto.managedPostId,
      workspaceId,
      telegramChannelId: placement.telegramChannelId,
    },
  });
  if (!managedPost) throw new NotFoundException('Managed post not found');
  const advertiseGroup = await operations.telegramPostGroupsService.ensureAdvertiseSystemGroup(
    workspaceId,
    placement.telegramChannelId,
    managedPost.assignedMemberId,
  );
  await operations.telegramPostGroupsService.addPostsToGroup(userId, advertiseGroup.id, {
    postIds: [managedPost.id],
  });
  let telegramPostId: string | null = null;
  let telegramPublishedAt: Date | null = null;
  const isPublishedManagedPost =
    managedPost.status === TelegramManagedPostStatus.PUBLISHED &&
    managedPost.telegramIdVerificationStatus === TelegramManagedPostIdVerificationStatus.VERIFIED;
  if (isPublishedManagedPost && managedPost.telegramMessageIds.length) {
    const telegramPost = await operations.prisma.telegramPost.findFirst({
      where: {
        workspaceId,
        telegramChannelId: placement.telegramChannelId,
        telegramMessageId: { in: managedPost.telegramMessageIds },
      },
      orderBy: { postDate: 'desc' },
    });
    telegramPostId = telegramPost?.id ?? null;
    telegramPublishedAt = telegramPost?.postDate ?? null;
  }
  const publishedAt = telegramPublishedAt ?? managedPost.publishedAt ?? placement.scheduledAt;
  const updated = await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placementId },
    data: {
      managedPostId: managedPost.id,
      ...(isPublishedManagedPost
        ? {
            status: TelegramAdPlacementStatus.PUBLISHED,
            publishedAt,
            plannedDeleteAt: calculateAdPlacementDeleteAt({
              scheduledAt: placement.scheduledAt,
              publishedAt,
              deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
              isPermanentSnapshot: placement.isPermanentSnapshot,
            }),
            telegramPostId,
          }
        : {}),
    },
  });
  if (isPublishedManagedPost) operations.notifyAdDeletionDueWorkChanged();
  if (isPublishedManagedPost) {
  }
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}

export async function detachManagedPost(
  operations: Pick<
    TelegramAdSalesOperations,
    'appendPlacementFinancials' | 'mapPlacement' | 'prisma' | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.prisma.telegramAdSalePlacement.findFirst({
    where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
    include: {
      managedPost: true,
      paymentAllocations: { include: { payment: true } },
    },
  });
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  if (placement.managedPost && placement.managedPost.status === TelegramManagedPostStatus.PUBLISHED) {
    throw new BadRequestException('Published managed post cannot be detached');
  }
  const updated = await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placementId },
    data: { managedPostId: null },
  });
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}
