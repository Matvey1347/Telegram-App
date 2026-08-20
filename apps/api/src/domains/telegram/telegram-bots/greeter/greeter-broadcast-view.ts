import { GreeterBroadcastRecipientStatus, Prisma } from '@prisma/client';
import type { GreeterButtonRows } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';

type BroadcastReadRow = Prisma.GreeterBroadcastGetPayload<{
  include: {
    channel: { select: { id: true; title: true; username: true } };
  };
}>;

export async function buildGreeterBroadcastView(
  prisma: PrismaService,
  row: BroadcastReadRow,
) {
  const grouped = await prisma.greeterBroadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId: row.id },
    _count: { _all: true },
  });
  const count = (statuses: GreeterBroadcastRecipientStatus[]) =>
    grouped
      .filter((item) => statuses.includes(item.status))
      .reduce((sum, item) => sum + item._count._all, 0);
  return {
    id: row.id,
    name: row.name,
    messageText: row.messageText,
    buttons: (row.buttons as GreeterButtonRows | null) || [],
    audience: row.audience,
    channelId: row.channelId,
    userState: row.audienceUserState,
    channel: row.channel,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() || null,
    confirmedAt: row.confirmedAt?.toISOString() || null,
    completedAt: row.completedAt?.toISOString() || null,
    progress: {
      total: count(Object.values(GreeterBroadcastRecipientStatus)),
      pending: count([
        GreeterBroadcastRecipientStatus.PENDING,
        GreeterBroadcastRecipientStatus.QUEUED,
      ]),
      sent: count([GreeterBroadcastRecipientStatus.SENT]),
      failed: count([GreeterBroadcastRecipientStatus.FAILED]),
      blocked: count([GreeterBroadcastRecipientStatus.BLOCKED]),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
