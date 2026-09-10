import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type {
  ConsumerFinanceImportDocumentV1,
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from '@telegram-system/shared';
import type {
  TelegramBotDeliveryWriterPort,
  TransactionalTelegramDeliveryInput,
} from '../../telegram-bots/core/telegram-bot-delivery-writer';
import { t } from '../i18n/finance-chat-i18n';
import {
  financeObligationDeliveryTarget,
  financeObligationProfile,
} from '../obligations/finance-obligation-context';
import type { FinanceObligationPresentationPort } from '../obligations/finance-obligation-presentation.port';
import {
  financeLocalCalendarDate,
  financeRecurrenceAnchor,
} from '../obligations/finance-obligation-date';

type Progress = (
  item: ConsumerFinanceImportProgress,
  current: number,
  total: number,
) => void;

const BATCH_SIZE = 250;
const decimal = (value: string) => new Prisma.Decimal(value);
const optionalDate = (value: string | null | undefined) =>
  value ? new Date(value) : null;
const batches = <T>(rows: T[]) =>
  Array.from({ length: Math.ceil(rows.length / BATCH_SIZE) }, (_, index) =>
    rows.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );

function stopIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Import cancelled');
  error.name = 'AbortError';
  throw error;
}

function report(
  onProgress: Progress,
  section: ConsumerFinanceImportProgress['section'],
  processed: number,
  total: number,
  stepStart: number,
) {
  const fraction = total ? processed / total : 1;
  onProgress(
    { phase: 'IMPORTING', section, processed, total },
    stepStart + fraction,
    15,
  );
}

async function enqueueDeliveries(
  tx: Prisma.TransactionClient,
  delivery: TelegramBotDeliveryWriterPort,
  rows: TransactionalTelegramDeliveryInput[],
  signal: AbortSignal,
) {
  const scheduledAt: Date[] = [];
  for (const batch of batches(rows)) {
    stopIfAborted(signal);
    const queued = await delivery.enqueueManyInTransaction(tx, batch);
    scheduledAt.push(...queued.map((row) => row.scheduledAt));
  }
  return scheduledAt;
}

