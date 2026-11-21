import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type TelegramAdSalePublicationDeletionProgress } from '@telegram-system/shared';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { runBounded } from '../../../common/run-bounded';
import {
  CancelPlacementDto,
  CompletePermanentPlacementDto,
  PublishPlacementDto,
  ReschedulePlacementDto,
  SchedulePlacementDto,
  ScheduleSaleDto,
} from './dto';
import { decimalToString } from './domain/decimal';
import { reconcileTelegramAdPlacementMetrics } from './telegram-ad-placement-metrics';
import {
  loadAdPublicationPlacement,
  publishAdPlacement,
  reconcileAdPlacement,
} from './telegram-ad-single-placement-publication';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export function assertSaleTransition(
  _operations: unknown,
  from: TelegramAdSaleStatus,
  to: TelegramAdSaleStatus,
) {
  const transitions: Record<TelegramAdSaleStatus, TelegramAdSaleStatus[]> = {
    DRAFT: [TelegramAdSaleStatus.RESERVED, TelegramAdSaleStatus.CANCELLED],
    RESERVED: [TelegramAdSaleStatus.CONFIRMED, TelegramAdSaleStatus.CANCELLED],
    CONFIRMED: [TelegramAdSaleStatus.IN_PROGRESS, TelegramAdSaleStatus.CANCELLED],
    IN_PROGRESS: [TelegramAdSaleStatus.COMPLETED, TelegramAdSaleStatus.CANCELLED],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (!transitions[from].includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_SALE_STATUS_TRANSITION',
      message: `Cannot move sale from ${from} to ${to}`,
    });
  }
}

export function assertPlacementTransition(
  _operations: unknown,
  from: TelegramAdPlacementStatus,
  to: TelegramAdPlacementStatus,
) {
  const transitions: Record<TelegramAdPlacementStatus, TelegramAdPlacementStatus[]> = {
    DRAFT: [TelegramAdPlacementStatus.RESERVED, TelegramAdPlacementStatus.CANCELLED],
    RESERVED: [
      TelegramAdPlacementStatus.SCHEDULED,
      TelegramAdPlacementStatus.CANCELLED,
      TelegramAdPlacementStatus.MISSED,
    ],
    SCHEDULED: [
      TelegramAdPlacementStatus.PUBLISHED,
      TelegramAdPlacementStatus.CANCELLED,
      TelegramAdPlacementStatus.MISSED,
    ],
    PUBLISHED: [TelegramAdPlacementStatus.COMPLETED],
    COMPLETED: [],
    CANCELLED: [],
    MISSED: [],
  };
  if (!transitions[from].includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_PLACEMENT_STATUS_TRANSITION',
      message: `Cannot move placement from ${from} to ${to}`,
    });
  }
}

export async function schedulePlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'appendPlacementFinancials'
    | 'assertPlacementTransition'
    | 'botConfirmation'
    | 'getSaleDetails'
    | 'mapPlacement'
    | 'prisma'
    | 'telegramManagedPostPublicationService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  dto: SchedulePlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const placement = sale.placements.find((item: any) => item.id === placementId);
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  if (!placement.managedPostId) {
    throw new BadRequestException('Managed post is required before scheduling');
  }
  if (sale.status === TelegramAdSaleStatus.DRAFT) {
    throw new BadRequestException('Confirm sale before scheduling');
  }
  operations.assertPlacementTransition(placement.status, TelegramAdPlacementStatus.SCHEDULED);
  const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : placement.scheduledAt;
  await operations.telegramManagedPostPublicationService.scheduleManagedPost(
    userId,
    placement.telegramChannelId,
    placement.managedPostId,
    {
      scheduledAt: scheduledAt.toISOString(),
      longTextMode: dto.longTextMode,
    },
  );
  const updated = await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placementId },
    data: {
      scheduledAt,
      scheduledManagedAt: scheduledAt,
      status: TelegramAdPlacementStatus.SCHEDULED,
      plannedDeleteAt: null,
    },
    include: { paymentAllocations: { include: { payment: true } } },
  });
  if (sale.status === TelegramAdSaleStatus.CONFIRMED) {
    await operations.prisma.telegramAdSale.update({
      where: { id: sale.id },
      data: { status: TelegramAdSaleStatus.IN_PROGRESS },
    });
  }
  await operations.botConfirmation.sendScheduledOnce(userId, saleId);
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}

