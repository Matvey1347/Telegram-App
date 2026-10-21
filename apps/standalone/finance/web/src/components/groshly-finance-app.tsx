"use client";

import { useEffect, useMemo, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GroshlyApp } from "@finance-web/groshly/main";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";
import { useTelegramMiniAppBootstrap } from "@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap";
import { consumerFinanceInsightsApi } from "@consumer-finance/web/lib/api/consumer-finance-insights-api";
import { consumerFinanceInvestmentsApi } from "@consumer-finance/web/lib/api/consumer-finance-investments-api";
import { consumerFinanceLedgerApi } from "@consumer-finance/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceObligationsApi } from "@consumer-finance/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";

type GroshlySnapshot = Record<string, unknown>;
const GroshlyRoot = GroshlyApp as ComponentType<{
  initialData: GroshlySnapshot;
  onRefresh: () => Promise<GroshlySnapshot>;
  onCloseInvestment: (input: {
    id: string;
    closedAt: string;
    accountId?: string;
    finalReturn: number;
    note: string;
    idempotencyKey: string;
  }) => Promise<GroshlySnapshot>;
  onLoadMore: (
    kind: "transactions" | "debts" | "recurring" | "investments",
  ) => Promise<GroshlySnapshot>;
  onOpenInvestment: (id: string) => Promise<{
    status: string;
    closedAt: string;
    description: string;
    events: Array<{ id: string; date: string; type: string; amount: number; accountId?: string | null }>;
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
    const user = JSON.parse(new URLSearchParams(initData).get("user") ?? "null") as {
      id?: unknown;
    } | null;
    return typeof user?.id === "number" || typeof user?.id === "string"
      ? `telegram-user:${user.id}`
      : "unverified";
  } catch {
    return "unverified";
  }
}

