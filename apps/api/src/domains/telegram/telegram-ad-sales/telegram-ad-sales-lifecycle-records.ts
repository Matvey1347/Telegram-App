import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
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

type CancellablePost = Parameters<TelegramManagedPostPublicationService['cancelScheduledManagedPost']>[1];

export async function cancelAdSaleNativePosts(
  workspaceId: string,
  placements: Array<{
    managedPost: Omit<CancellablePost, 'telegramChannel'> | null;
    telegramChannel: CancellablePost['telegramChannel'];
  }>,
  publication: Pick<TelegramManagedPostPublicationService, 'cancelScheduledManagedPost'>,
) {
  const selected = new Map<string, CancellablePost>();
  for (const { managedPost, telegramChannel } of placements) {
    if (managedPost?.telegramScheduledMessageIds.length) {
      selected.set(managedPost.id, { ...managedPost, telegramChannel });
    }
  }
  const claims = new Map<string, string>();
  for (const post of selected.values()) {
    const claim = await publication.cancelScheduledManagedPost(workspaceId, post);
    if (claim) claims.set(post.id, claim);
  }
  return claims;
}

export async function deleteAdSaleRecords(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    saleId: string;
    transactionIds: string[];
    managedPostIds: string[];
    telegramPostIds: string[];
    cancellationClaims?: Map<string, string>;
  },
) {
  const { workspaceId, saleId } = input;
  for (const [id, claim] of input.cancellationClaims ?? []) {
    await tx.telegramManagedPost.update({
      where: { id, workspaceId, deliveryClaimOwner: claim },
      data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null },
    });
  }
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