export async function recreateScheduledPostsViaBot(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSale'
    | 'getSaleDetails'
    | 'telegramChannelAccessService'
    | 'telegramManagedPostPublicationService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const placements = sale.placements.filter(
    (placement) =>
      placement.status === TelegramAdPlacementStatus.SCHEDULED &&
      placement.managedPost?.sourceType === TelegramSourceType.MTPROTO &&
      placement.managedPost.telegramScheduledMessageIds?.length,
  );
  if (!placements.length) {
    throw new BadRequestException('This deal has no MTProto scheduled advertising posts to recreate');
  }

  for (const placement of placements) {
    await operations.telegramChannelAccessService.checkProductionBotPublishingAccess(
      userId,
      placement.telegramChannelId,
    );
  }

  for (const placement of placements) {
    await operations.telegramManagedPostPublicationService.returnManagedPostToDraft(
      userId,
      placement.telegramChannelId,
      placement.managedPost!.id,
    );
    await operations.telegramManagedPostPublicationService.scheduleManagedPost(
      userId,
      placement.telegramChannelId,
      placement.managedPost!.id,
      { scheduledAt: placement.scheduledAt.toISOString() },
    );
  }
  return operations.getSale(userId, saleId);
}

export async function scheduleSale(
  operations: Pick<
    TelegramAdSalesOperations,
    'botConfirmation' | 'getSaleDetails' | 'publishPlacement' | 'schedulePlacement' | 'workspace'
  >,
  userId: string,
  saleId: string,
  dto: ScheduleSaleDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const targets = dto.placements?.length
    ? sale.placements.filter((placement: any) =>
        dto.placements?.some((item) => item.placementId === placement.id),
      )
    : sale.placements.filter((placement: any) => Boolean(placement.managedPostId));
  const results: Array<Record<string, unknown>> = [];
  for (const placement of targets) {
    try {
      const override = dto.placements?.find((item) => item.placementId === placement.id);
      const targetDate = override?.scheduledAt
        ? new Date(override.scheduledAt)
        : new Date(placement.scheduledAt);
      // Never publish before the booked instant. Bot API posts are scheduled
      // locally and the due worker releases them only once this time arrives.
      const scheduled =
        targetDate.getTime() <= Date.now()
          ? await operations.publishPlacement(userId, saleId, placement.id, {
              longTextMode: override?.longTextMode,
            })
          : await operations.schedulePlacement(userId, saleId, placement.id, {
              scheduledAt: targetDate.toISOString(),
              longTextMode: override?.longTextMode,
            });
      results.push({
        placementId: placement.id,
        success: true,
        status: scheduled.status,
        scheduledAt: scheduled.scheduledAt,
      });
    } catch (error) {
      results.push({
        placementId: placement.id,
        success: false,
        error: error instanceof Error ? error.message : 'Could not schedule placement',
      });
    }
  }
  await operations.botConfirmation.sendScheduledOnce(userId, saleId);
  return { saleId, results };
}

export async function publishPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'appendPlacementFinancials'
    | 'botConfirmation'
    | 'mapPlacement'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'telegramManagedPostPublicationService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  dto: PublishPlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await loadAdPublicationPlacement(operations.prisma, workspaceId, saleId, placementId);
  const updated = await publishAdPlacement(operations.prisma, placement, () =>
    operations.telegramManagedPostPublicationService.publishManagedPostNow(
      userId,
      placement.telegramChannelId,
      placement.managedPostId!,
      { longTextMode: dto.longTextMode },
    ),
  );
  operations.notifyAdDeletionDueWorkChanged();
  await operations.botConfirmation.sendScheduledOnce(userId, saleId);
  await operations.botConfirmation.sendPublishedOnce(saleId);
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}

export async function reconcilePublishedPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    'getSale' | 'notifyAdDeletionDueWorkChanged' | 'prisma' | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await loadAdPublicationPlacement(operations.prisma, workspaceId, saleId, placementId);
  await reconcileAdPlacement(operations.prisma, placement);
  operations.notifyAdDeletionDueWorkChanged();
  return operations.getSale(userId, saleId);
}

export async function reschedulePlacement(
  operations: Pick<TelegramAdSalesOperations, 'schedulePlacement'>,
  userId: string,
  saleId: string,
  placementId: string,
  dto: ReschedulePlacementDto,
) {
  return operations.schedulePlacement(userId, saleId, placementId, dto);
}

