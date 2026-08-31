import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Bridges the legacy singular telegramUserId field onto stable CRM peers. */
export async function syncLegacyCrmPeer(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    contactId: string;
    telegramUserId: string | null | undefined;
    telegramUserIdSpecified: boolean;
    username: string | null | undefined;
    usernameSpecified: boolean;
  },
) {
  const username =
    input.username?.trim().replace(/^@+/, '').toLowerCase() || null;
  if (!input.telegramUserIdSpecified) {
    if (!input.usernameSpecified) return;
    const peer = await tx.telegramCrmPeer.findFirst({
      where: { workspaceId: input.workspaceId, contactId: input.contactId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, username: true },
    });
    if (peer && peer.username !== username) {
      await tx.telegramCrmPeer.update({
        where: { id: peer.id },
        data: { username },
      });
    }
    return;
  }
  const telegramUserId = input.telegramUserId?.trim() || null;
  if (!telegramUserId) {
    const peer = await tx.telegramCrmPeer.findFirst({
      where: { workspaceId: input.workspaceId, contactId: input.contactId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!peer) return;
    await tx.telegramCrmPeer.updateMany({
      where: { id: peer.id, workspaceId: input.workspaceId },
      data: { contactId: null },
    });
    return;
  }
  const existing = await tx.telegramCrmPeer.findUnique({
    where: {
      workspaceId_telegramUserId: {
        workspaceId: input.workspaceId,
        telegramUserId,
      },
    },
    select: { id: true, contactId: true, username: true },
  });
  if (existing?.contactId && existing.contactId !== input.contactId) {
    throw new ConflictException(
      'Telegram user is already linked to another CRM Contact',
    );
  }
  const peer = existing
    ? existing.contactId === input.contactId && existing.username === username
      ? existing
      : await tx.telegramCrmPeer.update({
          where: { id: existing.id },
          data: { contactId: input.contactId, username },
          select: { id: true, contactId: true, username: true },
        })
    : await tx.telegramCrmPeer.create({
        data: {
          workspaceId: input.workspaceId,
          telegramUserId,
          contactId: input.contactId,
          username,
        },
        select: { id: true, contactId: true, username: true },
      });
  await tx.telegramCrmPeer.updateMany({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      id: { not: peer.id },
    },
    data: { contactId: null },
  });
  await tx.telegramCrmConversation.updateMany({
    where: {
      workspaceId: input.workspaceId,
      telegramCrmPeerId: peer.id,
      NOT: { contactId: input.contactId },
    },
    data: { contactId: input.contactId },
  });
}
