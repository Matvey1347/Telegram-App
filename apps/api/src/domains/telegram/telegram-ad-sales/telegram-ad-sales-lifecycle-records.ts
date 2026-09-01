import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { UpdateTelegramAdSaleDto } from './dto';

export function isDedicatedSaleCancellation(dto: UpdateTelegramAdSaleDto) {
  if (dto.status !== TelegramAdSaleStatus.CANCELLED) return false;
  if (Object.keys(dto).some((key) => key !== 'status')) {
    throw new BadRequestException(
      'Sale cancellation cannot be combined with other updates',
    );
  }
  return true;
}

export function assertNoActiveSalePayments(
  payments: Array<{ status: TelegramAdSalePaymentStatus }>,
) {
  if (
    payments.some(
      (payment) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
    )
  ) {
    throw new BadRequestException(
      'Cannot cancel paid sale without voiding payments',
    );
  }
}

export async function cancelAdSaleRecords(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  saleId: string,
  include: Prisma.TelegramAdSaleInclude,
) {
  const now = new Date();
  await tx.telegramCrmCustomerAutomationExecution.updateMany({
    where: {
      workspaceId,
      telegramAdSaleId: saleId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    data: {
      status: 'CANCELLED',
      completedAt: now,
      reason: 'DEAL_CANCELLED',
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  await tx.telegramAdSale.update({
    where: { id: saleId, workspaceId },
    data: { status: 'CANCELLED' },
  });
  await tx.telegramAdSalePlacement.updateMany({
    where: {
      workspaceId,
      telegramAdSaleId: saleId,
      status: { not: 'COMPLETED' },
    },
    data: { status: 'CANCELLED' },
  });
  return tx.telegramAdSale.findUniqueOrThrow({
    where: { id: saleId },
    include,
  });
}

export async function deleteAdSaleRecords(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    saleId: string;
    transactionIds: string[];
    managedPostIds: string[];
    telegramPostIds: string[];
  },
) {
  const { workspaceId, saleId } = input;
  await tx.telegramCrmCustomerAutomationExecution.updateMany({
    where: { workspaceId, telegramAdSaleId: saleId },
    data: { telegramAdSaleId: null, placementId: null },
  });
  await tx.telegramAdSale.delete({ where: { id: saleId, workspaceId } });
  if (input.transactionIds.length) {
    await tx.transaction.deleteMany({
      where: {
        workspaceId,
        id: { in: [...new Set(input.transactionIds)] },
      },
    });
  }
  if (input.managedPostIds.length) {
    await tx.telegramManagedPost.deleteMany({
      where: { workspaceId, id: { in: [...new Set(input.managedPostIds)] } },
    });
  }
  if (input.telegramPostIds.length) {
    await tx.telegramPost.deleteMany({
      where: { workspaceId, id: { in: [...new Set(input.telegramPostIds)] } },
    });
  }
}
