"use client";

import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ConsumerFinanceSavingsGoal,
  ConsumerFinanceSavingsGoalInput,
  ConsumerFinanceSavingsGoalStatus,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
} from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeSavingsCopy } from "./i18n/savings";
import { consumerFinanceSavingsGoalsApi } from "@/lib/features/finance/consumer-finance-savings-goals-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { consumerFinanceRequestId } from "@/lib/features/finance/consumer-finance-assets";
import {
  invalidateConsumerAssetDerivations,
  patchSavingsGoal,
  patchSavingsMutation,
} from "@/lib/features/finance/consumer-finance-assets-cache";
import { FinanceSavingsGoalEditor } from "./finance-savings-goal-editor";
import { FinanceSavingsGoalCard } from "./finance-savings-goal-card";
import {
  FinanceSavingsActionModal,
  type SavingsAction,
  type SavingsActionValues,
} from "./finance-savings-action-modal";
import { FinanceSavingsHistory } from "./finance-savings-history";

type StatusFilter = ConsumerFinanceSavingsGoalStatus | "ALL";

export function FinanceSavings({
  botId,
  locale,
  defaultCurrency,
}: {
  botId: string;
  locale: FinanceLocale;
  defaultCurrency: string;
}) {
  const t = financeSavingsCopy(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [editing, setEditing] = useState<
    ConsumerFinanceSavingsGoal | "new" | null
  >(null);
  const [action, setAction] = useState<{
    goal: ConsumerFinanceSavingsGoal;
    kind: SavingsAction;
  } | null>(null);
  const [history, setHistory] = useState<ConsumerFinanceSavingsGoal | null>(
    null,
  );
  const movementAttempt = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const filters = status === "ALL" ? {} : { status };
  const goalsQuery = useInfiniteQuery({
    queryKey: consumerFinanceKeys.savingsGoals(botId, filters),
    queryFn: ({ pageParam }) =>
      consumerFinanceSavingsGoalsApi.list(botId, {
        ...filters,
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  useInfiniteQuery({
    queryKey: consumerFinanceKeys.savingsGoals(botId, { status: "ACTIVE" }),
    queryFn: ({ pageParam }) =>
      consumerFinanceSavingsGoalsApi.list(botId, {
        status: "ACTIVE",
        cursor: pageParam,
        limit: 100,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: status !== "ACTIVE",
    retry: false,
  });
  const accountsQuery = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
    retry: false,
  });
  const reconcile = (goal: ConsumerFinanceSavingsGoal) => {
    patchSavingsGoal(client, botId, goal);
    invalidateConsumerAssetDerivations(client, botId);
  };
  const save = useMutation({
    mutationFn: (payload: ConsumerFinanceSavingsGoalInput) =>
      editing === "new"
        ? consumerFinanceSavingsGoalsApi.create(botId, payload)
        : consumerFinanceSavingsGoalsApi.update(botId, editing!.id, payload),
    onSuccess: (goal) => {
      reconcile(goal);
      setEditing(null);
    },
  });
  const movement = useMutation({
    mutationFn: ({
      values,
      current,
    }: {
      values: SavingsActionValues;
      current: { goal: ConsumerFinanceSavingsGoal; kind: SavingsAction };
    }) => {
      const fingerprint = JSON.stringify({
        goalId: current.goal.id,
        kind: current.kind,
        values,
      });
      if (movementAttempt.current?.fingerprint !== fingerprint)
        movementAttempt.current = {
          fingerprint,
          idempotencyKey: consumerFinanceRequestId(
            `savings-${current.kind.toLowerCase()}`,
          ),
        };
      const base = {
        accountId: values.accountId,
        amount: values.amount,
        occurredAt: values.occurredAt,
        note: values.note,
        linkedTransferId: values.linkedTransferId,
        idempotencyKey: movementAttempt.current.idempotencyKey,
      };
      if (current.kind === "ALLOCATE")
        return consumerFinanceSavingsGoalsApi.allocate(
          botId,
          current.goal.id,
          base,
        );
      if (current.kind === "RELEASE")
        return consumerFinanceSavingsGoalsApi.release(
          botId,
          current.goal.id,
          base,
        );
      return consumerFinanceSavingsGoalsApi.reallocate(botId, {
        fromGoalId: current.goal.id,
        toGoalId: values.toGoalId!,
        accountId: values.accountId,
        amount: values.amount,
        occurredAt: values.occurredAt,
        note: values.note,
        idempotencyKey: base.idempotencyKey,
      });
    },
    onSuccess: (result) => {
      movementAttempt.current = null;
      patchSavingsMutation(client, botId, result);
      invalidateConsumerAssetDerivations(client, botId);
      setAction(null);
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({
      goal,
      next,
    }: {
      goal: ConsumerFinanceSavingsGoal;
      next: "COMPLETE" | "ARCHIVE";
    }) =>
      next === "COMPLETE"
        ? consumerFinanceSavingsGoalsApi.complete(botId, goal.id)
        : consumerFinanceSavingsGoalsApi.archive(botId, goal.id),
    onSuccess: reconcile,
  });
  if (goalsQuery.isLoading || accountsQuery.isLoading)
    return <LoadingState text={t.loading} />;
  if (goalsQuery.isError || accountsQuery.isError || !goalsQuery.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.loadError} />
        <Button
          onClick={() =>
            void Promise.all([goalsQuery.refetch(), accountsQuery.refetch()])
          }
        >
          {t.retry}
        </Button>
      </div>
    );
  const visible = goalsQuery.data.pages.flatMap((page) => page.items);
  const allGoals = client
    .getQueriesData<
      import("@tanstack/react-query").InfiniteData<
        import("@telegram-system/shared").ConsumerFinanceSavingsGoalPage
      >
    >({ queryKey: consumerFinanceKeys.savingsGoalLists(botId) })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
    .filter(
      (goal, index, rows) =>
        rows.findIndex((candidate) => candidate.id === goal.id) === index,
    );
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            {t.subtitle}
          </p>
          <p className="mt-2 text-xs text-sky-300">{t.physicalMoney}</p>
        </div>
        <Button onClick={() => setEditing("new")}>{t.add}</Button>
      </Card>
      <div className="max-w-xs">
        <label className="mb-1 block text-sm text-neutral-300">
          {t.filter}
        </label>
        <Select
          uiLocale={locale}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="ACTIVE">{t.active}</option>
          <option value="COMPLETED">{t.completed}</option>
          <option value="ARCHIVED">{t.archived}</option>
          <option value="ALL">{t.all}</option>
        </Select>
      </div>
      {visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((goal) => (
            <FinanceSavingsGoalCard
              key={goal.id}
              goal={goal}
              locale={locale}
              onEdit={() => setEditing(goal)}
              onAction={(kind) => {
                movementAttempt.current = null;
                setAction({ goal, kind });
              }}
              onHistory={() => setHistory(goal)}
              onComplete={() =>
                statusMutation.mutate({ goal, next: "COMPLETE" })
              }
              onArchive={() => {
                if (window.confirm(t.confirmArchive))
                  statusMutation.mutate({ goal, next: "ARCHIVE" });
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState text={t.empty} />
      )}
      {goalsQuery.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={goalsQuery.isFetchingNextPage}
          onClick={() => goalsQuery.fetchNextPage()}
        >
          {t.loadMore}
        </Button>
      ) : null}
      {editing ? (
        <FinanceSavingsGoalEditor
          open={editing !== null}
          goal={editing === "new" ? null : editing}
          locale={locale}
          defaultCurrency={defaultCurrency}
          pending={save.isPending}
          error={save.isError}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => save.mutate(payload)}
        />
      ) : null}
      {action ? (
        <FinanceSavingsActionModal
          open
          action={action.kind}
          goal={action.goal}
          goals={allGoals}
          accounts={accountsQuery.data ?? []}
          locale={locale}
          pending={movement.isPending}
          error={movement.isError}
          onClose={() => {
            movementAttempt.current = null;
            setAction(null);
          }}
          onSubmit={(values) => movement.mutate({ values, current: action })}
        />
      ) : null}
      {history ? (
        <FinanceSavingsHistory
          botId={botId}
          goal={history}
          locale={locale}
          open
          onClose={() => setHistory(null)}
        />
      ) : null}
      {statusMutation.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          {t.actionError}
        </p>
      ) : null}
    </div>
  );
}
