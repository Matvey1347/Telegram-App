import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CrmMemberSummary } from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  crmMemberSummarySelect,
  mapCrmMemberSummary,
} from './telegram-crm-read-model.mapper';

export type CrmContactSalesSummary = {
  totalSalesCount: number;
  paidSalesCount: number;
  completedSalesCount: number;
  totalPlacementsCount: number;
  revenueByCurrency: Array<{ currency: string; amount: string }>;
  purchasedChannels: Array<{
    id: string;
    title: string;
    photoUrl: string | null;
  }>;
  purchaseAudience: 'BUSINESS' | 'IMPROVEMENT' | 'ALL' | null;
  purchaseAudienceIcon: ReturnType<typeof iconToResolvedEmoji>;
  lastDealAt: string | null;
  dealMembers: CrmMemberSummary[];
};

type ContactIdentity = {
  id: string;
  displayName: string;
  companyName: string | null;
  telegramUsername: string | null;
};

const completedStatuses = new Set<TelegramAdSaleStatus>([
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
  TelegramAdSaleStatus.COMPLETED,
]);

const emptySummary = (): CrmContactSalesSummary => ({
  totalSalesCount: 0,
  paidSalesCount: 0,
  completedSalesCount: 0,
  totalPlacementsCount: 0,
  revenueByCurrency: [],
  purchasedChannels: [],
  purchaseAudience: null,
  purchaseAudienceIcon: null,
  lastDealAt: null,
  dealMembers: [],
});

const normalizeUsername = (value: string | null | undefined) =>
  value?.trim().replace(/^@+/, '').toLowerCase() || null;

