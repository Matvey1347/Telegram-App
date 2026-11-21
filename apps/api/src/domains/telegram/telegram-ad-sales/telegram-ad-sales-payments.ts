import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAdSalePaymentStatus, TransactionType } from '@prisma/client';
import {
  CreateTelegramAdSalePaymentDto,
  UpdateTelegramAdSalePaymentDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { decimal } from './domain/decimal';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

function allocateLegacyFreePayment(amount: number, placements: Array<{ id: string }>) {
  if (!placements.length) return [];
  const minorUnits = Math.round(amount * 100);
  const base = Math.floor(minorUnits / placements.length);
  return placements.map((placement, index) => ({
    placementId: placement.id,
    amount: (base + (index === placements.length - 1 ? minorUnits - base * placements.length : 0)) / 100,
  }));
}

export async function createPayment(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSaleDetails'
    | 'mapPayment'
    | 'prisma'
    | 'recalculateAdvertiserStats'
    | 'resolveRateToPrimary'
    | 'resolveSystemCategory'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  dto: CreateTelegramAdSalePaymentDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const account = await operations.prisma.account.findFirst({
    where: { id: dto.accountId, workspaceId, isActive: true },
  });
  if (!account) throw new NotFoundException('Account not found');
  const paidAt = new Date(dto.paidAt);
  const { primaryCurrency, rate } = await operations.resolveRateToPrimary(workspaceId, dto.currency, paidAt);
  const category = await operations.resolveSystemCategory(workspaceId, 'channel_advertising_revenue');
  const isLegacyFreeSale =
    sale.financeSkipped &&
    sale.placements.length > 0 &&
    sale.placements.every((placement: any) => Number(placement.agreedPrice) <= 0);
  const allocations =
    dto.allocations.length || !isLegacyFreeSale
      ? dto.allocations
      : allocateLegacyFreePayment(dto.amount, sale.placements);
  const allocationPlacementIds = allocations.map((item) => item.placementId);
  const placements = sale.placements.filter((placement: any) =>
    allocationPlacementIds.includes(placement.id),
  );
  if (placements.length !== allocations.length) {
    throw new BadRequestException('One or more allocations refer to invalid placements');
  }
  const allocationTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (allocationTotal - dto.amount > 0.000001) {
    throw new BadRequestException('Allocation total cannot exceed payment amount');
  }
  for (const placement of placements) {
    const requestedAllocation = allocations.find((item) => item.placementId === placement.id)!;
    const paidAlready = (placement.paymentAllocations ?? [])
      .filter((allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED)
      .reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0);
    if (
      !isLegacyFreeSale &&
      paidAlready + requestedAllocation.amount - Number(placement.agreedPrice) > 0.000001
    ) {
      throw new BadRequestException('Allocation exceeds placement agreedPrice');
    }
  }

  if (dto.idempotencyKey) {
    const existing = await operations.prisma.telegramAdSalePayment.findFirst({
      where: { workspaceId, idempotencyKey: dto.idempotencyKey },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    if (existing) return operations.mapPayment(existing);
  }

  const payment = await operations.prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        workspaceId,
        accountId: account.id,
        telegramChannelId: placements.length === 1 ? placements[0].telegramChannelId : null,
        type: TransactionType.income,
        amount: decimal(dto.amount),
        currency: account.currency,
        amountInPrimaryCurrency: decimal(dto.amount * rate),
        exchangeRateToPrimary: decimal(rate),
        category: category.name,
        categoryId: category.id,
        description: dto.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
        date: paidAt,
        assignedMemberId: sale.assignedMemberId ?? null,
        createdByUserId: userId,
      },
    });
    const createdPayment = await tx.telegramAdSalePayment.create({
      data: {
        workspaceId,
        telegramAdSaleId: sale.id,
        accountId: account.id,
        transactionId: transaction.id,
        amount: decimal(dto.amount),
        currency: dto.currency,
        amountInPrimaryCurrency: decimal(dto.amount * rate),
        exchangeRateToPrimary: decimal(rate),
        paidAt,
        notes: dto.notes?.trim() || null,
        idempotencyKey: dto.idempotencyKey?.trim() || null,
        createdByUserId: userId,
        allocations: {
          create: allocations.map((allocation) => ({
            workspaceId,
            telegramAdSalePlacementId: allocation.placementId,
            amount: decimal(allocation.amount),
            currency: dto.currency,
            amountInPrimaryCurrency: decimal(allocation.amount * rate),
          })),
        },
      },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    return createdPayment;
  });
  if (sale.advertiserId) {
    await operations.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
  }
  return operations.mapPayment(payment);
}

