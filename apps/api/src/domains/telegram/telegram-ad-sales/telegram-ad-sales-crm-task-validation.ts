import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function lockCrmTaskContact(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      archivedAt: Date | null;
      manualSalesStatus: string | null;
      ownerMemberId: string | null;
    }>
  >(Prisma.sql`
    SELECT "id", "archivedAt", "manualSalesStatus", "ownerMemberId" FROM "TelegramAdvertiser"
    WHERE "id" = ${contactId} AND "workspaceId" = ${workspaceId}
    FOR UPDATE
  `);
  if (!rows.length)
    throw new NotFoundException('Telegram advertiser not found');
  return rows[0];
}

export async function lockCrmTask(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  taskId: string,
) {
  const existing = await tx.telegramAdvertiserTask.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!existing)
    throw new NotFoundException('Telegram advertiser task not found');
  const contact = await lockCrmTaskContact(
    tx,
    workspaceId,
    existing.advertiserId,
  );
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "TelegramAdvertiserTask"
    WHERE "id" = ${taskId} AND "workspaceId" = ${workspaceId} FOR UPDATE
  `);
  const current = await tx.telegramAdvertiserTask.findFirst({
    where: { id: taskId, workspaceId, advertiserId: existing.advertiserId },
  });
  if (!current)
    throw new NotFoundException('Telegram advertiser task not found');
  return { task: current, ownerMemberId: contact.ownerMemberId };
}

export async function validateCrmTaskLinks(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
  links: {
    assignedMemberId: string;
    saleId?: string | null;
    placementId?: string | null;
    metadata?: unknown;
    type?: string;
    status?: string;
  },
) {
  if (
    links.type === 'FOLLOW_UP' &&
    (!links.status || ['OPEN', 'IN_PROGRESS'].includes(links.status))
  ) {
    const contact = await tx.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId },
      select: { archivedAt: true, manualSalesStatus: true },
    });
    if (
      !contact ||
      contact.archivedAt ||
      ['CLOSED', 'DO_NOT_CONTACT'].includes(contact.manualSalesStatus ?? '')
    )
      throw new ConflictException(
        'Reopen this client before scheduling follow-up',
      );
  }
  if (
    links.type === 'FOLLOW_UP' &&
    (!links.status || ['OPEN', 'IN_PROGRESS'].includes(links.status)) &&
    links.metadata &&
    typeof links.metadata === 'object' &&
    'origin' in links.metadata &&
    links.metadata.origin === 'MANUAL_INSTAGRAM'
  ) {
    const method = await tx.telegramAdvertiserContact.findFirst({
      where: {
        workspaceId,
        advertiserId: contactId,
        type: 'INSTAGRAM',
        identityState: 'ACTIVE',
        ownershipConfirmedAt: { not: null },
      },
      select: { id: true },
    });
    if (!method)
      throw new ConflictException('INSTAGRAM_IDENTITY_REVIEW_REQUIRED');
  }
  const member = await tx.workspaceMember.findFirst({
    where: { id: links.assignedMemberId, workspaceId },
    select: { id: true },
  });
  if (!member)
    throw new BadRequestException('Reminder owner is not in workspace');
  if (links.saleId) {
    const sale = await tx.telegramAdSale.findFirst({
      where: { id: links.saleId, workspaceId, advertiserId: contactId },
      select: { id: true },
    });
    if (!sale)
      throw new BadRequestException('Reminder sale does not belong to client');
  }
  if (links.placementId) {
    const placement = await tx.telegramAdSalePlacement.findFirst({
      where: {
        id: links.placementId,
        workspaceId,
        sale: { advertiserId: contactId, workspaceId },
        ...(links.saleId ? { telegramAdSaleId: links.saleId } : {}),
      },
      select: { id: true },
    });
    if (!placement)
      throw new BadRequestException(
        'Reminder placement does not belong to client sale',
      );
  }
  const metadata = links.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    'conversationId' in metadata
  ) {
    const conversationId = metadata.conversationId;
    if (typeof conversationId !== 'string' || !conversationId)
      throw new BadRequestException('Invalid reminder conversation');
    const conversation = await tx.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        contactId,
        ...(links.type === 'FOLLOW_UP' &&
        (!links.status || ['OPEN', 'IN_PROGRESS'].includes(links.status))
          ? { state: 'ACTIVE' as const }
          : {}),
      },
      select: { id: true },
    });
    if (!conversation)
      throw new BadRequestException(
        'Reminder conversation does not belong to client',
      );
  }
}
