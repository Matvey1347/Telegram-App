"use client";

import { useEffect, useMemo, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GroshlyApp } from "@finance-web/groshly/main";
import { readFinanceRateCache } from "@finance-web/groshly/rate-cache";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";
import { useTelegramMiniAppBootstrap } from "@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap";
import { ConsumerFinanceLogin } from "@consumer-finance/web/components/app/consumer-finance-login";
import { useFinanceBotBranding } from "@consumer-finance/web/components/hooks/use-finance-bot-branding";
import { consumerFinanceInsightsApi } from "@consumer-finance/web/lib/api/consumer-finance-insights-api";
import { consumerFinanceInvestmentsApi } from "@consumer-finance/web/lib/api/consumer-finance-investments-api";
import { consumerFinanceLedgerApi } from "@consumer-finance/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceProfileApi } from "@consumer-finance/web/lib/api/consumer-finance-profile-api";
import { consumerFinanceObligationsApi } from "@consumer-finance/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import type { ConsumerFinanceRegularPaymentInput } from "@telegram-system/shared";
import type { ConsumerFinanceSettingsInput } from "@telegram-system/shared";
import type { ConsumerFinanceDebtInput } from "@telegram-system/shared";
import type { ConsumerFinanceHistoryPage, ConsumerFinanceTransaction } from "@telegram-system/shared";
import type { ConsumerFinanceStartup } from "@telegram-system/shared";

type GroshlySnapshot = Record<string, unknown>;
function BrowserLoginRedirect() {
  useEffect(() => { window.location.replace("/login"); }, []);
  return <GroshlyLoadingScreen />;
}

const GroshlyRoot = GroshlyApp as ComponentType<{
  financeBotId: string;
  financeIdentityScope: string;
  financeTelegramInitData?: string;
  initialData: GroshlySnapshot;
  logoUrl: string;
  faviconUrl: string;
  faviconLightUrl?: string;
  telegramAuthenticated: boolean;
  onRefresh: () => Promise<GroshlySnapshot>;
  onCloseInvestment: (input: {
    id: string;
    closedAt: string;
    accountId?: string;
    finalReturn: number;
    note: string;
    idempotencyKey: string;
  }) => Promise<GroshlySnapshot>;
  onSaveLedgerEntry: (input: {
    draft: Record<string, unknown>;
    editing?: Record<string, unknown> | null;
    recurring?: {
      id: string;
      expectedOccurrenceAt: string;
      expectedVersion: number;
    };
  }) => Promise<GroshlySnapshot>;
  onDeleteLedgerEntry: (input: {
    id: string;
    type: string;
  }) => Promise<GroshlySnapshot>;
  onSaveRegularPayment: (input: {
    id?: string;
    values: Record<string, any>;
  }) => Promise<GroshlySnapshot>;
  onChangeRegularPayment: (input: {
    id: string;
    action: "pause" | "resume" | "cancel";
  }) => Promise<GroshlySnapshot>;
  onSaveDebt: (input: {
    id?: string;
    values: Record<string, unknown>;
  }) => Promise<GroshlySnapshot>;
  onDeleteDebt: (id: string) => Promise<GroshlySnapshot>;
  onSettleDebt: (input: {
    id: string;
    accountId: string;
    amount: string;
    settlementDate: string;
  }) => Promise<GroshlySnapshot>;
  onSaveSettings: (
    input: Partial<ConsumerFinanceSettingsInput>,
  ) => Promise<GroshlySnapshot>;
  onArchiveEntity: (input: {
    kind: "account" | "category";
    id: string;
    restore: boolean;
  }) => Promise<GroshlySnapshot>;
  onLoadMore: (
    kind: "transactions" | "analytics" | "debts" | "recurring" | "investments",
  ) => Promise<GroshlySnapshot>;
  onOpenInvestment: (id: string) => Promise<{
    status: string;
    closedAt: string;
    description: string;
    events: Array<{
      id: string;
      date: string;
      type: string;
      amount: number;
      accountId?: string | null;
    }>;
  }>;
}>;

const defaultEmojiByAccountType = {
  CASH: "💵",
  CARD: "💳",
  SAVINGS: "🐷",
  OTHER: "🏦",
} as const;