export function groshlySnapshot({
  profile,
  dashboard,
  accounts,
  categories,
  transactions,
  obligations,
}: {
  profile: { defaultCurrency: string; locale: "uk" | "ru" | "en"; telegramUser: { displayName: string; username: string | null; avatarUrl: string | null }; displayNameOverride?: string | null; avatarUrl?: string | null };
  dashboard: unknown;
  accounts: Array<{ id: string; name: string; iconPresentation: unknown; type: keyof typeof defaultEmojiByAccountType; currency: string; balance: string }>;
  categories: Array<{ id: string; name: string; type: "INCOME" | "EXPENSE"; iconPresentation: unknown; necessity?: "UNSPECIFIED" | "REQUIRED" | "DISCRETIONARY" }>;
  transactions: { items: Array<{ id: string; accountId: string; categoryId?: string | null; type: "INCOME" | "EXPENSE"; amount: string; currency: string; occurredAt: string; description?: string | null; necessity?: "UNSPECIFIED" | "REQUIRED" | "DISCRETIONARY"; category?: { iconPresentation: unknown } | null }>; nextCursor?: string | null };
  obligations?: {
    debts: Awaited<ReturnType<typeof consumerFinanceObligationsApi.debts>>;
    regularPayments: Awaited<ReturnType<typeof consumerFinanceObligationsApi.regularPayments>>;
    investments: Awaited<ReturnType<typeof consumerFinanceInvestmentsApi.list>>;
  };
}): GroshlySnapshot {
  return {
    version: 20,
    onboarded: true,
    lang: profile.locale === "ru" ? "uk" : profile.locale,
    currency: profile.defaultCurrency,
    theme: "light",
    rates: { UAH: 1, PLN: 10.7, USD: 41.8, EUR: 48.2 },
    rateSource: "api",
    profile: {
      name: profile.displayNameOverride || profile.telegramUser.displayName,
      handle: profile.telegramUser.username ? `@${profile.telegramUser.username}` : "",
      photo: profile.avatarUrl || profile.telegramUser.avatarUrl || "",
      notifications: true,
    },
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      emoji: emoji(account.iconPresentation, defaultEmojiByAccountType[account.type]),
      balance: Number(account.balance),
      currency: account.currency,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      nameEn: category.name,
      emoji: emoji(category.iconPresentation, "✨"),
      type: category.type.toLowerCase(),
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
      amount: Number(transaction.amount),
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
        currency: debt.currency,
        due: debt.dueAt.slice(0, 10),
        emoji: "🤝",
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
    () => [...consumerFinanceKeys.root(botId), "groshly-read-model", identityScope] as const,
    [botId, identityScope],
  );
  const obligationsKey = useMemo(
    () => [...consumerFinanceKeys.root(botId), "groshly-obligations", identityScope] as const,
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
  useEffect(() => {
    if (!financeData.data?.authenticated) return;
    const reconcileAfterExternalChange = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: groshlyReadKey, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: obligationsKey, refetchType: "active" }),
      ]);
    };
    document.addEventListener("visibilitychange", reconcileAfterExternalChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        reconcileAfterExternalChange,
      );
  }, [financeData.data?.authenticated, groshlyReadKey, obligationsKey, queryClient]);
  const snapshot = useMemo(() => {
    if (!financeData.data?.authenticated) return null;
    return groshlySnapshot({
      ...financeData.data,
      obligations: obligations.data,
    });
  }, [financeData.data, obligations.data]);
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
    const result = await financeData.refetch({ throwOnError: true });
    const obligationResult = await obligations.refetch({ throwOnError: true });
    if (!result.data?.authenticated) {
      throw new Error("Finance data is unavailable");
    }
    return groshlySnapshot({
      ...result.data,
      obligations: obligationResult.data,
    });
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
    return groshlySnapshot({ ...financeData.data, obligations: nextObligations });
  };
  const loadMore = async (
    kind: "transactions" | "debts" | "recurring" | "investments",
  ) => {
    if (!financeData.data?.authenticated || !obligations.data) {
      throw new Error("Finance data is unavailable");
    }
    if (kind === "transactions") {
      const cursor = financeData.data.transactions.nextCursor;
      if (!cursor) return snapshot!;
      const page = await consumerFinanceLedgerApi.transactions(botId, {
        cursor,
        limit: 50,
      });
      const nextFinance = {
        ...financeData.data,
        transactions: {
          items: [...financeData.data.transactions.items, ...page.items],
          nextCursor: page.nextCursor,
        },
      };
      queryClient.setQueryData(groshlyReadKey, nextFinance);
      return groshlySnapshot({ ...nextFinance, obligations: obligations.data });
    }
    const current = obligations.data;
    if (kind === "debts" && current.debts.nextCursor) {
      const page = await consumerFinanceObligationsApi.debts(botId, {
        cursor: current.debts.nextCursor,
        limit: 50,
      });
      const next = { ...current, debts: { items: [...current.debts.items, ...page.items], nextCursor: page.nextCursor } };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, obligations: next });
    }
    if (kind === "recurring" && current.regularPayments.nextCursor) {
      const page = await consumerFinanceObligationsApi.regularPayments(botId, {
        cursor: current.regularPayments.nextCursor,
        limit: 50,
      });
      const next = { ...current, regularPayments: { items: [...current.regularPayments.items, ...page.items], nextCursor: page.nextCursor } };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, obligations: next });
    }
    if (kind === "investments" && current.investments.nextCursor) {
      const page = await consumerFinanceInvestmentsApi.list(botId, {
        cursor: current.investments.nextCursor,
        limit: 50,
      });
      const next = { ...current, investments: { items: [...current.investments.items, ...page.items], nextCursor: page.nextCursor } };
      queryClient.setQueryData(obligationsKey, next);
      return groshlySnapshot({ ...financeData.data, obligations: next });
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
    (financeData.data?.authenticated && obligations.isLoading) ||
    (bootstrap.status === "loading" && !canDrawCachedSnapshot)
  ) {
    return <GroshlyLoadingScreen />;
  }
  if (!financeData.data?.authenticated) {
    return <main className="auth-screen"><div className="auth-panel"><span className="auth-panel-kicker">GROSHLY</span><h2>Sign in with Telegram</h2><p>Open Finance from the Telegram bot to securely authenticate your account.</p></div></main>;
  }
  if (obligations.isError) {
    return <main className="app-shell"><div className="busy-cover"><div className="busy-card"><b>Could not load debts, recurring payments, or investments.</b><button onClick={() => obligations.refetch()}>Retry</button></div></div></main>;
  }
  if (!snapshot) {
    return <main className="app-shell"><div className="busy-cover"><div className="busy-card"><b>Finance data is unavailable.</b><button onClick={() => financeData.refetch()}>Retry</button></div></div></main>;
  }
  return <GroshlyRoot initialData={snapshot} onRefresh={refreshSnapshot} onCloseInvestment={closeInvestment} onLoadMore={loadMore} onOpenInvestment={openInvestment} />;
}
