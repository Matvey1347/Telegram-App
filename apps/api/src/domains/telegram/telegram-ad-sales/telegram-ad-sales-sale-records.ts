import { BadRequestException } from '@nestjs/common';
import {
  TelegramAdCrmDealStage,
  TelegramAdPlacementStatus,
  TelegramAdSaleOrigin,
  TelegramAdSaleStatus,
  TelegramAdvertiserActivityType,
} from '@prisma/client';
import {
  CreateTelegramAdSaleDto,
  ReserveTelegramAdSaleDto,
  TelegramAdSalesQueryDto,
  UpdateTelegramAdSaleDto,
} from './dto';
import { resolveAdSaleCommissionSnapshot } from './telegram-ad-sales-commission';
import {
  assertNoActiveSalePayments,
  cancelAdSaleRecords,
  cancelAdSaleNativePosts,
  deleteAdSaleRecords,
  isDedicatedSaleCancellation,
} from './telegram-ad-sales-lifecycle-records';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function listSales(
  operations: Pick<TelegramAdSalesOperations, 'saleReadService'>,
  userId: string,
  query: TelegramAdSalesQueryDto,
) {
  return operations.saleReadService.listSales(userId, query);
}

export async function getSale(
  operations: Pick<TelegramAdSalesOperations, 'getSaleDetails' | 'mapSale' | 'workspace'>,
  userId: string,
  id: string,
) {
  const workspaceId = await operations.workspace(userId);
  return operations.mapSale(await operations.getSaleDetails(workspaceId, id));
}

export async function createSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'createAdvertiserActivity'
    | 'includeSaleRelations'
    | 'mapSale'
    | 'normalizeTelegramUsername'
    | 'prisma'
    | 'recalculateAdvertiserStats'
    | 'resolveAdvertiserForSale'
    | 'workspaceService'
  >,
  userId: string,
  dto: CreateTelegramAdSaleDto,
) {
  const { workspaceId, assignedMemberId } = await operations.workspaceService.resolveAssignedMemberId(
    userId,
    dto.assignedMemberId,
  );
  const advertiser = await operations.resolveAdvertiserForSale(workspaceId, userId, dto, assignedMemberId);
  const sellerMemberId =
    dto.sellerMemberId === undefined
      ? assignedMemberId
      : (await operations.workspaceService.resolveAssignedMemberId(userId, dto.sellerMemberId))
          .assignedMemberId;
  const commissionSnapshot = await resolveAdSaleCommissionSnapshot(
    operations.prisma,
    workspaceId,
    sellerMemberId,
  );
  const sale = await operations.prisma.telegramAdSale.create({
    data: {
      workspaceId,
      advertiserId: advertiser?.id ?? dto.advertiserId ?? null,
      advertiserName: dto.advertiserName.trim(),
      advertiserTelegram: dto.advertiserTelegram?.trim() || null,
      advertiserContact: dto.advertiserContact?.trim() || null,
      advertiserNameSnapshot: advertiser?.displayName ?? dto.advertiserName.trim(),
      advertiserTelegramSnapshot:
        advertiser?.telegramUsername ?? operations.normalizeTelegramUsername(dto.advertiserTelegram),
      advertiserCompanySnapshot: advertiser?.companyName ?? (dto.advertiserCompanyName?.trim() || null),
      title: dto.title?.trim() || null,
      notes: dto.notes?.trim() || null,
      origin: dto.origin ?? TelegramAdSaleOrigin.DIRECT,
      crmDealStage: dto.crmDealStage ?? TelegramAdCrmDealStage.NEW_LEAD,
      expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
      lostReason: dto.lostReason?.trim() || null,
      nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
      settlementCurrency: dto.settlementCurrency,
      reservedUntil: dto.reservedUntil ? new Date(dto.reservedUntil) : null,
      sourceTaskId: dto.sourceTaskId ?? null,
      sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId ?? null,
      createdByUserId: userId,
      assignedMemberId,
      ...commissionSnapshot,
    },
    include: operations.includeSaleRelations(),
  });
  if (sale.advertiserId) {
    await operations.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    await operations.createAdvertiserActivity(workspaceId, sale.advertiserId, {
      type: TelegramAdvertiserActivityType.SALE_CREATED,
      title: sale.title?.trim() || sale.advertiserName,
      saleId: sale.id,
      actorUserId: userId,
    });
  }
  return operations.mapSale(sale);
}