export async function cancelPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    'appendPlacementFinancials' | 'mapPlacement' | 'prisma' | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  _dto: CancelPlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.prisma.telegramAdSalePlacement.findFirst({
    where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
    include: {
      paymentAllocations: { include: { payment: true } },
      managedPost: true,
    },
  });
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  if (placement.status === TelegramAdPlacementStatus.PUBLISHED) {
    throw new BadRequestException('Published placement requires a separate completion/deletion flow');
  }
  const hasPaidAllocation = (placement.paymentAllocations ?? []).some(
    (allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
  );
  if (hasPaidAllocation) {
    throw new BadRequestException('Paid placement cannot be cancelled without payment reversal');
  }
  const updated = await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placementId },
    data: { status: TelegramAdPlacementStatus.CANCELLED },
    include: { paymentAllocations: { include: { payment: true } } },
  });
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}

export async function cancelSalePublications(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSale'
    | 'getSaleDetails'
    | 'invalidateAvailabilityCache'
    | 'prisma'
    | 'telegramManagedPostMoveService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  onProgress?: (item: TelegramAdSalePublicationDeletionProgress, current: number, total: number) => void,
  signal?: AbortSignal,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const cancellableStatuses: TelegramAdPlacementStatus[] = [
    TelegramAdPlacementStatus.DRAFT,
    TelegramAdPlacementStatus.RESERVED,
    TelegramAdPlacementStatus.SCHEDULED,
  ];
  // A previous version of this action only returned scheduled posts to
  // drafts. Include those already-cancelled placements when they still own a
  // managed post so the new deletion action cleans up that legacy state too.
  const placements = sale.placements.filter(
    (placement) =>
      cancellableStatuses.includes(placement.status) ||
      (placement.status === TelegramAdPlacementStatus.CANCELLED && Boolean(placement.managedPostId)),
  );
  if (!placements.length) {
    throw new BadRequestException('This deal has no unpublished placements to cancel');
  }

  const results: TelegramAdSalePublicationDeletionProgress[] = [];
  for (const [offset, placement] of placements.entries()) {
    if (signal?.aborted) {
      const abortError = new Error('Publication deletion was cancelled');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const managedPostId = placement.managedPostId;
    onProgress?.(
      {
        placementId: placement.id,
        telegramChannelId: placement.telegramChannelId,
        managedPostId,
        state: 'DELETING',
        success: false,
        message: managedPostId
          ? 'Deleting the scheduled post from Telegram and the system'
          : 'Removing the unpublished placement from the deal',
      },
      offset,
      placements.length,
    );
    try {
      if (managedPostId) {
        await operations.telegramManagedPostMoveService.deleteManagedPost(
          userId,
          placement.telegramChannelId,
          managedPostId,
        );
      }
      await operations.prisma.telegramAdSalePlacement.updateMany({
        where: {
          id: placement.id,
          workspaceId,
          telegramAdSaleId: saleId,
          status: {
            in: [...cancellableStatuses, TelegramAdPlacementStatus.CANCELLED],
          },
        },
        data: {
          status: TelegramAdPlacementStatus.CANCELLED,
          // The database relation also uses onDelete: SetNull. Set this
          // explicitly so the placement cannot retain a local publication
          // reference if deletion semantics change in a future migration.
          managedPostId: null,
          scheduledManagedAt: null,
        },
      });
      const result = {
        placementId: placement.id,
        telegramChannelId: placement.telegramChannelId,
        managedPostId,
        state: 'DELETED' as const,
        success: true,
        message: managedPostId ? 'Publication deleted from the system' : 'Unpublished placement cancelled',
      };
      results.push(result);
      onProgress?.(result, offset + 1, placements.length);
    } catch (error) {
      const result = {
        placementId: placement.id,
        telegramChannelId: placement.telegramChannelId,
        managedPostId,
        state: 'FAILED' as const,
        success: false,
        message: error instanceof Error ? error.message : 'Could not delete publication',
      };
      results.push(result);
      onProgress?.(result, offset + 1, placements.length);
    }
  }
  operations.invalidateAvailabilityCache(workspaceId);
  return {
    sale: await operations.getSale(userId, saleId),
    deleted: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}

export async function completePermanentPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'appendPlacementFinancials'
    | 'ensurePlacementBelongsToSale'
    | 'mapPlacement'
    | 'prisma'
    | 'reconcilePlacementMetrics'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  _dto: CompletePermanentPlacementDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
  if (!placement.isPermanentSnapshot) {
    throw new BadRequestException('Only permanent placements can be completed manually');
  }
  if (placement.status !== TelegramAdPlacementStatus.PUBLISHED) {
    throw new BadRequestException('Only published permanent placements can be completed');
  }
  const metrics = await operations.reconcilePlacementMetrics(workspaceId, placement.id);
  const updated = await operations.prisma.telegramAdSalePlacement.update({
    where: { id: placement.id },
    data: {
      status: TelegramAdPlacementStatus.COMPLETED,
      completedAt: new Date(),
      actualViewsFinal: metrics.actualViewsFinal ?? placement.actualViewsFinal,
      actualReactionsFinal: metrics.actualReactionsFinal ?? placement.actualReactionsFinal,
      actualCpm: metrics.actualCpm ?? placement.actualCpm,
    },
    include: { paymentAllocations: { include: { payment: true } } },
  });
  return operations.mapPlacement(operations.appendPlacementFinancials(updated));
}

export async function reconcilePlacementMetrics(
  operations: Pick<TelegramAdSalesOperations, 'prisma'>,
  workspaceId: string,
  placementId: string,
) {
  return reconcileTelegramAdPlacementMetrics(operations.prisma, workspaceId, placementId);
}

export async function reconcileSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSale'
    | 'getSaleDetails'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'reconcilePlacementMetrics'
    | 'telegramManagedPostRemoteSyncService'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const channelIds = [...new Set(sale.placements.map((placement: any) => placement.telegramChannelId))];
  for (const channelId of channelIds) {
    await operations.telegramManagedPostRemoteSyncService.syncManagedPosts(userId, channelId);
  }

  const refreshed = await operations.getSaleDetails(workspaceId, saleId);
  let dueWorkChanged = false;
  await runBounded(refreshed.placements, 4, async (placement) => {
    const metrics = await operations.reconcilePlacementMetrics(workspaceId, placement.id);
    const managedPost = await operations.prisma.telegramManagedPost.findFirst({
      where: { id: placement.managedPostId ?? undefined, workspaceId },
    });
    const updateData: Prisma.TelegramAdSalePlacementUpdateInput = {
      actualViews24h: metrics.actualViews24h,
      actualViews48h: metrics.actualViews48h,
      actualViewsFinal: metrics.actualViewsFinal,
      actualReactionsFinal: metrics.actualReactionsFinal,
      actualCpm: metrics.actualCpm,
    };
    const managedIdentityVerified =
      managedPost?.status === TelegramManagedPostStatus.PUBLISHED &&
      managedPost.telegramIdVerificationStatus === TelegramManagedPostIdVerificationStatus.VERIFIED;
    const telegramPublishedAt = placement.telegramPost?.postDate ?? null;
    if (managedIdentityVerified) {
      updateData.status = TelegramAdPlacementStatus.PUBLISHED;
      const publishedAt = telegramPublishedAt ?? managedPost.publishedAt ?? new Date();
      updateData.publishedAt = publishedAt;
      updateData.plannedDeleteAt = calculateAdPlacementDeleteAt({
        scheduledAt: placement.scheduledAt,
        publishedAt,
        deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
        isPermanentSnapshot: placement.isPermanentSnapshot,
      });
      dueWorkChanged = true;
    }
    if (managedPost && !managedIdentityVerified && placement.telegramPostId != null) {
      updateData.telegramPost = { disconnect: true };
    }
    if (
      managedIdentityVerified &&
      placement.telegramPostId == null &&
      managedPost.telegramMessageIds.length
    ) {
      const telegramPost = await operations.prisma.telegramPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
          telegramMessageId: { in: managedPost.telegramMessageIds },
        },
        orderBy: { postDate: 'desc' },
      });
      if (telegramPost) {
        updateData.telegramPost = { connect: { id: telegramPost.id } };
      }
    }
    await operations.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: updateData,
    });
  });
  if (dueWorkChanged) operations.notifyAdDeletionDueWorkChanged();
  if (dueWorkChanged) {
  }
  return operations.getSale(userId, saleId);
}

export async function saleMetrics(
  operations: Pick<
    TelegramAdSalesOperations,
    'getSaleDetails' | 'prisma' | 'reconcilePlacementMetrics' | 'workspace'
  >,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const updated: Array<Record<string, unknown>> = [];
  for (const placement of sale.placements) {
    const metrics = await operations.reconcilePlacementMetrics(workspaceId, placement.id);
    updated.push({
      placementId: placement.id,
      ...metrics,
      actualCpm: decimalToString(metrics.actualCpm),
    });
    await operations.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: {
        actualViews24h: metrics.actualViews24h,
        actualViews48h: metrics.actualViews48h,
        actualViewsFinal: metrics.actualViewsFinal,
        actualReactionsFinal: metrics.actualReactionsFinal,
        actualCpm: metrics.actualCpm,
      },
    });
  }
  return { saleId, placements: updated };
}
