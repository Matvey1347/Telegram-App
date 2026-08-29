"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { formatDate } from "@/lib/date-format";
import { accountKeys, currencyKeys } from "@/lib/query-keys";
import { financeOverviewQuery } from "@/lib/features/finance/finance-overview-query";
import {
  accountsApi,
  currenciesApi,
  transactionCategoriesApi,
  transactionsApi,
  transfersApi,
  workspaceMembersApi,
  type Account,
  type ResolvedEmoji,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
  type Transfer,
} from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  DateRangeInput,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { useAppToast } from "@/providers/toast-provider";
import { FinanceActionMenu } from "./finance-action-menu";
import { AccountPreview, CurrencyAmount } from "./finance-format";
import {
  AccountModal,
  CategoryModal,
  TransferModal,
  type AccountFormValues,
  type CategoryFormValues,
  type TransferFormValues,
} from "./finance-overview-modals";
import {
  InternalTransactionModal,
  type InternalTransactionValues,
} from "./transaction-modal";
import {
  AccountCardsSkeleton,
  CategoryCardsSkeleton,
  TransactionRowsSkeleton,
  TransferRowsSkeleton,
} from "./finance-overview-skeletons";

type Editor =
  | { kind: "account"; item?: Account }
  | { kind: "transaction"; item?: Transaction }
  | { kind: "category"; item?: TransactionCategory }
  | { kind: "transfer"; item?: Transfer }
  | null;