export async function listPayments(
  operations: Pick<TelegramAdSalesOperations, 'getSaleDetails' | 'mapPayment' | 'prisma' | 'workspace'>,
  userId: string,
  saleId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getSaleDetails(workspaceId, saleId);
  const payments = await operations.prisma.telegramAdSalePayment.findMany({
    where: { workspaceId, telegramAdSaleId: saleId },
    orderBy: { paidAt: 'asc' },
    include: {
      allocations: true,
      account: true,
      transaction: true,
      reversalTransaction: true,
    },
  });
  return payments.map((payment) => operations.mapPayment(payment));
}

export async function updatePayment(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'getSaleDetails'
    | 'mapPayment'
    | 'prisma'
    | 'recalculateAdvertiserStats'
    | 'resolveRateToPrimary'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  paymentId: string,
  dto: UpdateTelegramAdSalePaymentDto,
) {
  const workspaceId = await operations.workspace(userId);
  const sale = await operations.getSaleDetails(workspaceId, saleId);
  const payment = await operations.prisma.telegramAdSalePayment.findFirst({
    where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
    include: {
      allocations: true,
      account: true,
      transaction: true,
      reversalTransaction: true,
    },
  });
  if (!payment) throw new NotFoundException('Telegram ad sale payment not found');
  if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
    throw new BadRequestException('Cannot update a voided payment');
  }
  const accountId = dto.accountId ?? payment.accountId;
  const account = await operations.prisma.account.findFirst({
    where: { id: accountId, workspaceId, isActive: true },
  });
  if (!account) throw new NotFoundException('Account not found');

  const amount = dto.amount ?? Number(payment.amount);
  const currency = dto.currency ?? payment.currency;
  const paidAt = dto.paidAt ? new Date(dto.paidAt) : payment.paidAt;
  const existingAllocations =
    dto.allocations ??
    payment.allocations.map((allocation: any) => ({
      placementId: allocation.telegramAdSalePlacementId,
      amount: Number(allocation.amount),
    }));
  const isLegacyFreeSale =
    sale.financeSkipped &&
    sale.placements.length > 0 &&
    sale.placements.every((placement: any) => Number(placement.agreedPrice) <= 0);
  const allocations =
    existingAllocations.length || !isLegacyFreeSale
      ? existingAllocations
      : allocateLegacyFreePayment(amount, sale.placements);
  const allocationPlacementIds = allocations.map((item) => item.placementId);
  const placements = sale.placements.filter((placement: any) =>
    allocationPlacementIds.includes(placement.id),
  );
  if (placements.length !== allocations.length) {
    throw new BadRequestException('One or more allocations refer to invalid placements');
  }
  const allocationTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (allocationTotal - amount > 0.000001) {
    throw new BadRequestException('Allocation total cannot exceed payment amount');
  }
  for (const placement of placements) {
    const requestedAllocation = allocations.find((item) => item.placementId === placement.id)!;
    const paidAlready = (placement.paymentAllocations ?? [])
      .filter(
        (allocation: any) =>
          allocation.telegramAdSalePaymentId !== paymentId &&
          allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
      )
      .reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0);
    if (
      !isLegacyFreeSale &&
      paidAlready + requestedAllocation.amount - Number(placement.agreedPrice) > 0.000001
    ) {
      throw new BadRequestException('Allocation exceeds placement agreedPrice');
    }
  }

  const { rate } = await operations.resolveRateToPrimary(workspaceId, currency, paidAt);
  const updated = await operations.prisma.$transaction(async (tx) => {
    if (payment.transactionId) {
      await tx.transaction.update({
        where: { id: payment.transactionId },
        data: {
          accountId: account.id,
          telegramChannelId: placements.length === 1 ? placements[0].telegramChannelId : null,
          amount: decimal(amount),
          currency: account.currency,
          amountInPrimaryCurrency: decimal(amount * rate),
          exchangeRateToPrimary: decimal(rate),
          date: paidAt,
          ...(dto.notes === undefined
            ? {}
            : {
                description: dto.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
              }),
          assignedMemberId: sale.assignedMemberId ?? null,
        },
      });
    }
    await tx.telegramAdSalePaymentAllocation.deleteMany({
      where: { telegramAdSalePaymentId: paymentId },
    });
    return tx.telegramAdSalePayment.update({
      where: { id: paymentId },
      data: {
        accountId: account.id,
        amount: decimal(amount),
        currency,
        amountInPrimaryCurrency: decimal(amount * rate),
        exchangeRateToPrimary: decimal(rate),
        paidAt,
        ...(dto.notes === undefined ? {} : { notes: dto.notes?.trim() || null }),
        allocations: {
          create: allocations.map((allocation) => ({
            workspaceId,
            telegramAdSalePlacementId: allocation.placementId,
            amount: decimal(allocation.amount),
            currency,
            amountInPrimaryCurrency: decimal(allocation.amount * rate),
          })),
        },
      },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
  });
  if (sale.advertiserId) {
    await operations.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
  }
  return operations.mapPayment(updated);
}

export async function voidPayment(
  operations: Pick<
    TelegramAdSalesOperations,
    'mapPayment' | 'prisma' | 'recalculateAdvertiserStats' | 'resolveSystemCategory' | 'workspace'
  >,
  userId: string,
  saleId: string,
  paymentId: string,
  dto: VoidTelegramAdSalePaymentDto,
) {
  const workspaceId = await operations.workspace(userId);
  const payment = await operations.prisma.telegramAdSalePayment.findFirst({
    where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
    include: {
      allocations: true,
      account: true,
      transaction: true,
    },
  });
  if (!payment) throw new NotFoundException('Telegram ad sale payment not found');
  if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
    return operations.mapPayment(payment);
  }
  const category = await operations.resolveSystemCategory(workspaceId, 'telegram_ad_sales_reversal');
  const reversed = await operations.prisma.$transaction(async (tx) => {
    const reversalTransaction = await tx.transaction.create({
      data: {
        workspaceId,
        accountId: payment.accountId,
        telegramChannelId: null,
        type: TransactionType.expense,
        amount: payment.amount,
        currency: payment.account.currency,
        amountInPrimaryCurrency: payment.amountInPrimaryCurrency,
        exchangeRateToPrimary: payment.exchangeRateToPrimary,
        category: category.name,
        categoryId: category.id,
        description: `Void telegram ad sale payment ${payment.id}: ${dto.reason.trim()}`,
        date: new Date(),
        createdByUserId: userId,
      },
    });
    return tx.telegramAdSalePayment.update({
      where: { id: payment.id },
      data: {
        status: TelegramAdSalePaymentStatus.VOIDED,
        voidedAt: new Date(),
        voidReason: dto.reason.trim(),
        reversalTransactionId: reversalTransaction.id,
      },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
  });
  const sale = await operations.prisma.telegramAdSale.findFirst({
    where: { id: saleId, workspaceId },
    select: { advertiserId: true },
  });
  if (sale?.advertiserId) {
    await operations.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
  }
  return operations.mapPayment(reversed);
}
