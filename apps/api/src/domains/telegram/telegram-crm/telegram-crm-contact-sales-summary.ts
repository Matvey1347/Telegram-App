import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export type CrmContactSalesSummary = {
  totalSalesCount: number;
  paidSalesCount: number;
  completedSalesCount: number;
  totalPlacementsCount: number;
  revenueByCurrency: Array<{ currency: string; amount: string }>;
  lastDealAt: string | null;
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
  lastDealAt: null,
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
  const anonymousContactId = contacts.find(
    (contact) =>
      contact.displayName.trim().toLowerCase() === 'advertiser' &&
      !contact.companyName &&
      !contact.telegramUsername,
  )?.id;
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
      placements: { select: { agreedPrice: true } },
      payments: {
        where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
        select: { amount: true, currency: true },
      },
    },
  });

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
    summary.lastDealAt = sale.createdAt.toISOString();
    if (completedStatuses.has(sale.status)) summary.completedSalesCount += 1;
    const agreed = sale.placements.reduce(
      (sum, placement) => sum.add(placement.agreedPrice ?? 0),
      new Prisma.Decimal(0),
    );
    const paid = sale.payments.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    );
    if (agreed.greaterThan(0) && paid.greaterThanOrEqualTo(agreed)) {
      summary.paidSalesCount += 1;
    }
    summary.revenueByCurrency = mergeRevenue(
      summary.revenueByCurrency,
      sale.payments,
    );
    summaries.set(contactId, summary);
  }
  return summaries;
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