type Target = Exclude<Editor, null>;
type PageState = { page: number; pageSize: number };
export function InternalFinanceOverview() {
  const qc = useQueryClient();
  const { startOperation } = useAppToast();
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [categoryType, setCategoryType] = useState<TransactionType>("expense");
  const [editor, setEditor] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [accountPage, setAccountPage] = useState<PageState>({
    page: 1,
    pageSize: 10,
  });
  const [transactionPage, setTransactionPage] = useState<PageState>({
    page: 1,
    pageSize: 10,
  });
  const [categoryPage, setCategoryPage] = useState<PageState>({
    page: 1,
    pageSize: 10,
  });
  const [transferPage, setTransferPage] = useState<PageState>({
    page: 1,
    pageSize: 10,
  });
  const dated = useMemo(
    () => financeOverviewQuery(period, transactionPage),
    [period, transactionPage],
  );
  const transferQuery = useMemo(
    () => financeOverviewQuery(period, transferPage),
    [period, transferPage],
  );
  const accounts = useQuery({
    queryKey: [...accountKeys.accounts(), "overview", accountPage],
    queryFn: () => accountsApi.listPage(accountPage),
    placeholderData: keepPreviousData,
  });
  const settings = useQuery({
    queryKey: currencyKeys.settings(),
    queryFn: currenciesApi.getSettings,
  });
  const transactions = useQuery({
    queryKey: [...accountKeys.transactions(), "overview", dated],
    queryFn: () => transactionsApi.listPage(dated),
    placeholderData: keepPreviousData,
  });
  const transfers = useQuery({
    queryKey: ["transfers", "overview", transferQuery],
    queryFn: () => transfersApi.listPage(transferQuery),
    placeholderData: keepPreviousData,
  });
  const expenses = useQuery({
    queryKey: ["transaction-categories-admin", "expense"],
    queryFn: () => transactionCategoriesApi.list("expense"),
  });
  const incomes = useQuery({
    queryKey: ["transaction-categories-admin", "income"],
    queryFn: () => transactionCategoriesApi.list("income"),
  });
  const categories = [...(expenses.data ?? []), ...(incomes.data ?? [])];
  const currentCategories = categoryType === "expense" ? expenses : incomes;
  const pagedCategories =
    currentCategories.data?.slice(
      (categoryPage.page - 1) * categoryPage.pageSize,
      categoryPage.page * categoryPage.pageSize,
    ) ?? [];
  const needsAllAccounts =
    editor?.kind === "transaction" || editor?.kind === "transfer";
  const allAccounts = useQuery({
    queryKey: [...accountKeys.accounts(), "select"],
    queryFn: accountsApi.list,
    enabled: needsAllAccounts,
  });
  const transactionMembers = useQuery({
    queryKey: ["workspace-members", "select"],
    queryFn: () => workspaceMembersApi.select(),
    enabled: editor?.kind === "transaction",
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: accountKeys.accounts() }),
      qc.invalidateQueries({ queryKey: accountKeys.transactions() }),
      qc.invalidateQueries({ queryKey: ["transfers"] }),
      qc.invalidateQueries({ queryKey: ["transaction-categories-admin"] }),
      qc.invalidateQueries({ queryKey: ["transaction-categories"] }),
    ]);
  const save = useMutation<unknown, Error, { target: Target; value: unknown }>({
    mutationFn: ({ target, value }: { target: Target; value: unknown }) => {
      if (target.kind === "account")
        return target.item
          ? accountsApi.update(target.item.id, value as Record<string, unknown>)
          : accountsApi.create({
              ...(value as AccountFormValues),
              isActive: true,
            });
      if (target.kind === "transaction")
        return target.item
          ? transactionsApi.update(
              target.item.id,
              value as InternalTransactionValues,
            )
          : transactionsApi.create(value as InternalTransactionValues);
      if (target.kind === "category")
        return target.item
          ? transactionCategoriesApi.update(
              target.item.id,
              value as CategoryFormValues,
            )
          : transactionCategoriesApi.create(value as CategoryFormValues);
      return target.item
        ? transfersApi.update(target.item.id, value as TransferFormValues)
        : transfersApi.create(value as TransferFormValues);
    },
    onSuccess: async (_, variables) => {
      setEditor(null);
      if (variables.target.kind === "transaction")
        setTransactionPage((value) => ({ ...value, page: 1 }));
      if (variables.target.kind === "transfer")
        setTransferPage((value) => ({ ...value, page: 1 }));
      if (variables.target.kind === "account")
        setAccountPage((value) => ({ ...value, page: 1 }));
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (target: Target) => {
      if (!target.item) return Promise.resolve();
      if (target.kind === "account") return accountsApi.remove(target.item.id);
      if (target.kind === "transaction")
        return transactionsApi.remove(target.item.id);
      if (target.kind === "category")
        return transactionCategoriesApi.remove(target.item.id);
      return transfersApi.remove(target.item.id);
    },
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });

  const submit = async (target: Target, value: unknown) => {
    const operation = startOperation({
      id: `finance-save:${target.kind}:${Date.now()}`,
      title: "Saving",
      message: `Saving ${target.kind}...`,
    });
    try {
      await save.mutateAsync({ target, value });
      operation.succeed({
        title: "Saved",
        message: `${target.kind[0].toUpperCase()}${target.kind.slice(1)} saved successfully`,
      });
    } catch (error) {
      operation.fail({
        title: "Save failed",
        message:
          error instanceof Error
            ? error.message
            : `Failed to save ${target.kind}`,
      });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Finance"
        subtitle="Manage accounts, transactions, categories and transfers in one place"
      />
      <Card className="mb-5">
        <div className="max-w-md">
          <DateRangeInput
            from={period.from}
            to={period.to}
            onChange={(value) => {
              setPeriod(value);
              setTransactionPage((state) => ({ ...state, page: 1 }));
              setTransferPage((state) => ({ ...state, page: 1 }));
            }}
          />
        </div>
      </Card>
      <div className="space-y-6">
        <Section
          title="Accounts"
          hint="Balances in each account currency"
          create={() => setEditor({ kind: "account" })}
          query={accounts}
          skeleton={
            <AccountCardsSkeleton count={accounts.data?.items.length || 4} />
          }
          footer={
            accounts.data ? (
              <FinancePagination
                data={accounts.data.pagination}
                state={accountPage}
                setState={setAccountPage}
                loading={accounts.isFetching}
              />
            ) : null
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {accounts.data?.items.map((a) => (
              <Card key={a.id} className="!p-4">
                <div className="flex items-start justify-between gap-2">
                  <AccountPreview account={a} />
                  <FinanceActionMenu
                    label={a.name}
                    onEdit={() => setEditor({ kind: "account", item: a })}
                    onDelete={() => setDeleting({ kind: "account", item: a })}
                  />
                </div>
                <div className="mt-4 text-xl font-semibold">
                  <CurrencyAmount
                    amount={a.balance ?? a.calculatedBalance}
                    currency={a.currency}
                  />
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {a.transactionStats?.count ?? 0} transactions
                </div>
              </Card>
            ))}
          </div>
          {!accounts.data?.items.length && (
            <EmptyState text="No accounts yet" />
          )}
        </Section>
        <Section
          title="Transactions"
          hint="Browse all transactions page by page"
          create={() => setEditor({ kind: "transaction" })}
          query={transactions}
          skeleton={
            <TransactionRowsSkeleton
              count={
                transactions.data?.items.length || transactionPage.pageSize
              }
            />
          }
          footer={
            transactions.data ? (
              <FinancePagination
                data={transactions.data.pagination}
                state={transactionPage}
                setState={setTransactionPage}
                loading={transactions.isFetching}
              />
            ) : null
          }
        >
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            {transactions.data?.items.map((t) => (
              <div
                key={t.id}
                className="grid gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <IconAvatar
                    icon={transactionAvatar(t)}
                    label={t.description || t.category}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">
                      {t.description || t.categoryRef?.name || "Transaction"}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {t.categoryRef?.name || t.category} · {t.account?.name} ·{" "}
                      {formatDate(t.date)}
                    </div>
                  </div>
                </div>
                <CurrencyAmount
                  amount={t.type === "expense" ? -Number(t.amount) : t.amount}
                  currency={t.currency}
                  className={`font-semibold ${t.type === "income" ? "text-emerald-300" : "text-rose-300"}`}
                />
                <FinanceActionMenu
                  label="transaction"
                  onEdit={() => setEditor({ kind: "transaction", item: t })}
                  onDelete={() => setDeleting({ kind: "transaction", item: t })}
                />
              </div>
            ))}
          </div>
          {!transactions.data?.items.length && (
            <EmptyState text="No transactions" />
          )}
        </Section>
        <Section
          title="Categories"
          hint="Create and edit here"
          create={() => setEditor({ kind: "category" })}
          query={currentCategories}
          skeleton={<CategoryCardsSkeleton count={categoryPage.pageSize} />}
          toolbar={
            <div className="mb-3 flex gap-2">
              {(["expense", "income"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setCategoryType(type);
                    setCategoryPage((state) => ({ ...state, page: 1 }));
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${categoryType === type ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
                >
                  {type === "expense" ? "Expenses" : "Income"}
                </button>
              ))}
            </div>
          }
          footer={
            <FinancePagination
              data={clientPage(
                currentCategories.data?.length ?? 0,
                categoryPage,
              )}
              state={categoryPage}
              setState={setCategoryPage}
              loading={currentCategories.isFetching}
            />
          }
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {pagedCategories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <IconAvatar icon={c.iconPresentation} label={c.name} />
                  <span className="truncate text-sm font-medium text-white">
                    {c.name}
                  </span>
                </div>
                <FinanceActionMenu
                  label={c.name}
                  onEdit={() => setEditor({ kind: "category", item: c })}
                  onDelete={
                    c.isSystem
                      ? undefined
                      : () => setDeleting({ kind: "category", item: c })
                  }
                />
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Transfers"
          hint="Browse all transfers page by page"
          create={() => setEditor({ kind: "transfer" })}
          query={transfers}
          skeleton={
            <TransferRowsSkeleton
              count={transfers.data?.items.length || transferPage.pageSize}
            />
          }
          footer={
            transfers.data ? (
              <FinancePagination
                data={transfers.data.pagination}
                state={transferPage}
                setState={setTransferPage}
                loading={transfers.isFetching}
              />
            ) : null
          }
        >
          <div className="grid gap-2">
            {transfers.data?.items.map((t) => (
              <div
                key={t.id}
                className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_32px] md:items-center"
              >
                <div className="min-w-0">
                  <AccountPreview account={t.fromAccount} />
                  <div className="mt-2 pl-9 text-xs text-neutral-500">
                    Withdrawn{" "}
                    <CurrencyAmount
                      amount={-Number(t.fromAmount)}
                      currency={t.fromCurrency}
                      className="ml-1 font-semibold text-rose-300"
                    />
                  </div>
                </div>
                <ArrowRight
                  size={18}
                  className="hidden text-neutral-600 md:block"
                />
                <div className="min-w-0">
                  <AccountPreview account={t.toAccount} />
                  <div className="mt-2 pl-9 text-xs text-neutral-500">
                    Received{" "}
                    <CurrencyAmount
                      amount={t.toAmount}
                      currency={t.toCurrency}
                      className="ml-1 font-semibold text-emerald-300"
                    />
                  </div>
                </div>
                <FinanceActionMenu
                  label="transfer"
                  onEdit={() => setEditor({ kind: "transfer", item: t })}
                  onDelete={() => setDeleting({ kind: "transfer", item: t })}
                />
              </div>
            ))}
          </div>
        </Section>
      </div>
      <AccountModal
        open={editor?.kind === "account"}
        initial={editor?.kind === "account" ? editor.item : undefined}
        currencies={settings.data?.supportedCurrencies ?? ["USD"]}
        onClose={() => setEditor(null)}
        onSubmit={(value) =>
          editor &&
          void submit(editor, {
            ...value,
            currency: value.currency.toUpperCase(),
            initialBalance: Number(value.initialBalance),
          })
        }
      />
      <InternalTransactionModal
        open={editor?.kind === "transaction"}
        title={
          editor?.kind === "transaction" && editor.item
            ? "Edit transaction"
            : "Create transaction"
        }
        initial={editor?.kind === "transaction" ? editor.item : undefined}
        accounts={allAccounts.data ?? accounts.data?.items ?? []}
        members={transactionMembers.data ?? []}
        onClose={() => setEditor(null)}
        onSubmit={(value) =>
          editor &&
          void submit(editor, { ...value, amount: Number(value.amount) })
        }
      />
      <CategoryModal
        open={editor?.kind === "category"}
        initial={editor?.kind === "category" ? editor.item : undefined}
        initialType={categoryType}
        onClose={() => setEditor(null)}
        onSubmit={(value) => editor && void submit(editor, value)}
      />
      <TransferModal
        open={editor?.kind === "transfer"}
        initial={editor?.kind === "transfer" ? editor.item : undefined}
        accounts={allAccounts.data ?? accounts.data?.items ?? []}
        onClose={() => setEditor(null)}
        onSubmit={(value) => editor && void submit(editor, value)}
      />
      {save.error && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200"
        >
          Failed to save. Check the values and try again.
        </div>
      )}
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={
          deleting?.item && "name" in deleting.item
            ? String(deleting.item.name)
            : deleting?.kind || ""
        }
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
    </AppShell>
  );
}

function Section({
  title,
  hint,
  create,
  query,
  skeleton,
  toolbar,
  footer,
  children,
}: {
  title: string;
  hint: string;
  create: () => void;
  query: { isLoading: boolean; isPlaceholderData: boolean; error: unknown };
  skeleton: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const loading = query.isLoading || query.isPlaceholderData;
  return (
    <section aria-busy={loading}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-neutral-500">{hint}</p>
        </div>
        <Button variant="secondary" onClick={create}>
          <Plus size={16} /> Create
        </Button>
      </div>
      {toolbar}
      {query.error ? (
        <ErrorState text={`Failed to load ${title.toLowerCase()}`} />
      ) : loading ? (
        skeleton
      ) : (
        children
      )}
      {footer}
    </section>
  );
}

type PageMeta = {
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

function clientPage(totalItems: number, state: PageState): PageMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
  return {
    totalItems,
    totalPages,
    hasNextPage: state.page < totalPages,
    hasPreviousPage: state.page > 1,
  };
}

function FinancePagination({
  data,
  state,
  setState,
  loading,
}: {
  data: PageMeta;
  state: PageState;
  setState: (update: (value: PageState) => PageState) => void;
  loading: boolean;
}) {
  return (
    <Pagination
      page={state.page}
      pageSize={state.pageSize}
      totalItems={data.totalItems}
      totalPages={data.totalPages}
      hasNextPage={data.hasNextPage}
      hasPreviousPage={data.hasPreviousPage}
      loading={loading}
      onPageChange={(page) => setState((value) => ({ ...value, page }))}
      onPageSizeChange={(pageSize) => setState(() => ({ page: 1, pageSize }))}
    />
  );
}

function transactionAvatar(
  transaction: Transaction,
): ResolvedEmoji | null | undefined {
  if (transaction.iconPresentation) return transaction.iconPresentation;
  if (transaction.categoryRef?.iconPresentation)
    return transaction.categoryRef.iconPresentation;
  if (transaction.member?.avatarPresentation)
    return transaction.member.avatarPresentation;
  const channel =
    transaction.telegramChannel ?? transaction.purchasedTelegramChannel;
  if (channel?.photoUrl)
    return {
      type: "image",
      id: channel.id,
      url: channel.photoUrl,
      name: channel.title,
    };
  return transaction.account?.iconPresentation;
}