export async function loadCrmContactSalesSummaries(
  prisma: PrismaService,
  workspaceId: string,
  contacts: ContactIdentity[],
) {
  const summaries = new Map<string, CrmContactSalesSummary>();
  if (!contacts.length) return summaries;

  const contactIds = contacts.map((contact) => contact.id);
  const contactIdByUsername = uniqueContactIdsByUsername(contacts);
  const usernameVariants = [...contactIdByUsername.keys()].flatMap(
    (username) => [username, `@${username}`],
  );
  const anonymousContactId = contacts.find(isUnassignedCrmContact)?.id;
  const sales = await prisma.telegramAdSale.findMany({
    where: {
      workspaceId,
      status: { not: TelegramAdSaleStatus.CANCELLED },
      OR: [
        { advertiserId: { in: contactIds } },
        ...(usernameVariants.length || anonymousContactId
          ? [
              {
                advertiserId: null,
                OR: [
                  ...(usernameVariants.length
                    ? [
                        {
                          advertiserTelegram: {
                            in: usernameVariants,
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          advertiserTelegramSnapshot: {
                            in: usernameVariants,
                            mode: 'insensitive' as const,
                          },
                        },
                      ]
                    : []),
                  ...(anonymousContactId
                    ? [
                        {
                          AND: [
                            { advertiserTelegram: null },
                            { advertiserTelegramSnapshot: null },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      advertiserId: true,
      advertiserTelegram: true,
      advertiserTelegramSnapshot: true,
      status: true,
      createdAt: true,
      assignedMember: { select: crmMemberSummarySelect },
      placements: {
        select: {
          agreedPrice: true,
          telegramChannel: {
            select: {
              id: true,
              title: true,
              photoUrl: true,
              networkMembers: {
                select: {
                  network: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      payments: {
        where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
        select: {
          amount: true,
          currency: true,
        },
      },
    },
  });
  const audienceNetworks = prisma.telegramChannelNetwork
    ? await prisma.telegramChannelNetwork.findMany({
        where: {
          workspaceId,
          name: {
            in: ['All', 'Business', 'Improvement'],
            mode: 'insensitive',
          },
        },
        select: {
          name: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      })
    : [];
  const audienceIcons = new Map(
    audienceNetworks.map((network) => [
      network.name.trim().toLocaleLowerCase(),
      iconToResolvedEmoji(network.icon),
    ]),
  );

  for (const sale of sales) {
    const username = normalizeUsername(
      sale.advertiserTelegramSnapshot ?? sale.advertiserTelegram,
    );
    const contactId =
      sale.advertiserId ??
      (username ? contactIdByUsername.get(username) : null) ??
      (!username ? anonymousContactId : null);
    if (!contactId) continue;
    const summary = summaries.get(contactId) ?? emptySummary();
    summary.totalSalesCount += 1;
    summary.totalPlacementsCount += sale.placements.length;
    for (const placement of sale.placements) {
      const channel = placement.telegramChannel;
      if (
        channel &&
        !summary.purchasedChannels.some((item) => item.id === channel.id)
      ) {
        summary.purchasedChannels.push({
          id: channel.id,
          title: channel.title,
          photoUrl: channel.photoUrl,
        });
      }
    }
    summary.lastDealAt = sale.createdAt.toISOString();
    const member = mapCrmMemberSummary(sale.assignedMember);
    if (member && !summary.dealMembers.some(({ id }) => id === member.id)) {
      summary.dealMembers.push(member);
    }
    if (completedStatuses.has(sale.status)) summary.completedSalesCount += 1;
    // CRM's Paid metric answers whether the customer has paid this deal at
    // all, matching Deals' “Money received” / “Partially received” state.
    // It must not reclassify a partially allocated payment as unpaid.
    const hasReceivedPayment = sale.payments.some((payment) =>
      new Prisma.Decimal(payment.amount).greaterThan(0),
    );
    if (hasReceivedPayment || sale.status === TelegramAdSaleStatus.COMPLETED) {
      summary.paidSalesCount += 1;
    }
    summary.revenueByCurrency = mergeRevenue(
      summary.revenueByCurrency,
      sale.payments,
    );
    summaries.set(contactId, summary);
  }
  for (const summary of summaries.values()) {
    const audience = new Set<string>();
    for (const channel of summary.purchasedChannels) {
      const source = sales
        .flatMap((sale) => sale.placements)
        .find(
          (placement) => placement.telegramChannel?.id === channel.id,
        )?.telegramChannel;
      for (const member of source?.networkMembers ?? []) {
        const name = member.network.name.trim().toLocaleLowerCase();
        if (name === 'business') audience.add('BUSINESS');
        if (name === 'improvement') audience.add('IMPROVEMENT');
      }
    }
    summary.purchaseAudience =
      audience.size > 1
        ? 'ALL'
        : audience.has('BUSINESS')
          ? 'BUSINESS'
          : audience.has('IMPROVEMENT')
            ? 'IMPROVEMENT'
            : null;
    const iconKey =
      summary.purchaseAudience === 'ALL'
        ? 'all'
        : (summary.purchaseAudience?.toLocaleLowerCase() ?? null);
    summary.purchaseAudienceIcon = iconKey
      ? (audienceIcons.get(iconKey) ?? null)
      : null;
  }
  return summaries;
}

export function isUnassignedCrmContact(contact: ContactIdentity) {
  return (
    contact.displayName.trim().toLowerCase() === 'advertiser' &&
    !contact.companyName &&
    !contact.telegramUsername
  );
}

function uniqueContactIdsByUsername(contacts: ContactIdentity[]) {
  const result = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const contact of contacts) {
    const username = normalizeUsername(contact.telegramUsername);
    if (!username) continue;
    if (result.has(username)) ambiguous.add(username);
    else result.set(username, contact.id);
  }
  for (const username of ambiguous) result.delete(username);
  return result;
}

function mergeRevenue(
  current: CrmContactSalesSummary['revenueByCurrency'],
  payments: Array<{ amount: Prisma.Decimal; currency: string }>,
) {
  const totals = new Map(
    current.map((item) => [item.currency, new Prisma.Decimal(item.amount)]),
  );
  for (const payment of payments) {
    const currency = payment.currency.trim().toUpperCase();
    totals.set(
      currency,
      (totals.get(currency) ?? new Prisma.Decimal(0)).add(payment.amount),
    );
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed() }));
}
