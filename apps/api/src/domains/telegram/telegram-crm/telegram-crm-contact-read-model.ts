import {
  Prisma,
  TelegramAdvertiserTaskStatus,
  TelegramCrmConversationState,
} from '@prisma/client';
import type {
  CrmActiveDealSummary,
  CrmChatContactContext,
  CrmContactDetail,
  CrmContactListItem,
} from '@telegram-system/shared';
import {
  isUnassignedCrmContact,
  type CrmContactSalesSummary,
} from './telegram-crm-contact-sales-summary';
import type { CrmReplySummary } from '@telegram-system/shared';
import {
  ACTIVE_DEAL_WHERE,
  crmContactSelect,
  mapCrmContact,
} from './telegram-crm-contact.mapper';
import {
  crmAccountSummarySelect,
  crmMemberSummarySelect,
  crmPeerSummarySelect,
  mapCrmAccountSummary,
  mapCrmMemberSummary,
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
  totalSalesCount: true,
  ownerMember: { select: crmMemberSummarySelect },
  crmPeers: {
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: crmPeerSummarySelect,
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
    where: ACTIVE_DEAL_WHERE,
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
      sales: { where: ACTIVE_DEAL_WHERE },
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
  crmConversations: {
    where: { state: TelegramCrmConversationState.ACTIVE },
    orderBy: [
      { lastMessageAt: { sort: 'desc' as const, nulls: 'last' as const } },
      { id: 'desc' as const },
    ],
    take: CONTACT_SOURCE_SCAN_LIMIT,
    select: {
      mtprotoAccount: { select: crmAccountSummarySelect },
    },
  },
  tags: {
    orderBy: { createdAt: 'desc' as const },
    take: CONTACT_DETAIL_RELATION_LIMIT,
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
  _count: {
    select: {
      sales: { where: ACTIVE_DEAL_WHERE },
      crmConversations: true,
      tasks: { where: { status: { in: [...CRM_OPEN_TASK_STATUSES] } } },
      activities: true,
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

export const crmChatContactContextSelect = {
  id: true,
  workspaceId: true,
  displayName: true,
  telegramUsername: true,
  ownerMemberId: true,
  crmPeers: {
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
    take: CONTACT_DETAIL_RELATION_LIMIT,
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
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

export type ContactListRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmContactListSelect;
}>;
export type ContactDetailRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmContactDetailSelect;
}>;
export type ChatContactContextRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof crmChatContactContextSelect;
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
  dealTotals: Map<string, ActiveDealTotals>,
  salesSummaries: Map<string, CrmContactSalesSummary>,
  replySummaries: Map<string, CrmReplySummary>,
): CrmContactListItem {
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
    dealMembers: [],
  };
  return {
    ...mapCrmContact(row),
    isUnassignedClient: isUnassignedCrmContact(row),
    replySummary: replySummaries.get(row.id) ?? {
      status: 'NONE',
      inboundMessageCount: 0,
      outboundMessageCount: 0,
      countsComplete: false,
      unreadCount: 0,
      muted: false,
    },
    ownerMember: mapCrmMemberSummary(row.ownerMember),
    peer: row.crmPeers[0] ? mapCrmPeerSummary(row.crmPeers[0]) : null,
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
  const accounts = new Map(
    row.crmConversations.map((conversation) => [
      conversation.mtprotoAccount.id,
      mapCrmAccountSummary(conversation.mtprotoAccount),
    ]),
  );
  return {
    ...mapCrmContact(row),
    ownerMember: mapCrmMemberSummary(row.ownerMember),
    unreadCount,
    peers: row.crmPeers.map(mapCrmPeerSummary),
    conversationAccounts: [...accounts.values()].slice(
      0,
      CONTACT_ACCOUNT_LIMIT,
    ),
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

export function mapCrmChatContactContext(
  row: ChatContactContextRow,
): CrmChatContactContext {
  const accounts = new Map(
    row.crmConversations.map((conversation) => [
      conversation.mtprotoAccount.id,
      mapCrmAccountSummary(conversation.mtprotoAccount),
    ]),
  );
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    telegramUsername: row.telegramUsername,
    ownerMemberId: row.ownerMemberId,
    peers: row.crmPeers.map(mapCrmPeerSummary),
    conversationAccounts: [...accounts.values()].slice(
      0,
      CONTACT_ACCOUNT_LIMIT,
    ),
  };
}