export async function updateSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'assertSaleTransition'
    | 'cancelSale'
    | 'createAdvertiserActivity'
    | 'getAdvertiser'
    | 'getSaleDetails'
    | 'includeSaleRelations'
    | 'invalidateAvailabilityCache'
    | 'mapSale'
    | 'prisma'
    | 'recalculateAdvertiserStats'
    | 'workspace'
    | 'workspaceService'
  >,
  userId: string,
  id: string,
  dto: UpdateTelegramAdSaleDto,
) {
  if (isDedicatedSaleCancellation(dto)) return operations.cancelSale(userId, id);
  const workspaceId = await operations.workspace(userId);
  const existing = await operations.getSaleDetails(workspaceId, id);
  const assignedMemberId =
    dto.assignedMemberId === undefined
      ? undefined
      : (await operations.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId))
          .assignedMemberId;
  const sellerMemberId =
    dto.sellerMemberId === undefined
      ? undefined
      : (await operations.workspaceService.resolveAssignedMemberId(userId, dto.sellerMemberId))
          .assignedMemberId;
  const commissionSnapshot =
    sellerMemberId === undefined
      ? undefined
      : await resolveAdSaleCommissionSnapshot(operations.prisma, workspaceId, sellerMemberId);
  if (dto.status) {
    operations.assertSaleTransition(existing.status, dto.status);
    if (dto.status === TelegramAdSaleStatus.CONFIRMED && !existing.placements.length) {
      throw new BadRequestException('Cannot confirm sale without placements');
    }
  }
  const linkedAdvertiser =
    dto.advertiserId === undefined
      ? existing.advertiser
      : dto.advertiserId
        ? await operations.getAdvertiser(workspaceId, dto.advertiserId)
        : null;
  if (dto.crmDealStage === TelegramAdCrmDealStage.LOST && !dto.lostReason && !existing.lostReason) {
    throw new BadRequestException('lostReason is required when crmDealStage is LOST');
  }
  const sale = await operations.prisma.telegramAdSale.update({
    where: { id },
    data: {
      ...(dto.advertiserId === undefined ? {} : { advertiserId: dto.advertiserId }),
      ...(dto.advertiserName === undefined ? {} : { advertiserName: dto.advertiserName.trim() }),
      ...(dto.advertiserTelegram === undefined
        ? {}
        : { advertiserTelegram: dto.advertiserTelegram?.trim() || null }),
      ...(dto.advertiserContact === undefined
        ? {}
        : { advertiserContact: dto.advertiserContact?.trim() || null }),
      ...(dto.advertiserCompanyName === undefined
        ? {}
        : {
            advertiserCompanySnapshot: dto.advertiserCompanyName?.trim() || null,
          }),
      ...(dto.title === undefined ? {} : { title: dto.title?.trim() || null }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes?.trim() || null }),
      ...(dto.origin === undefined ? {} : { origin: dto.origin }),
      ...(dto.settlementCurrency === undefined ? {} : { settlementCurrency: dto.settlementCurrency }),
      ...(dto.reservedUntil === undefined
        ? {}
        : {
            reservedUntil: dto.reservedUntil ? new Date(dto.reservedUntil) : null,
          }),
      ...(assignedMemberId === undefined ? {} : { assignedMemberId }),
      ...(commissionSnapshot ?? {}),
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(dto.crmDealStage === undefined ? {} : { crmDealStage: dto.crmDealStage }),
      ...(dto.expectedCloseAt === undefined
        ? {}
        : {
            expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
          }),
      ...(dto.lostReason === undefined ? {} : { lostReason: dto.lostReason?.trim() || null }),
      ...(dto.nextActionAt === undefined
        ? {}
        : {
            nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
          }),
      ...(dto.sourceTaskId === undefined ? {} : { sourceTaskId: dto.sourceTaskId }),
      ...(dto.sourceAdvertiserActivityId === undefined
        ? {}
        : { sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId }),
      ...(dto.advertiserId === undefined &&
      dto.advertiserName === undefined &&
      dto.advertiserTelegram === undefined &&
      dto.advertiserCompanyName === undefined
        ? {}
        : {
            advertiserNameSnapshot:
              dto.advertiserName?.trim() ||
              (linkedAdvertiser?.displayName ?? existing.advertiserNameSnapshot ?? existing.advertiserName),
            advertiserTelegramSnapshot:
              dto.advertiserTelegram === undefined
                ? (linkedAdvertiser?.telegramUsername ??
                  existing.advertiserTelegramSnapshot ??
                  existing.advertiserTelegram)
                : dto.advertiserTelegram?.trim() || null,
            advertiserCompanySnapshot:
              dto.advertiserCompanyName === undefined
                ? (linkedAdvertiser?.companyName ?? existing.advertiserCompanySnapshot ?? null)
                : dto.advertiserCompanyName?.trim() || null,
          }),
    },
    include: operations.includeSaleRelations(),
  });
  operations.invalidateAvailabilityCache(workspaceId);
  if (sale.advertiserId) {
    await operations.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
  }
  if (dto.crmDealStage && sale.advertiserId) {
    await operations.createAdvertiserActivity(workspaceId, sale.advertiserId, {
      type: TelegramAdvertiserActivityType.SALE_STAGE_CHANGED,
      title: `Sale stage changed to ${dto.crmDealStage}`,
      saleId: sale.id,
      actorUserId: userId,
    });
  }
  return operations.mapSale(sale);
}