function emoji(presentation: unknown, fallback: string) {
  if (
    presentation &&
    typeof presentation === "object" &&
    "type" in presentation &&
    "value" in presentation &&
    (presentation as { type?: unknown }).type === "unicode" &&
    typeof (presentation as { value?: unknown }).value === "string"
  ) {
    return (presentation as { value: string }).value;
  }
  return fallback;
}

export function groshlyIdentityScope(initData?: string) {
  if (!initData) return "unverified";
  try {
    const user = JSON.parse(
      new URLSearchParams(initData).get("user") ?? "null",
    ) as {
      id?: unknown;
    } | null;
    return typeof user?.id === "number" || typeof user?.id === "string"
      ? `telegram-user:${user.id}`
      : "unverified";
  } catch {
    return "unverified";
  }
}

export function groshlyDebtInput(values: Record<string, unknown>): ConsumerFinanceDebtInput {
  return {
    direction: values.direction === "owe" ? "I_OWE" : "OWED_TO_ME",
    name: String(values.name ?? "").trim(),
    emoji: values.emoji == null ? null : String(values.emoji),
    amount: String(values.amount ?? ""),
    accountId: String(values.accountId ?? ""),
    recordTransaction: values.recordTransaction !== false,
    dueDate: String(values.due ?? new Date().toISOString().slice(0, 10)),
    ...(values.notes ? { note: String(values.notes) } : {}),
  };
}

