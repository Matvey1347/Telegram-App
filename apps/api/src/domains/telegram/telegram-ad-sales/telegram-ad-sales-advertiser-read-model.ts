import {
  TelegramAdSaleStatus,
  TelegramAdvertiserTaskStatus,
} from '@prisma/client';

export const telegramAdvertiserCompatibilityInclude = {
  crmPeers: {
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { telegramUserId: true },
  },
  _count: {
    select: {
      sales: {
        where: {
          status: {
            in: [
              TelegramAdSaleStatus.RESERVED,
              TelegramAdSaleStatus.CONFIRMED,
              TelegramAdSaleStatus.IN_PROGRESS,
            ],
          },
        },
      },
    },
  },
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

export function telegramAdvertiserInclude(saleRelations: object) {
  return {
    ...telegramAdvertiserCompatibilityInclude,
    activities: {
      orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
      take: 10,
    },
    tasks: {
      where: {
        status: {
          in: [
            TelegramAdvertiserTaskStatus.OPEN,
            TelegramAdvertiserTaskStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: [{ dueAt: 'asc' as const }, { id: 'asc' as const }],
      take: 10,
    },
    sales: {
      orderBy: [{ createdAt: 'desc' as const }],
      take: 10,
      include: saleRelations,
    },
  };
}
