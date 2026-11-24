import type { Prisma } from "@prisma/client";

// Each relation is scoped through the authenticated Finance profile. Only
// display fields enter the provider context, never credentials or raw records.
export const financeAssistantProfileFacts = {
  categories: {
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    take: 40,
    select: { name: true, type: true },
  },
  debts: {
    where: { status: "OPEN" },
    orderBy: { dueAt: "asc" },
    take: 20,
    select: {
      name: true,
      direction: true,
      amount: true,
      currency: true,
      dueAt: true,
    },
  },
  recurringPayments: {
    where: { status: { in: ["ACTIVE", "PAUSED"] } },
    orderBy: { nextOccurrenceAt: "asc" },
    take: 20,
    select: {
      name: true,
      amount: true,
      currency: true,
      status: true,
      recurrence: true,
      intervalCount: true,
      nextOccurrenceAt: true,
    },
  },
  savingsGoals: {
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      name: true,
      targetAmount: true,
      currentAllocated: true,
      currency: true,
      targetDate: true,
      status: true,
    },
  },
  investments: {
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      name: true,
      currency: true,
      status: true,
      totalInvested: true,
      totalReturned: true,
      currentValue: true,
      currentValuationAt: true,
    },
  },
  limits: {
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      category: { select: { name: true } },
      amount: true,
      currency: true,
      period: true,
    },
  },
  reminders: {
    where: { enabled: true },
    orderBy: { nextOccurrenceAt: "asc" },
    take: 15,
    select: {
      name: true,
      amount: true,
      currency: true,
      recurrence: true,
      nextOccurrenceAt: true,
    },
  },
  transfers: {
    where: { deletedAt: null },
    orderBy: { occurredAt: "desc" },
    take: 15,
    select: {
      fromAmount: true,
      fromCurrency: true,
      toAmount: true,
      toCurrency: true,
      occurredAt: true,
      fromAccount: { select: { name: true } },
      toAccount: { select: { name: true } },
    },
  },
} satisfies Prisma.FinanceProfileSelect;

export function isAssistantGreeting(text: string) {
  return /^(?:привет|привіт|добрий день|добрый день|hello|hi|hey)[\s!.?👋]*$/iu.test(
    text.trim(),
  );
}

export function assistantAnalyticsPeriod(text: string) {
  if (
    /last (?:three|3) months|(?:останні|последние) (?:три|3) місяці|последние (?:три|3) месяца/iu.test(
      text,
    )
  )
    return "LAST_3_MONTHS" as const;
  if (
    /last month|previous month|минул(?:ий|ого|ому) місяц|прошл(?:ый|ого|ом) месяц/iu.test(
      text,
    )
  )
    return "PREVIOUS_MONTH" as const;
  return "CURRENT_MONTH" as const;
}