export function groshlySnapshot({
  profile,
  dashboard,
  accounts,
  categories,
  transactions,
  obligations,
}: {
  profile: {
    defaultCurrency: string;
    classifyExpenses: boolean;
    splitExpenses: boolean;
    defaultExpenseCategoryId: string | null;
    defaultIncomeCategoryId: string | null;
    timezone: string;
    locale: "uk" | "ru" | "en";
    localeOverride?: "uk" | "ru" | "en" | null;
    telegramUser: {
      displayName: string;
      username: string | null;
      avatarUrl: string | null;
    };
    displayNameOverride?: string | null;
    avatarUrl?: string | null;
  };
  dashboard?: unknown;
  accounts: Array<{
    id: string;
    name: string;
    iconPresentation: unknown;
    type: keyof typeof defaultEmojiByAccountType;
    currency: string;
    balance: string;
    archivedAt?: string | null;
  }>;
  categories: Array<{
    id: string;
    name: string;
    type: "INCOME" | "EXPENSE";
    iconPresentation: unknown;
    archivedAt?: string | null;
    necessity?: "UNSPECIFIED" | "REQUIRED" | "DISCRETIONARY";
  }>;
  transactions: {
    items: Array<{
      id: string;
      accountId: string;
      categoryId?: string | null;
      type: "INCOME" | "EXPENSE";
      purpose: "ORDINARY" | "REIMBURSEMENT" | "PASS_THROUGH" | "DEBT_REPAYMENT" | "INVESTMENT_CONTRIBUTION" | "INVESTMENT_RETURN";
      amount: string;
      economicAmount?: string;
      recurringPaymentId?: string | null;
      currency: string;
      occurredAt: string;
      description?: string | null;
      necessity?: "UNSPECIFIED" | "REQUIRED" | "DISCRETIONARY";
      category?: { iconPresentation: unknown } | null;
    }>;
    nextCursor?: string | null;
  };
  obligations?: {
    debts: Awaited<ReturnType<typeof consumerFinanceObligationsApi.debts>>;
    regularPayments: Awaited<
      ReturnType<typeof consumerFinanceObligationsApi.regularPayments>
    >;
    investments: Awaited<ReturnType<typeof consumerFinanceInvestmentsApi.list>>;
  };
}): GroshlySnapshot {
  return {
    version: 20,
    onboarded: true,
    lang: profile.locale === "ru" ? "uk" : profile.locale,
    currency: profile.defaultCurrency,
    classifyExpenses: profile.classifyExpenses,
    splitExpenses: profile.splitExpenses,
    defaultExpenseCategoryId: profile.defaultExpenseCategoryId,
    defaultIncomeCategoryId: profile.defaultIncomeCategoryId,
    theme: "light",
    ...(readFinanceRateCache() ?? { rates: { UAH: 1, PLN: 10.7, USD: 41.8, EUR: 48.2 }, rateSource: "demo" }),
    profile: {
      name: profile.displayNameOverride || profile.telegramUser.displayName,
      handle: profile.telegramUser.username
        ? `@${profile.telegramUser.username}`
        : "",
      photo: profile.avatarUrl || profile.telegramUser.avatarUrl || "",
      notifications: true,
    },
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      emoji: emoji(
        account.iconPresentation,
        defaultEmojiByAccountType[account.type],
      ),
      balance: Number(account.balance),
      currency: account.currency,
      archivedAt: account.archivedAt ?? null,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      nameEn: category.name,
      emoji: emoji(category.iconPresentation, "✨"),
      type: category.type.toLowerCase(),
      archivedAt: category.archivedAt ?? null,
      necessity:
        category.necessity === "REQUIRED"
          ? "essential"
          : category.necessity === "DISCRETIONARY"
            ? "desired"
            : "optional",
    })),
    transactions: transactions.items.map((transaction) => ({
      id: transaction.id,
      type: transaction.type.toLowerCase(),
      purpose: transaction.purpose,
      amount: Number(transaction.amount),
      economicAmount: Number(transaction.economicAmount ?? transaction.amount),
      recurringId: transaction.recurringPaymentId || "",
      accountId: transaction.accountId,
      categoryId: transaction.categoryId || "",
      title: transaction.description || "",
      emoji: emoji(transaction.category?.iconPresentation, "🧾"),
      date: transaction.occurredAt.slice(0, 10),
      currency: transaction.currency,
      necessity:
        transaction.necessity === "REQUIRED"
          ? "essential"
          : transaction.necessity === "DISCRETIONARY"
            ? "desired"
            : "optional",
    })),
    recurring: (obligations?.regularPayments.items ?? []).map((payment) => ({
      id: payment.id,
      version: payment.version,
      nextOccurrenceAt: payment.nextOccurrenceAt,
      title: payment.name,
      amount: Number(payment.amount),
      accountId: payment.accountId,
      categoryId: payment.categoryId || "",
      emoji: emoji(payment.iconPresentation, "🔁"),
      interval: payment.recurrence.toLowerCase(),
      intervalCount: payment.intervalCount ?? 1,
      next: payment.nextOccurrenceAt.slice(0, 10),
      status: payment.status.toLowerCase(),
      necessity: payment.necessity?.toLowerCase(),
    })),
    debts: (obligations?.debts.items ?? [])
      .filter((debt) => debt.status === "OPEN")
      .map((debt) => ({
        id: debt.id,
        name: debt.name,
        direction: debt.direction === "I_OWE" ? "owe" : "owed",
        amount: Number(debt.amount),
        remaining: Number(debt.amount),
        accountId: debt.accountId,
        originTransactionId: debt.originTransactionId,
        settlementTransactionId: debt.settlementTransactionId,
        recordTransaction: Boolean(debt.originTransactionId),
        currency: debt.currency,
        due: debt.dueAt.slice(0, 10),
        emoji: emoji(debt.iconPresentation, "🤝"),
        notes: debt.note || "",
      })),
    investments: (obligations?.investments.items ?? [])
      .filter((investment) => investment.status !== "ARCHIVED")
      .map((investment) => ({
        id: investment.id,
        name: investment.name,
        description: investment.description || "",
        emoji: investment.customTypeEmoji || "📈",
        currency: investment.currency,
        status: investment.status.toLowerCase(),
        startedAt: investment.startedAt.slice(0, 10),
        closedAt: investment.closedAt?.slice(0, 10) || "",
        invested: Number(investment.totalInvested),
        returned: Number(investment.totalReturned),
        value: Number(investment.currentValue),
        events: [],
      })),
    dashboard,
    cursors: {
      transactions: transactions.nextCursor ?? null,
      debts: obligations?.debts.nextCursor ?? null,
      recurring: obligations?.regularPayments.nextCursor ?? null,
      investments: obligations?.investments.nextCursor ?? null,
    },
  };
}