export async function writeFinanceObligationImport(input: {
  tx: Prisma.TransactionClient;
  profileId: string;
  document: ConsumerFinanceImportDocumentV1;
  accountIds: ReadonlyMap<string, string>;
  categoryIds: ReadonlyMap<string, string>;
  transactionIds: ReadonlyMap<string, string>;
  delivery: TelegramBotDeliveryWriterPort;
  presentation: FinanceObligationPresentationPort;
  onProgress: Progress;
  signal: AbortSignal;
}) {
  const {
    tx,
    profileId,
    document,
    delivery,
    presentation,
    onProgress,
    signal,
  } = input;
  const reminders = document.data.reminders ?? [];
  const debts = document.data.debts ?? [];
  const regularPayments = document.data.regularPayments ?? [];
  const accounts = document.data.accounts ?? [];
  const categories = document.data.categories ?? [];
  const accountByRef = new Map(accounts.map((row) => [row.ref, row]));
  const categoryByRef = new Map(categories.map((row) => [row.ref, row]));
  stopIfAborted(signal);
  const profile = await financeObligationProfile(tx, profileId);
  const target = financeObligationDeliveryTarget(profile);
  const scheduledAt: Date[] = [];

  const preparedReminders = reminders.map((row) => ({
    id: randomUUID(),
    row,
    nextOccurrenceAt: new Date(row.nextOccurrenceAt),
    reminderOffsetMinutes: row.reminderOffsetMinutes ?? 0,
  }));
  let processed = 0;
  for (const batch of batches(preparedReminders)) {
    stopIfAborted(signal);
    await tx.financeReminder.createMany({
      data: batch.map(
        ({ id, row, nextOccurrenceAt, reminderOffsetMinutes }) => ({
          id,
          profileId,
          name: row.name.trim(),
          amount: decimal(row.amount),
          currency: row.currency,
          recurrence: 'MONTHLY' as const,
          dayOfMonth: row.dayOfMonth,
          reminderOffsetMinutes,
          nextOccurrenceAt,
          enabled: row.enabled ?? true,
        }),
      ),
    });
    processed += batch.length;
    report(onProgress, 'reminders', processed, reminders.length, 6);
  }
  if (!preparedReminders.length) report(onProgress, 'reminders', 0, 0, 6);
  if (target) {
    const deliveries = preparedReminders.flatMap(
      ({ id, row, nextOccurrenceAt, reminderOffsetMinutes }) => {
        if (!(row.enabled ?? true)) return [];
        const dueAt = new Date(
          nextOccurrenceAt.getTime() - reminderOffsetMinutes * 60_000,
        );
        return [
          {
            ...target,
            financeReminderId: id,
            message: {
              text: t(target.locale, 'reminderNotification', {
                name: row.name.trim(),
                amount: row.amount,
                currency: row.currency,
              }),
            },
            scheduledAt: dueAt,
            idempotencyKey: `finance-reminder:${id}:${nextOccurrenceAt.toISOString()}`,
          },
        ];
      },
    );
    scheduledAt.push(
      ...(await enqueueDeliveries(tx, delivery, deliveries, signal)),
    );
  }

  const preparedDebts = debts.map((row) => ({
    id: randomUUID(),
    row,
    account: accountByRef.get(row.accountRef)!,
    dueAt: new Date(row.dueAt),
  }));
  processed = 0;
  for (const batch of batches(preparedDebts)) {
    stopIfAborted(signal);
    await tx.financeDebt.createMany({
      data: batch.map(({ id, row, account, dueAt }) => ({
        id,
        profileId,
        accountId: input.accountIds.get(row.accountRef)!,
        settlementTransactionId: row.settlementTransactionRef
          ? input.transactionIds.get(row.settlementTransactionRef)!
          : null,
        direction: row.direction,
        status: row.status ?? 'OPEN',
        name: row.name.trim(),
        amount: decimal(row.amount),
        currency: account.currency,
        dueAt,
        scheduleTimezone: row.scheduleTimezone,
        note: row.note?.trim() || null,
        settledAt: optionalDate(row.settledAt),
      })),
    });
    processed += batch.length;
    report(onProgress, 'debts', processed, debts.length, 7);
  }
  if (!preparedDebts.length) report(onProgress, 'debts', 0, 0, 7);
  if (target) {
    const deliveries = preparedDebts.flatMap(({ id, row, account, dueAt }) =>
      (row.status ?? 'OPEN') === 'OPEN'
        ? [
            {
              ...target,
              financeDebtId: id,
              message: presentation.debtDue({
                botIntegrationId: profile.botIntegrationId,
                debtName: row.name.trim(),
                amount: row.amount,
                currency: account.currency,
                locale: target.locale,
              }),
              scheduledAt: dueAt,
              idempotencyKey: `finance-debt:${id}:0:${dueAt.toISOString()}`,
            },
          ]
        : [],
    );
    scheduledAt.push(
      ...(await enqueueDeliveries(tx, delivery, deliveries, signal)),
    );
  }

  const preparedPayments = regularPayments.map((row) => {
    const id = randomUUID();
    const nextOccurrenceAt = new Date(row.nextOccurrenceAt);
    const anchor = financeRecurrenceAnchor(
      financeLocalCalendarDate(nextOccurrenceAt, row.scheduleTimezone),
      row.recurrence,
    );
    return {
      id,
      row,
      account: accountByRef.get(row.accountRef)!,
      category: row.categoryRef ? categoryByRef.get(row.categoryRef)! : null,
      nextOccurrenceAt,
      anchor,
      status: row.status ?? ('ACTIVE' as const),
    };
  });
  processed = 0;
  for (const batch of batches(preparedPayments)) {
    stopIfAborted(signal);
    await tx.financeRecurringPayment.createMany({
      data: batch.map(
        ({ id, row, account, nextOccurrenceAt, anchor, status }) => ({
          id,
          profileId,
          accountId: input.accountIds.get(row.accountRef)!,
          categoryId: row.categoryRef
            ? input.categoryIds.get(row.categoryRef)!
            : null,
          name: row.name.trim(),
          amount: decimal(row.amount),
          currency: account.currency,
          recurrence: row.recurrence,
          ...anchor,
          nextOccurrenceAt,
          scheduleTimezone: row.scheduleTimezone,
          note: row.note?.trim() || null,
          status,
          version: 1,
        }),
      ),
    });
    await tx.financeRecurringPaymentRevision.createMany({
      data: batch.map(
        ({ id, row, account, category, nextOccurrenceAt, anchor, status }) => ({
          recurringPaymentId: id,
          version: 1,
          kind: 'CREATED' as const,
          name: row.name.trim(),
          amount: decimal(row.amount),
          currency: account.currency,
          accountId: input.accountIds.get(row.accountRef)!,
          accountName: account.name,
          categoryId: row.categoryRef
            ? input.categoryIds.get(row.categoryRef)!
            : null,
          categoryName: category?.name ?? null,
          categoryKey: category?.key ?? null,
          recurrence: row.recurrence,
          ...anchor,
          nextOccurrenceAt,
          scheduleTimezone: row.scheduleTimezone,
          note: row.note?.trim() || null,
          status,
        }),
      ),
    });
    processed += batch.length;
    report(onProgress, 'regularPayments', processed, regularPayments.length, 8);
  }
  if (!preparedPayments.length) report(onProgress, 'regularPayments', 0, 0, 8);
  if (target) {
    const deliveries = preparedPayments.flatMap(
      ({ id, row, account, nextOccurrenceAt, status }) =>
        status === 'ACTIVE'
          ? [
              {
                ...target,
                financeRecurringPaymentId: id,
                message: presentation.regularPaymentDue({
                  botIntegrationId: profile.botIntegrationId,
                  regularPaymentId: id,
                  name: row.name.trim(),
                  amount: row.amount,
                  currency: account.currency,
                  expectedOccurrenceAt: nextOccurrenceAt,
                  configVersion: 1,
                  locale: target.locale,
                }),
                scheduledAt: nextOccurrenceAt,
                idempotencyKey: `finance-regular:${id}:1:${nextOccurrenceAt.toISOString()}`,
              },
            ]
          : [],
    );
    scheduledAt.push(
      ...(await enqueueDeliveries(tx, delivery, deliveries, signal)),
    );
  }

  const counts: ConsumerFinanceImportResult['counts'] = {
    reminders: reminders.length,
    debts: debts.length,
    regularPayments: regularPayments.length,
  };
  return { counts, scheduledAt };
}
