import { Prisma, TelegramAdSaleStatus } from '@prisma/client';
import type { CrmContact } from '@telegram-system/shared';

export const ACTIVE_DEAL_STATUSES = [
  TelegramAdSaleStatus.RESERVED,
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
] as const;

export const crmContactSelect = {
  id: true,
  workspaceId: true,
  displayName: true,
  companyName: true,
  telegramUsername: true,
  phone: true,
  email: true,
  website: true,
  description: true,
  source: true,
  stage: true,
  ownerMemberId: true,
  lastContactAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  lastPurchaseAt: true,
  nextContactAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      sales: { where: { status: { in: [...ACTIVE_DEAL_STATUSES] } } },
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

type ContactRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmContactSelect;
}>;

export function mapCrmContact(row: ContactRow): CrmContact {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    companyName: row.companyName,
    telegramUsername: row.telegramUsername,
    phone: row.phone,
    email: row.email,
    website: row.website,
    description: row.description,
    source: row.source,
    stage: row.stage,
    ownerMemberId: row.ownerMemberId,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
    lastPurchaseAt: row.lastPurchaseAt?.toISOString() ?? null,
    nextContactAt: row.nextContactAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    activeDealCount: row._count.sales,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