export async function deleteSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'deletePublishedPlacement'
    | 'getSaleDetails'
    | 'invalidateAvailabilityCache'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'recalculateAdvertiserStats'
    | 'telegramManagedPostPublicationService'
    | 'workspace'
  >,
  userId: string,
  id: string,
) {
  const workspaceId = await operations.workspace(userId);
  const existing = await operations.getSaleDetails(workspaceId, id);
  const channelIds = [
    ...new Set(
      existing.placements.map((placement: { telegramChannelId: string }) => placement.telegramChannelId),
    ),
  ];
  const publishedPlacements = existing.placements.filter(
    (placement) =>
      placement.publishedAt &&
      !placement.deletedAt &&
      (placement.managedPost?.telegramMessageIds.length || placement.telegramPost?.telegramMessageId),
  );
  const cancellationClaims = await cancelAdSaleNativePosts(
    workspaceId,
    existing.placements,
    operations.telegramManagedPostPublicationService,
  );
  for (const placement of publishedPlacements) {
    await operations.deletePublishedPlacement(workspaceId, placement.id, {
      notifyScheduler: false,
    });
  }

  const transactionIds = existing.payments.flatMap((payment) =>
    [payment.transaction?.id, payment.reversalTransaction?.id].filter(
      (transactionId): transactionId is string => Boolean(transactionId),
    ),
  );
  const managedPostIds = existing.placements.flatMap((placement) =>
    placement.managedPost?.id ? [placement.managedPost.id] : [],
  );
  const telegramPostIds = existing.placements.flatMap((placement) =>
    placement.telegramPost?.id ? [placement.telegramPost.id] : [],
  );
  await operations.prisma.$transaction(async (tx) => {
    await deleteAdSaleRecords(tx, {
      workspaceId,
      saleId: id,
      transactionIds,
      managedPostIds,
      telegramPostIds,
      cancellationClaims,
    });
  });
  operations.invalidateAvailabilityCache(workspaceId);
  operations.notifyAdDeletionDueWorkChanged();
  if (existing.advertiserId) await operations.recalculateAdvertiserStats(workspaceId, existing.advertiserId);
  return { id, channelIds };
}

