import {
  GreeterBroadcastRecipientStatus,
  GreeterBroadcastStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const TERMINAL_RECIPIENT_STATUSES = [
  GreeterBroadcastRecipientStatus.SENT,
  GreeterBroadcastRecipientStatus.FAILED,
  GreeterBroadcastRecipientStatus.BLOCKED,
  GreeterBroadcastRecipientStatus.CANCELLED,
];

/**
 * Reconciles each broadcast touched by a delivery batch once. The indexed
 * non-terminal probe avoids hydrating every recipient after every send.
 */
export async function reconcileTerminalDeliveryBroadcasts(
  prisma: PrismaService,
  deliveryIds: string[],
) {
  if (!deliveryIds.length) return;
  const touched = await prisma.greeterBroadcastRecipient.findMany({
    where: { deliveryId: { in: deliveryIds } },
    distinct: ['broadcastId'],
    select: { broadcastId: true },
  });
  for (const { broadcastId } of touched) {
    const nonTerminal = await prisma.greeterBroadcastRecipient.findFirst({
      where: {
        broadcastId,
        status: { notIn: TERMINAL_RECIPIENT_STATUSES },
      },
      select: { id: true },
    });
    if (nonTerminal) continue;
    const grouped = await prisma.greeterBroadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcastId },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, item) => sum + item._count._all, 0);
    if (!total) continue;
    const sent =
      grouped.find(
        (item) => item.status === GreeterBroadcastRecipientStatus.SENT,
      )?._count._all ?? 0;
    const status =
      sent === total
        ? GreeterBroadcastStatus.COMPLETED
        : sent === 0
          ? GreeterBroadcastStatus.FAILED
          : GreeterBroadcastStatus.PARTIALLY_FAILED;
    await prisma.greeterBroadcast.updateMany({
      where: { id: broadcastId, status: { not: 'CANCELLED' } },
      data: { status, completedAt: new Date() },
    });
  }
}
