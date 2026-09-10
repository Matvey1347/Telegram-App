"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceRegularPaymentConfirm } from "./finance-regular-payment-confirm";
import { FinanceRegularPaymentEditor } from "./finance-regular-payment-editor";
import { FinanceRegularPaymentHistory } from "./finance-regular-payment-history";
import { IconAvatar } from "./ui/finance-icon-avatar";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  invalidateConsumerFinanceLedgerReads,
  reconcileConsumerRegularPaymentPages,
} from "@/lib/features/finance/consumer-finance-obligations-cache";
import { reconcileConsumerTransactionCaches } from "@/lib/features/finance/consumer-finance-cache";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { ConsumerFinanceRegularPaymentTarget } from "./consumer-finance-navigation";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeRegularPaymentsCopy } from "./i18n/regular-payments";

type Payment = ConsumerFinanceRegularPayment;
type ConfirmationRequest = {
  payment: Payment;
  expectedOccurrenceAt: string;
  expectedVersion: number;
  customAmount: boolean;
};

export function FinanceRegularPayments({
  botId,
  locale,
  timezone,
  target,
  targetMalformed = false,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
  target?: ConsumerFinanceRegularPaymentTarget | null;
  targetMalformed?: boolean;
}) {
  const t = financeRegularPaymentsCopy(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "CANCELED">(
    "ACTIVE",
  );
  const [editing, setEditing] = useState<Payment | "create" | null>(null);
  const [history, setHistory] = useState<Payment | null>(null);
  const [canceling, setCanceling] = useState<Payment | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [dismissedTarget, setDismissedTarget] = useState<string | null>(null);
  const targetKey = target
    ? `${target.regularPaymentId}:${target.occurrenceAt}:${target.expectedVersion}`
    : null;
  const targetLookup = Boolean(target && targetKey !== dismissedTarget);
  const pageLimit = targetLookup ? 1 : 30;
  const queryStatus = targetLookup ? "ACTIVE" : status;
  const payments = useInfiniteQuery({
    queryKey: consumerFinanceKeys.regularPayments(botId, {
      status: queryStatus,
      ...(targetLookup ? { id: target!.regularPaymentId } : {}),
      limit: pageLimit,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceObligationsApi.regularPayments(botId, {
        status: queryStatus,
        ...(targetLookup ? { id: target!.regularPaymentId } : {}),
        limit: pageLimit,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = payments.data?.pages.flatMap((page) => page.items) ?? [];
  const targetPayment = target
    ? items.find((payment) => payment.id === target.regularPaymentId)
    : undefined;
  const targetConfirmation =
    target && targetKey !== dismissedTarget && targetPayment
      ? {
          payment: targetPayment,
          expectedOccurrenceAt: target.occurrenceAt,
          expectedVersion: target.expectedVersion,
          customAmount: true,
        }
      : null;
  const activeConfirmation = confirmation ?? targetConfirmation;
  const closeConfirmation = () => {
    if (targetKey) setDismissedTarget(targetKey);
    setConfirmation(null);
  };
  const statusAction = useMutation({
    mutationFn: ({
      payment,
      action,
    }: {
      payment: ConsumerFinanceRegularPayment;
      action: "pause" | "resume" | "cancel";
    }) =>
      action === "pause"
        ? consumerFinanceObligationsApi.pauseRegularPayment(botId, payment.id)
        : action === "resume"
          ? consumerFinanceObligationsApi.resumeRegularPayment(
              botId,
              payment.id,
            )
          : consumerFinanceObligationsApi.cancelRegularPayment(
              botId,
              payment.id,
            ),
    onSuccess: (payment) => {
      reconcileConsumerRegularPaymentPages(client, botId, payment);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.regularPaymentRevisions(
          botId,
          payment.id,
        ),
      });
      setCanceling(null);
    },
  });
  const reconcile = (payment: Payment) => {
    reconcileConsumerRegularPaymentPages(client, botId, payment);
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.regularPaymentRevisions(botId, payment.id),
    });
    setEditing(null);
  };
  const reconcileConfirmation = (
    result: ConsumerFinanceRegularPaymentConfirmation,
  ) => {
    reconcileConsumerRegularPaymentPages(client, botId, result.regularPayment);
    reconcileConsumerTransactionCaches(
      client,
      botId,
      result.transaction,
      timezone,
    );
    void invalidateConsumerFinanceLedgerReads(client, botId);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="tablist">
          {(["ACTIVE", "PAUSED", "CANCELED"] as const).map((value) => (
            <Button
              key={value}
              role="tab"
              aria-selected={status === value}
              variant={status === value ? "primary" : "secondary"}
              onClick={() => setStatus(value)}
            >
              {value === "ACTIVE"
                ? t.active
                : value === "PAUSED"
                  ? t.paused
                  : t.canceled}
            </Button>
          ))}
        </div>
        <Button onClick={() => setEditing("create")}>
          {t.addRegularPayment}
        </Button>
      </div>
      {targetMalformed ? (
        <p role="alert" className="text-sm text-amber-300">
          {t.malformedTarget}
        </p>
      ) : target && !targetPayment && payments.isSuccess ? (
        <p role="status" className="text-sm text-amber-300">
          {t.targetNotFound}
        </p>
      ) : null}
      {payments.isLoading ? (
        <LoadingState text={t.loadingPayments} />
      ) : payments.isError ? (
        <div className="space-y-3">
          <ErrorState text={t.paymentLoadError} />
          <Button onClick={() => payments.refetch()}>{t.retry}</Button>
        </div>
      ) : items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((payment) => (
            <RegularPaymentCard
              key={payment.id}
              payment={payment}
              locale={locale}
              busy={statusAction.isPending}
              onEdit={() => setEditing(payment)}
              onHistory={() => setHistory(payment)}
              onPause={() => statusAction.mutate({ payment, action: "pause" })}
              onResume={() =>
                statusAction.mutate({ payment, action: "resume" })
              }
              onCancel={() => setCanceling(payment)}
              onConfirm={(customAmount) =>
                setConfirmation({
                  payment,
                  expectedOccurrenceAt: payment.nextOccurrenceAt,
                  expectedVersion: payment.version,
                  customAmount,
                })
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState text={t.noPayments} />
      )}
      {payments.hasNextPage ? (
        <Button
          className="w-full"
          variant="secondary"
          disabled={payments.isFetchingNextPage}
          onClick={() => payments.fetchNextPage()}
        >
          {payments.isFetchingNextPage ? t.loading : t.loadMore}
        </Button>
      ) : null}
      {editing ? (
        <FinanceRegularPaymentEditor
          key={editing === "create" ? "create" : editing.id}
          botId={botId}
          editing={editing === "create" ? null : editing}
          locale={locale}
          timezone={timezone}
          onClose={() => setEditing(null)}
          onSaved={reconcile}
        />
      ) : null}
      {history ? (
        <FinanceRegularPaymentHistory
          key={history.id}
          botId={botId}
          payment={history}
          locale={locale}
          timezone={timezone}
          onClose={() => setHistory(null)}
        />
      ) : null}
      {activeConfirmation ? (
        <FinanceRegularPaymentConfirm
          key={`${activeConfirmation.payment.id}:${activeConfirmation.expectedOccurrenceAt}:${activeConfirmation.customAmount}`}
          botId={botId}
          payment={activeConfirmation.payment}
          expectedOccurrenceAt={activeConfirmation.expectedOccurrenceAt}
          expectedVersion={activeConfirmation.expectedVersion}
          customAmount={activeConfirmation.customAmount}
          locale={locale}
          onClose={closeConfirmation}
          onConfirmed={reconcileConfirmation}
          onApplied={reconcile}
        />
      ) : null}
      <FinanceConfirmModal
        key={canceling?.id ?? "cancel-regular-payment"}
        open={!!canceling}
        locale={locale}
        entityName={canceling?.name ?? ""}
        actionLabel={t.cancelPayment}
        description={t.cancelDescription}
        onClose={() => setCanceling(null)}
        onConfirm={() =>
          canceling
            ? statusAction.mutateAsync({ payment: canceling, action: "cancel" })
            : undefined
        }
      />
      {statusAction.isError ? <ErrorState text={t.actionError} /> : null}
    </div>
  );
}

function RegularPaymentCard({
  payment,
  locale,
  busy,
  onEdit,
  onHistory,
  onPause,
  onResume,
  onCancel,
  onConfirm,
}: {
  payment: Payment;
  locale: FinanceLocale;
  busy: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onConfirm: (customAmount: boolean) => void;
}) {
  const t = financeRegularPaymentsCopy(locale);
  const recurrence =
    payment.recurrence === "WEEKLY"
      ? t.weekly
      : payment.recurrence === "MONTHLY"
        ? t.monthly
        : t.yearly;
  return (
    <Card className={payment.isDue ? "border-amber-700" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <IconAvatar
            icon={payment.account.iconPresentation}
            label={payment.account.name}
            size="sm"
            bordered={false}
          />
          <div className="min-w-0">
            <h2 className="truncate font-medium">{payment.name}</h2>
            <p className="text-xs text-neutral-400">
              {payment.account.name} · {recurrence}
            </p>
          </div>
        </div>
        <strong className="shrink-0 tabular-nums">
          {formatMoney(payment.amount, payment.currency, "symbol")}
        </strong>
      </div>
      <p
        className={`mt-3 text-sm ${payment.isDue ? "font-medium text-amber-300" : "text-neutral-400"}`}
      >
        {payment.isDue ? `${t.due} · ` : ""}
        {new Intl.DateTimeFormat(financeIntlLocale(locale), {
          timeZone: payment.scheduleTimezone,
        }).format(new Date(payment.nextOccurrenceAt))}
      </p>
      {payment.category ? (
        <p className="mt-1 text-xs text-neutral-500">
          {localizeFinanceCategory(
            payment.category.name,
            payment.category.key,
            locale,
          )}
        </p>
      ) : null}
      {payment.note ? (
        <p className="mt-2 text-sm text-neutral-400">{payment.note}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {payment.status === "ACTIVE" && payment.isDue ? (
          <>
            <Button disabled={busy} onClick={() => onConfirm(false)}>
              {t.confirmPayment}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onConfirm(true)}
            >
              {t.changeAmount}
            </Button>
          </>
        ) : null}
        {payment.status !== "CANCELED" ? (
          <Button variant="secondary" disabled={busy} onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> {t.edit}
          </Button>
        ) : null}
        {payment.status === "ACTIVE" ? (
          <Button variant="secondary" disabled={busy} onClick={onPause}>
            {t.pause}
          </Button>
        ) : payment.status === "PAUSED" ? (
          <Button variant="secondary" disabled={busy} onClick={onResume}>
            {t.resume}
          </Button>
        ) : null}
        {payment.status !== "CANCELED" ? (
          <Button variant="danger" disabled={busy} onClick={onCancel}>
            {t.cancelPayment}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onHistory}>
          {t.history}
        </Button>
      </div>
    </Card>
  );
}