export async function reserveSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'assertSaleTransition'
    | 'getSaleDetails'
    | 'includeSaleRelations'
    | 'logger'
    | 'mapSale'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  dto: ReserveTelegramAdSaleDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const targetPlacements = dto.placements?.length
    ? sale.placements.filter((placement) => dto.placements?.some((item) => item.placementId === placement.id))
    : sale.placements;
  if (!targetPlacements.length) {
    throw new BadRequestException('No placements selected for reservation');
  }

  const reserved = await operations.prisma.$transaction(async (tx) => {
    operations.assertSaleTransition(sale.status, TelegramAdSaleStatus.RESERVED);
    for (const placement of targetPlacements) {
      const override = dto.placements?.find((item) => item.placementId === placement.id);
      const scheduledAt = override?.scheduledAt ? new Date(override.scheduledAt) : placement.scheduledAt;
      await tx.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          scheduledAt,
          status: TelegramAdPlacementStatus.RESERVED,
        },
      });
    }
    await tx.telegramAdSale.update({
      where: { id: saleId },
      data: { status: TelegramAdSaleStatus.RESERVED },
    });
    return tx.telegramAdSale.findUniqueOrThrow({
      where: { id: saleId },
      include: operations.includeSaleRelations(),
    });
  });

  operations.logger.info({
    event: 'telegram_ad_sales.slot_reserved',
    message: `Reserved sale ${saleId}`,
    metadata: {
      saleId,
      placements: targetPlacements.map((placement) => placement.id),
    },
  });
  return operations.mapSale(reserved);
}

export async function confirmSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'assertSaleTransition'
    | 'getSaleDetails'
    | 'includeSaleRelations'
    | 'logger'
    | 'mapSale'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  operations.assertSaleTransition(sale.status, TelegramAdSaleStatus.CONFIRMED);
  if (!sale.placements.length) {
    throw new BadRequestException('Cannot confirm sale without placements');
  }
  const confirmedSale = await operations.prisma.$transaction(async (tx) => {
    await tx.telegramAdSalePlacement.updateMany({
      where: {
        workspaceId,
        telegramAdSaleId: saleId,
        status: TelegramAdPlacementStatus.RESERVED,
      },
      data: { status: TelegramAdPlacementStatus.RESERVED },
    });
    await tx.telegramAdSale.update({
      where: { id: saleId },
      data: { status: TelegramAdSaleStatus.CONFIRMED },
    });
    return tx.telegramAdSale.findUniqueOrThrow({
      where: { id: saleId },
      include: operations.includeSaleRelations(),
    });
  });
  operations.logger.info({
    event: 'telegram_ad_sales.sale_confirmed',
    message: `Confirmed sale ${saleId}`,
    metadata: { saleId },
  });
  return operations.mapSale(confirmedSale);
}

export async function cancelSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'assertSaleTransition'
    | 'getSaleDetails'
    | 'includeSaleRelations'
    | 'logger'
    | 'mapSale'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  operations.assertSaleTransition(sale.status, TelegramAdSaleStatus.CANCELLED);
  assertNoActiveSalePayments(sale.payments ?? []);
  const cancelledSale = await operations.prisma.$transaction((tx) =>
    cancelAdSaleRecords(tx, workspaceId, saleId, operations.includeSaleRelations()),
  );
  operations.logger.info({
    event: 'telegram_ad_sales.sale_cancelled',
    message: `Cancelled sale ${saleId}`,
    metadata: { saleId },
  });
  return operations.mapSale(cancelledSale);
}