export function GroshlyFinanceApp({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const bootstrap = useTelegramMiniAppBootstrap();
  const identityScope = groshlyIdentityScope(
    bootstrap.status === "ready" ? bootstrap.initData : undefined,
  );
  const groshlyReadKey = useMemo(
    () =>
      [
        ...consumerFinanceKeys.root(botId),
        "groshly-read-model",
        identityScope,
      ] as const,
    [botId, identityScope],
  );
  const obligationsKey = useMemo(
    () =>
      [
        ...consumerFinanceKeys.root(botId),
        "groshly-obligations",
        identityScope,
      ] as const,
    [botId, identityScope],
  );
  const historyKey = useMemo(
    () => consumerFinanceKeys.transactions(botId, { view: "groshly", identityScope, limit: 50 }),
    [botId, identityScope],
  );
  const financeData = useQuery({
    queryKey: groshlyReadKey,
    queryFn: () =>
      consumerFinanceInsightsApi.startup(
        botId,
        bootstrap.status === "ready" ? bootstrap.initData : undefined,
      ),
    enabled: bootstrap.status === "browser" || bootstrap.status === "ready",
    retry: false,
    // Draw a restored snapshot first, then verify it in the background on an
    // app open. That reconciles a transaction created in Telegram, the bot,
    // or another browser without bringing back a blocking loader or polling.
    refetchOnMount: "always",
    refetchOnReconnect: false,
  });
  const { logoUrl, faviconUrl, faviconLightUrl } = useFinanceBotBranding(
    botId,
    financeData.data?.authenticated === true,
  );
  const obligations = useQuery({
    queryKey: obligationsKey,
    queryFn: async () => {
      const [debts, regularPayments, investments] = await Promise.all([
        consumerFinanceObligationsApi.debts(botId, { limit: 50 }),
        consumerFinanceObligationsApi.regularPayments(botId, { limit: 50 }),
        consumerFinanceInvestmentsApi.list(botId, { limit: 50 }),
      ]);
      return { debts, regularPayments, investments };
    },
    enabled: financeData.data?.authenticated === true,
    retry: false,
    refetchOnMount: "always",
    refetchOnReconnect: false,
  });
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => consumerFinanceLedgerApi.transactions(botId, { limit: 50 }),
    enabled: financeData.data?.authenticated === true,
    retry: false,
    refetchOnMount: "always",
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!financeData.data?.authenticated) return;
    const reconcileAfterExternalChange = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: groshlyReadKey,
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: obligationsKey,
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: historyKey,
          refetchType: "active",
        }),
      ]);
    };
    document.addEventListener("visibilitychange", reconcileAfterExternalChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        reconcileAfterExternalChange,
      );
  }, [
    financeData.data?.authenticated,
    groshlyReadKey,
    obligationsKey,
    historyKey,
    queryClient,
  ]);
  const snapshot = useMemo(() => {
    if (!financeData.data?.authenticated) return null;
    return {
      ...groshlySnapshot({
      ...financeData.data,
      transactions: history.data ?? { items: [], nextCursor: null },
      obligations: obligations.data,
      }),
      loading: { history: history.isPending, obligations: obligations.isPending },
      loadErrors: { history: history.isError, obligations: obligations.isError },
    };
  }, [financeData.data, history.data, history.isPending, history.isError, obligations.data, obligations.isPending, obligations.isError]);
  // Client initData is not an authentication boundary. Persisted finance data
  // may render only after this mount's startup request verifies the Telegram
  // signature/session on the server.
  const canDrawCachedSnapshot =
    snapshot !== null && financeData.isFetchedAfterMount;
  const refreshSnapshot = async () => {
    // Keep the previous snapshot visible during the request. Invalidating marks
    // it stale immediately, while refetch replaces it only with server truth.
    await queryClient.invalidateQueries({
      queryKey: groshlyReadKey,
      refetchType: "none",
    });
    const [result, historyResult, obligationResult] = await Promise.all([
      financeData.refetch({ throwOnError: true }),
      history.refetch({ throwOnError: true }),
      obligations.refetch({ throwOnError: true }),
    ]);
    if (!result.data?.authenticated) {
      throw new Error("Finance data is unavailable");
    }
    return groshlySnapshot({
      ...result.data,
      transactions: historyResult.data ?? { items: [], nextCursor: null },
      obligations: obligationResult.data,
    });
  };
  const archiveEntity = async (input: {
    kind: "account" | "category";
    id: string;
    restore: boolean;
  }) => {
    if (input.kind === "account") {
      if (input.restore) {
        await consumerFinanceLedgerApi.restoreAccount(botId, input.id);
      } else {
        await consumerFinanceLedgerApi.archiveAccount(botId, input.id);
      }
    } else if (input.restore) {
      await consumerFinanceLedgerApi.restoreCategory(botId, input.id);
    } else {
      await consumerFinanceLedgerApi.archiveCategory(botId, input.id);
    }
    return refreshSnapshot();
  };
  const closeInvestment = async (input: {
    id: string;
    closedAt: string;
    accountId?: string;
    finalReturn: number;
    note: string;
    idempotencyKey: string;
  }) => {
    if (!financeData.data?.authenticated || !obligations.data) {
      throw new Error("Finance data is unavailable");
    }
    const investment = obligations.data?.investments.items.find(
      (item) => item.id === input.id,
    );
    if (!investment) throw new Error("Investment is unavailable");
    const result = await consumerFinanceInvestmentsApi.close(botId, input.id, {
      closedAt: `${input.closedAt}T12:00:00.000Z`,
      idempotencyKey: input.idempotencyKey,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(input.finalReturn > 0 && input.accountId
        ? {
            finalReturn: {
              accountId: input.accountId,
              amount: String(input.finalReturn),
              ...(input.note.trim() ? { note: input.note.trim() } : {}),
            },
          }
        : {}),
    });
    const nextObligations = {
      ...obligations.data!,
      investments: {
        ...obligations.data!.investments,
        items: obligations.data!.investments.items.map((item) =>
          item.id === input.id ? result.investment : item,
        ),
      },
    };
    queryClient.setQueryData(obligationsKey, nextObligations);
    return groshlySnapshot({
      ...financeData.data,
      transactions: history.data ?? { items: [], nextCursor: null },
      obligations: nextObligations,
    });
  };
  const saveLedgerEntry = async (input: {
    draft: Record<string, any>;
    editing?: Record<string, any> | null;
    recurring?: {
      id: string;
      expectedOccurrenceAt: string;
      expectedVersion: number;
    };
  }) => {
    if (!financeData.data?.authenticated)
      throw new Error("Finance data is unavailable");
    const { draft, editing, recurring } = input;
    const occurredAt = `${draft.date || new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
    let savedTransaction: ConsumerFinanceTransaction | undefined;
    if (recurring) {
      await consumerFinanceObligationsApi.confirmRegularPayment(
        botId,
        recurring.id,
        {
          expectedOccurrenceAt: recurring.expectedOccurrenceAt,
          expectedVersion: recurring.expectedVersion,
          amount: String(draft.amount),
          accountId: draft.accountId,
          categoryId: draft.categoryId || null,
          description: draft.title,
          emoji: draft.emoji,
          occurredAt,
          ...(draft.necessity
            ? {
                necessity:
                  draft.necessity === "essential"
                    ? "REQUIRED"
                    : draft.necessity === "desired"
                      ? "DISCRETIONARY"
                      : "UNSPECIFIED",
              }
            : {}),
        },
      );
    } else if (draft.type === "transfer") {
      const payload = {
        fromAccountId: draft.fromId,
        toAccountId: draft.toId,
        amount: String(draft.amount),
        toAmount: String(draft.receivedAmount ?? draft.amount),
        description: draft.title,
        occurredAt,
      };
      if (editing?.id)
        await consumerFinanceLedgerApi.updateTransfer(
          botId,
          String(editing.id),
          payload,
        );
      else await consumerFinanceLedgerApi.createTransfer(botId, payload);
    } else if (
      draft.sharedEnabled &&
      Array.isArray(draft.sharedRows) &&
      draft.sharedRows.length
    ) {
      if (editing?.id)
        throw new Error("Shared expense edits are not supported");
      const shares = draft.sharedRows.filter(
        (row: any) => Number(row.amount) > 0,
      );
      await consumerFinanceObligationsApi.createSharedExpense(botId, {
        accountId: draft.accountId,
        categoryId: draft.categoryId || undefined,
        amount: String(draft.amount),
        ownShare: String(
          Math.max(
            0,
            Number(draft.amount) -
              shares.reduce(
                (sum: number, row: any) => sum + Number(row.amount),
                0,
              ),
          ),
        ),
        description: draft.title,
        occurredAt,
        participants: shares.map((row: any) => ({
          name: row.person,
          amount: String(row.amount),
          dueDate: draft.date || new Date().toISOString().slice(0, 10),
        })),
      });
    } else {
      const payload = {
        accountId: draft.accountId,
        categoryId: draft.categoryId || undefined,
        type:
          draft.type === "income" ? ("INCOME" as const) : ("EXPENSE" as const),
        amount: String(draft.amount),
        description: draft.title,
        occurredAt,
        ...(draft.necessity
          ? {
              necessity:
                draft.necessity === "essential"
                  ? ("REQUIRED" as const)
                  : draft.necessity === "desired"
                    ? ("DISCRETIONARY" as const)
                    : ("UNSPECIFIED" as const),
            }
          : {}),
      };
      if (editing?.id)
        savedTransaction = await consumerFinanceLedgerApi.updateTransaction(
          botId,
          String(editing.id),
          payload,
        );
      else savedTransaction = await consumerFinanceLedgerApi.createTransaction(botId, payload);
    }
    if (savedTransaction) {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: groshlyReadKey }),
        queryClient.cancelQueries({ queryKey: historyKey }),
      ]);
      const currentFinance = queryClient.getQueryData<ConsumerFinanceStartup>(groshlyReadKey);
      if (!currentFinance?.authenticated) throw new Error("Finance data is unavailable");
      const currentHistory = queryClient.getQueryData<ConsumerFinanceHistoryPage>(historyKey);
      const previous = currentHistory?.items.find((item) => item.id === savedTransaction.id);
      const nextHistory: ConsumerFinanceHistoryPage = {
        items: [savedTransaction, ...(currentHistory?.items ?? []).filter((item) => item.id !== savedTransaction.id)],
        nextCursor: currentHistory?.nextCursor ?? null,
      };
      const accountDelta = (transaction: ConsumerFinanceTransaction, sign: number) =>
        (transaction.type === "INCOME" ? 1 : -1) * Number(transaction.amount) * sign;
      const nextFinance = {
        ...currentFinance,
        accounts: currentFinance.accounts.map((account) => {
          const change =
            (previous?.accountId === account.id ? accountDelta(previous, -1) : 0) +
            (savedTransaction?.accountId === account.id ? accountDelta(savedTransaction, 1) : 0);
          return change ? { ...account, balance: (Math.round((Number(account.balance) + change) * 100) / 100).toFixed(2) } : account;
        }),
      };
      queryClient.setQueryData(groshlyReadKey, nextFinance);
      queryClient.setQueryData(historyKey, nextHistory);
      if (!currentHistory) void queryClient.invalidateQueries({ queryKey: historyKey, refetchType: "active" });
      return groshlySnapshot({ ...nextFinance, transactions: nextHistory, obligations: queryClient.getQueryData<NonNullable<typeof obligations.data>>(obligationsKey) ?? obligations.data });
    }
    return refreshSnapshot();
  };
  const deleteLedgerEntry = async ({
    id,
    type,
  }: {
    id: string;
    type: string;
  }) => {
    if (type === "transfer") {
      await consumerFinanceLedgerApi.deleteTransfer(botId, id);
      return refreshSnapshot();
    }
    await consumerFinanceLedgerApi.deleteTransaction(botId, id);
    await Promise.all([
      queryClient.cancelQueries({ queryKey: groshlyReadKey }),
      queryClient.cancelQueries({ queryKey: historyKey }),
    ]);
    const currentFinance = queryClient.getQueryData<ConsumerFinanceStartup>(groshlyReadKey);
    const currentHistory = queryClient.getQueryData<ConsumerFinanceHistoryPage>(historyKey);
    const removed = currentHistory?.items.find((item) => item.id === id);
    if (!currentHistory || !removed || !currentFinance?.authenticated) return refreshSnapshot();
    const nextHistory = { ...currentHistory, items: currentHistory.items.filter((item) => item.id !== id) };
    const delta = (removed.type === "INCOME" ? -1 : 1) * Number(removed.amount);
    const nextFinance = {
      ...currentFinance,
      accounts: currentFinance.accounts.map((account) => account.id === removed.accountId
        ? { ...account, balance: (Math.round((Number(account.balance) + delta) * 100) / 100).toFixed(2) }
        : account),
    };
    queryClient.setQueryData(groshlyReadKey, nextFinance);
    queryClient.setQueryData(historyKey, nextHistory);
    return groshlySnapshot({ ...nextFinance, transactions: nextHistory, obligations: queryClient.getQueryData<NonNullable<typeof obligations.data>>(obligationsKey) ?? obligations.data });
  };
  const saveRegularPayment = async ({
    id,
    values,
  }: {
    id?: string;
    values: Record<string, any>;
  }) => {
    const input: ConsumerFinanceRegularPaymentInput = {
      name: values.title.trim(),
      emoji: values.emoji,
      amount: String(values.amount),
      accountId: values.accountId,
      categoryId: values.categoryId || null,
      recurrence: String(
        values.interval || "monthly",
      ).toUpperCase() as ConsumerFinanceRegularPaymentInput["recurrence"],
      intervalCount: Math.max(1, Number(values.intervalCount) || 1),
      nextPaymentDate: values.next,
      note: values.notes || null,
      necessity:
        values.necessity === "essential"
          ? "REQUIRED"
          : values.necessity === "desired"
            ? "DISCRETIONARY"
            : "UNSPECIFIED",
    };
    if (id)
      await consumerFinanceObligationsApi.updateRegularPayment(
        botId,
        id,
        input,
      );
    else await consumerFinanceObligationsApi.createRegularPayment(botId, input);
    return refreshSnapshot();
  };
  const changeRegularPayment = async ({
    id,
    action,
  }: {
    id: string;
    action: "pause" | "resume" | "cancel";
  }) => {
    if (action === "pause")
      await consumerFinanceObligationsApi.pauseRegularPayment(botId, id);
    else if (action === "resume")
      await consumerFinanceObligationsApi.resumeRegularPayment(botId, id);
    else await consumerFinanceObligationsApi.cancelRegularPayment(botId, id);
    return refreshSnapshot();
  };
  const saveDebt = async ({
    id,
    values,
  }: {
    id?: string;
    values: Record<string, unknown>;
  }) => {
    const input = groshlyDebtInput(values);
    if (id) await consumerFinanceObligationsApi.updateDebt(botId, id, input);
    else await consumerFinanceObligationsApi.createDebt(botId, input);
    return refreshSnapshot();
  };
  const deleteDebt = async (id: string) => {
    await consumerFinanceObligationsApi.deleteDebt(botId, id);
    return refreshSnapshot();
  };
  const settleDebt = async (input: {
    id: string;
    accountId: string;
    amount: string;
    settlementDate: string;
  }) => {
    await consumerFinanceObligationsApi.settleDebt(botId, input.id, {
      accountId: input.accountId,
      amount: input.amount,
      settlementDate: input.settlementDate,
    });
    return refreshSnapshot();
  };
  const saveSettings = async (
    changes: Partial<ConsumerFinanceSettingsInput>,
  ) => {
    if (!financeData.data?.authenticated) {
      throw new Error("Finance data is unavailable");
    }
    const current = financeData.data.profile;
    const profile = await consumerFinanceProfileApi.updateSettings(botId, {
      defaultCurrency: current.defaultCurrency,
      timezone: current.timezone,
      locale: current.localeOverride,
      displayName: current.displayNameOverride,
      ...changes,
    });
    await queryClient.cancelQueries({ queryKey: groshlyReadKey });
    const liveFinance = queryClient.getQueryData<ConsumerFinanceStartup>(groshlyReadKey);
    if (!liveFinance?.authenticated) throw new Error("Finance data is unavailable");
    const nextFinance = { ...liveFinance, profile };
    queryClient.setQueryData(groshlyReadKey, nextFinance);
    return groshlySnapshot({
      ...nextFinance,
      transactions: queryClient.getQueryData<ConsumerFinanceHistoryPage>(historyKey) ?? { items: [], nextCursor: null },
      obligations: queryClient.getQueryData<NonNullable<typeof obligations.data>>(obligationsKey) ?? obligations.data,
    });
  };
  const loadMore = async (
    kind: "transactions" | "analytics" | "debts" | "recurring" | "investments",
  ) => {
    if (!financeData.data?.authenticated) {
      throw new Error("Finance data is unavailable");
    }
    if (kind === "transactions" || kind === "analytics") {
      let cursor = history.data?.nextCursor;
      if (!cursor) return snapshot!;
      const items = [...(history.data?.items ?? [])];
      const maxItems = kind === "analytics" ? 1000 : items.length + 50;
      while (cursor && items.length < maxItems) {
        const page = await consumerFinanceLedgerApi.transactions(botId, {
          cursor,
          limit: kind === "analytics" ? 100 : 50,
        });
        if (!page.items.length) break;
        items.push(...page.items);
        cursor = page.nextCursor;
      }
      const nextHistory = { items, nextCursor: cursor };
      queryClient.setQueryData(historyKey, nextHistory);
      return groshlySnapshot({
        ...financeData.data,
        transactions: nextHistory,
        obligations: obligations.data,
      });
    }
    const current = obligations.data;
    if (!current) throw new Error("Obligations are still loading");
    if (kind === "debts" && current.debts.nextCursor) {
      const page = await consumerFinanceObligationsApi.debts(botId, {
        cursor: current.debts.nextCursor,
        limit: 50,
      });
      const next = {
        ...current,
        debts: {
          items: [...current.debts.items, ...page.items],
          nextCursor: page.nextCursor,
        },
      };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, transactions: history.data ?? { items: [], nextCursor: null }, obligations: next });
    }
    if (kind === "recurring" && current.regularPayments.nextCursor) {
      const page = await consumerFinanceObligationsApi.regularPayments(botId, {
        cursor: current.regularPayments.nextCursor,
        limit: 50,
      });
      const next = {
        ...current,
        regularPayments: {
          items: [...current.regularPayments.items, ...page.items],
          nextCursor: page.nextCursor,
        },
      };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, transactions: history.data ?? { items: [], nextCursor: null }, obligations: next });
    }
    if (kind === "investments" && current.investments.nextCursor) {
      const page = await consumerFinanceInvestmentsApi.list(botId, {
        cursor: current.investments.nextCursor,
        limit: 50,
      });
      const next = {
        ...current,
        investments: {
          items: [...current.investments.items, ...page.items],
          nextCursor: page.nextCursor,
        },
      };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, transactions: history.data ?? { items: [], nextCursor: null }, obligations: next });
    }
    return snapshot!;
  };
  const openInvestment = async (id: string) => {
    const detail = await consumerFinanceInvestmentsApi.get(botId, id);
    return {
      status: detail.status.toLowerCase(),
      closedAt: detail.closedAt?.slice(0, 10) || "",
      description: detail.description || "",
      events: [
        ...detail.cashFlows.items.map((event) => ({
          id: event.id,
          date: event.occurredAt.slice(0, 10),
          type: event.kind === "CONTRIBUTION" ? "deposit" : "return",
          amount: Number(event.amountInInvestmentCurrency),
          accountId: event.accountId,
        })),
        ...detail.valuations.items.map((event) => ({
          id: event.id,
          date: event.valuedAt.slice(0, 10),
          type: "valuation",
          amount: Number(event.value),
          accountId: null,
        })),
      ],
    };
  };

  if (
    !financeData.isFetchedAfterMount ||
    (bootstrap.status === "loading" && !canDrawCachedSnapshot)
  ) {
    return <GroshlyLoadingScreen />;
  }
  if (!financeData.data?.authenticated) {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) return <BrowserLoginRedirect />;
    return (
      <ConsumerFinanceLogin
        botId={botId}
        onAuthenticated={() => {
          void queryClient.invalidateQueries({ queryKey: groshlyReadKey });
        }}
      />
    );
  }
  if (!snapshot) {
    return (
      <main className="app-shell">
        <div className="busy-cover">
          <div className="busy-card">
            <b>Finance data is unavailable.</b>
            <button onClick={() => financeData.refetch()}>Retry</button>
          </div>
        </div>
      </main>
    );
  }
  return (
    <GroshlyRoot
      financeBotId={botId}
      financeIdentityScope={identityScope}
      financeTelegramInitData={bootstrap.status === "ready" ? bootstrap.initData : undefined}
      initialData={snapshot}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      faviconLightUrl={faviconLightUrl}
      telegramAuthenticated={financeData.data.authenticated}
      onRefresh={refreshSnapshot}
      onCloseInvestment={closeInvestment}
      onSaveLedgerEntry={saveLedgerEntry}
      onDeleteLedgerEntry={deleteLedgerEntry}
      onSaveRegularPayment={saveRegularPayment}
      onChangeRegularPayment={changeRegularPayment}
      onSaveDebt={saveDebt}
      onDeleteDebt={deleteDebt}
      onSettleDebt={settleDebt}
      onSaveSettings={saveSettings}
      onArchiveEntity={archiveEntity}
      onLoadMore={loadMore}
      onOpenInvestment={openInvestment}
    />
  );
}
