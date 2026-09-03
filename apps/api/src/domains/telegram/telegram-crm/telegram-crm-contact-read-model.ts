import {
  Prisma,
  TelegramAdvertiserTaskStatus,
  TelegramCrmConversationState,
} from '@prisma/client';
import type {
  CrmActiveDealSummary,
  CrmContactDetail,
  CrmContactListItem,
} from '@telegram-system/shared';
import type { CrmContactSalesSummary } from './telegram-crm-contact-sales-summary';
import {
  ACTIVE_DEAL_STATUSES,
  crmContactSelect,
  mapCrmContact,
} from './telegram-crm-contact.mapper';
import {
  crmAccountSummarySelect,
  crmMemberSummarySelect,
  crmMessagePreviewSelect,
  crmPeerSummarySelect,
  mapCrmAccountSummary,
  mapCrmMemberSummary,
  mapCrmMessagePreview,
  mapCrmPeerSummary,
} from './telegram-crm-read-model.mapper';

export const CRM_OPEN_TASK_STATUSES = [
  TelegramAdvertiserTaskStatus.OPEN,
  TelegramAdvertiserTaskStatus.IN_PROGRESS,
] as const;
const CONTACT_SOURCE_SCAN_LIMIT = 12;
const CONTACT_ACCOUNT_LIMIT = 5;
const CONTACT_DETAIL_RELATION_LIMIT = 50;

export const crmContactListSelect = {
  ...crmContactSelect,
  ownerMember: { select: crmMemberSummarySelect },
  crmPeers: {
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: crmPeerSummarySelect,
  },
  crmConversations: {
    where: { state: TelegramCrmConversationState.ACTIVE },
    orderBy: [
      { lastMessageAt: { sort: 'desc' as const, nulls: 'last' as const } },
      { id: 'desc' as const },
    ],
    take: CONTACT_SOURCE_SCAN_LIMIT,
    select: {
      mtprotoAccount: { select: crmAccountSummarySelect },
      messages: {
        orderBy: [{ sentAt: 'desc' as const }, { id: 'desc' as const }],
        take: 1,
        select: crmMessagePreviewSelect,
      },
    },
  },
  tasks: {
    where: { status: { in: [...CRM_OPEN_TASK_STATUSES] } },
    orderBy: [{ dueAt: 'asc' as const }, { id: 'asc' as const }],
    take: 1,
    select: {
      id: true,
      title: true,
      dueAt: true,
      status: true,
      type: true,
      priority: true,
    },
  },
  sales: {
    where: { status: { in: [...ACTIVE_DEAL_STATUSES] } },
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      title: true,
      status: true,
      settlementCurrency: true,
      _count: { select: { placements: true } },
      placements: {
        orderBy: [{ scheduledAt: 'asc' as const }, { id: 'asc' as const }],
        take: 1,
        select: { scheduledAt: true },
      },
    },
  },
  _count: {
    select: {
      sales: { where: { status: { in: [...ACTIVE_DEAL_STATUSES] } } },
      crmConversations: true,
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

export const crmContactDetailSelect = {
  ...crmContactSelect,
  ownerMember: { select: crmMemberSummarySelect },
  crmPeers: {
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: CONTACT_DETAIL_RELATION_LIMIT,
    select: crmPeerSummarySelect,
  },
  tags: {
    orderBy: { createdAt: 'desc' as const },
    take: CONTACT_DETAIL_RELATION_LIMIT,
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
  _count: {
    select: {
      sales: { where: { status: { in: [...ACTIVE_DEAL_STATUSES] } } },
      crmConversations: true,
      tasks: { where: { status: { in: [...CRM_OPEN_TASK_STATUSES] } } },
      activities: true,
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

export type ContactListRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmContactListSelect;
}>;
export type ContactDetailRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmContactDetailSelect;
}>;
export type PaymentSummaryRow = {
  currency: string;
  agreedAmount: Prisma.Decimal | string | number;
  paidAmount: Prisma.Decimal | string | number;
  outstandingAmount: Prisma.Decimal | string | number;
};
export type ActiveDealTotals = Pick<
  CrmActiveDealSummary,
  'agreedAmount' | 'paidAmount' | 'paymentStatus'
>;

export function mapCrmContactListItem(
  row: ContactListRow,
  unreadByContact: Map<string, number>,
  dealTotals: Map<string, ActiveDealTotals>,
  salesSummaries: Map<string, CrmContactSalesSummary>,
): CrmContactListItem {
  const accounts = new Map(
    row.crmConversations.map((conversation) => [
      conversation.mtprotoAccount.id,
      mapCrmAccountSummary(conversation.mtprotoAccount),
    ]),
  );
  const previews = row.crmConversations.flatMap((conversation) =>
    conversation.messages[0] ? [conversation.messages[0]] : [],
  );
  previews.sort(
    (left, right) =>
      right.sentAt.getTime() - left.sentAt.getTime() ||
      right.id.localeCompare(left.id),
  );
  const task = row.tasks[0];
  const deal = row.sales[0];
  const totals = deal ? dealTotals.get(deal.id) : null;
  const salesSummary = salesSummaries.get(row.id) ?? {
    totalSalesCount: 0,
    paidSalesCount: 0,
    completedSalesCount: 0,
    totalPlacementsCount: 0,
    revenueByCurrency: [],
    lastDealAt: null,
  };
  return {
    ...mapCrmContact(row),
    ownerMember: mapCrmMemberSummary(row.ownerMember),
    peer: row.crmPeers[0] ? mapCrmPeerSummary(row.crmPeers[0]) : null,
    unreadCount: unreadByContact.get(row.id) ?? 0,
    conversationCount: row._count.crmConversations,
    conversationAccounts: [...accounts.values()].slice(
      0,
      CONTACT_ACCOUNT_LIMIT,
    ),
    lastMessage: mapCrmMessagePreview(previews[0]),
    nextOpenTask: task ? { ...task, dueAt: task.dueAt.toISOString() } : null,
    activeDeal: deal
      ? {
          id: deal.id,
          title: deal.title,
          status: deal.status,
          placementCount: deal._count.placements,
          settlementCurrency: deal.settlementCurrency,
          scheduledAt: deal.placements[0]?.scheduledAt.toISOString() ?? null,
          agreedAmount: totals?.agreedAmount ?? '0',
          paidAmount: totals?.paidAmount ?? '0',
          paymentStatus: totals?.paymentStatus ?? 'UNPAID',
        }
      : null,
    salesSummary,
  };
}

export function mapCrmContactDetail(
  row: ContactDetailRow,
  paymentSummary: PaymentSummaryRow[],
  dealCount: number,
  unreadCount: number,
): CrmContactDetail {
  return {
    ...mapCrmContact(row),
    ownerMember: mapCrmMemberSummary(row.ownerMember),
    unreadCount,
    peers: row.crmPeers.map(mapCrmPeerSummary),
    tags: row.tags.map(({ tag }) => tag),
    paymentSummary: paymentSummary.map((item) => ({
      currency: item.currency,
      agreedAmount: String(item.agreedAmount),
      paidAmount: String(item.paidAmount),
      outstandingAmount: String(item.outstandingAmount),
    })),
    counts: {
      conversations: row._count.crmConversations,
      deals: dealCount,
      openTasks: row._count.tasks,
      activities: row._count.activities,
    },
  };
}
