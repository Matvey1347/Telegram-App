'use client';
import { formatDate } from '@/lib/date-format';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { accountDisplayName } from '@/lib/features/finance/account-display';
import { Transaction, TransactionQuery, accountsApi, currenciesApi, transactionCategoriesApi, transactionsApi, workspaceMembersApi } from '@/lib/api';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, DateRangeInput, EmptyState, ErrorState, FormField, Input, PageHeader, Select, TableLoadingState } from '@/components/ui/primitives';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { useAppToast } from '@/providers/toast-provider';
import { useDeleteTransactionMutation } from '@/lib/features/finance/use-delete-transaction-mutation';
import { accountKeys } from '@/lib/query-keys';
import { FinanceActionMenu } from '@/components/features/finance/internal/finance-action-menu';
import { InternalTransactionModal } from '@/components/features/finance/internal/transaction-modal';

function iconOptionProps(item: { name: string; iconPresentation?: { type: 'image'; url: string } | { type: 'unicode'; value: string } | null }) {
  return {
    'data-icon-url': item.iconPresentation?.type === 'image' ? item.iconPresentation.url : undefined,
    'data-icon-emoji': item.iconPresentation?.type === 'unicode' ? item.iconPresentation.value : undefined,
    'data-icon-fallback': item.name,
  };
}

export default function TransactionsPage() {
  const qc = useQueryClient();
  const { startOperation } = useAppToast();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState({ type: 'all', sort: 'date_desc', dateFrom: '', dateTo: '', categoryId: '', accountId: '', search: '' });
  const { data: accounts } = useQuery({ queryKey: accountKeys.accounts(), queryFn: accountsApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates-latest'], queryFn: currenciesApi.listLatestRates });
  const { data, isLoading, error } = useQuery({
    queryKey: [...accountKeys.transactions(), filters],
    queryFn: () => transactionsApi.list(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as TransactionQuery),
  });
  const { data: members } = useQuery({ queryKey: ['workspace-members', 'select'], queryFn: () => workspaceMembersApi.select() });
  const { data: filterCategories } = useQuery({ queryKey: ['transaction-categories', filters.type], queryFn: () => transactionCategoriesApi.list(filters.type === 'income' ? 'income' : 'expense'), enabled: filters.type === 'income' || filters.type === 'expense' });
  const createMutation = useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.transactions() });
      qc.invalidateQueries({ queryKey: accountKeys.accounts() });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => transactionsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.transactions() });
      qc.invalidateQueries({ queryKey: accountKeys.accounts() });
    },
  });
  const updateTransactionIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionsApi.update(id, { iconId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }) });
  const updateAccountIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); } });
  const updateCategoryIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionCategoriesApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transaction-categories'] }); qc.invalidateQueries({ queryKey: ['transaction-categories-admin'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); } });
  const deleteMutation = useDeleteTransactionMutation();

  useEffect(() => {
    const nextSearch = searchParams.get('search') || '';
    setFilters((prev) => prev.search === nextSearch ? prev : { ...prev, search: nextSearch });
  }, [searchParams]);

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'type' ? { categoryId: '' } : {}) }));
  return <AppShell><PageHeader title="Transactions" subtitle="Track income and expenses" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    <Card className="mb-4">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <FormField label="Period"><DateRangeInput from={filters.dateFrom} to={filters.dateTo} onChange={(range) => setFilters((prev) => ({ ...prev, dateFrom: range.from, dateTo: range.to }))} /></FormField>
        <FormField label="Type"><Select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></Select></FormField>
        <FormField label="Category"><Select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} disabled={filters.type === 'all'}><option value="">All</option>{filterCategories?.map((c) => <option key={c.id} value={c.id} {...iconOptionProps(c)}>{c.name}</option>)}</Select></FormField>
        <FormField label="Account"><Select value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}><option value="">All</option>{accounts?.map((a) => <option key={a.id} value={a.id} {...iconOptionProps(a)}>{accountDisplayName(a)}</option>)}</Select></FormField>
        <FormField label="Sort"><Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="date_desc">Newest</option><option value="date_asc">Oldest</option></Select></FormField>
        <FormField label="Search"><Input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Description" /></FormField>
      </div>
    </Card>
    {error ? <ErrorState text="Failed to load transactions" /> : null}
    {isLoading ? <TableLoadingState text="Loading transactions" columns={5} rows={6} /> : null}
    {!isLoading && !error ? (
      <div className="table-scroll w-full rounded-lg border border-neutral-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data?.map((t) => (
              <tr key={t.id} className="bg-neutral-950">
                <td className="px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <InlineIconPicker
                        iconId={t.iconId ?? null}
                        icon={t.iconPresentation}
                        onChange={(iconId) => updateTransactionIconMutation.mutate({ id: t.id, iconId })}
                        className="shrink-0"
                      />
                      <div className="truncate font-medium text-white">{getTransactionTitle(t)}</div>
                    </div>
                    <div className={`mt-1 text-xs ${t.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {t.type} • {formatDate(t.date)}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <MoneyStack amount={t.amount} currency={t.currency} settings={settings} rates={rates} amountInPrimary={t.amountInPrimaryCurrency} mainClassName={`font-semibold ${t.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`} subClassName="text-xs text-neutral-400" />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <InlineIconPicker
                      iconId={t.categoryRef?.iconId ?? null}
                      icon={t.categoryRef?.iconPresentation}
                      onChange={(iconId) => t.categoryRef?.id && updateCategoryIconMutation.mutate({ id: t.categoryRef.id, iconId })}
                      className="shrink-0"
                    />
                    <span>{t.categoryRef?.name ?? t.category}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <InlineIconPicker
                      iconId={t.account?.iconId ?? null}
                      icon={t.account?.iconPresentation}
                      onChange={(iconId) => t.account?.id && updateAccountIconMutation.mutate({ id: t.account.id, iconId })}
                      className="shrink-0"
                    />
                    <span>{accountDisplayName(t.account)}</span>
                  </div>
                </td>
                <td className="px-3 py-2"><FinanceActionMenu label={getTransactionTitle(t)} onEdit={() => setEditing(t)} onDelete={() => setDeleting(t)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
    {!isLoading && !error && !data?.length ? <EmptyState text="No transactions" /> : null}
    <InternalTransactionModal
      open={createOpen}
      title="Create Transaction"
      onClose={() => setCreateOpen(false)}
      members={members ?? []}
      accounts={accounts ?? []}
      onSubmit={async (v) => {
        setCreateOpen(false);
        const payload = { ...v, amount: Number(v.amount), memberId: v.memberId || undefined };
        const operation = startOperation({
          id: `transaction-create:${Date.now()}`,
          title: 'Processing',
          message: 'Creating transaction...',
        });
        try {
          await createMutation.mutateAsync(payload);
          operation.succeed({
            title: 'Success',
            message: `Transaction created: ${payload.description?.trim() || 'Transaction'}`,
          });
        } catch (error: unknown) {
          operation.fail({
            title: 'Error',
            message: error instanceof Error ? error.message : 'Failed to create transaction',
          });
        }
      }}
    />
    <InternalTransactionModal
      open={!!editing}
      title="Edit Transaction"
      onClose={() => setEditing(null)}
      members={members ?? []}
      accounts={accounts ?? []}
      initial={editing ?? undefined}
      onSubmit={async (v) => {
        if (!editing) return;
        const transactionId = editing.id;
        const payload = { ...v, amount: Number(v.amount), memberId: v.memberId || undefined };
        setEditing(null);
        const operation = startOperation({
          id: `transaction-update:${transactionId}:${Date.now()}`,
          title: 'Processing',
          message: 'Saving transaction...',
        });
        try {
          await updateMutation.mutateAsync({ id: transactionId, payload });
          operation.succeed({
            title: 'Success',
            message: `Transaction updated: ${payload.description?.trim() || 'Transaction'}`,
          });
        } catch (error: unknown) {
          operation.fail({
            title: 'Error',
            message: error instanceof Error ? error.message : 'Failed to save transaction',
          });
        }
      }}
    />
    <ConfirmDeleteModal
      open={!!deleting}
      entityName={deleting ? `${deleting.type} ${Number(deleting.amount).toFixed(2)}` : ''}
      onClose={() => setDeleting(null)}
      onConfirm={async () => {
        if (!deleting) return;
        const transactionId = deleting.id;
        const name = getTransactionTitle(deleting);
        setDeleting(null);
        const operation = startOperation({
          id: `transaction-delete:${transactionId}:${Date.now()}`,
          title: 'Processing',
          message: 'Deleting transaction...',
        });
        try {
          await deleteMutation.mutateAsync(transactionId);
          operation.succeed({
            title: 'Success',
            message: `Transaction deleted: ${name}`,
          });
        } catch (error: unknown) {
          operation.fail({
            title: 'Error',
            message: error instanceof Error ? error.message : 'Failed to delete transaction',
          });
        }
      }}
    />
  </AppShell>;
}

function getTransactionTitle(transaction: Transaction) {
  return transaction.description?.trim()
    || transaction.adCampaign?.title?.trim()
    || transaction.investment?.notes?.trim()
    || transaction.telegramChannel?.title?.trim()
    || transaction.purchasedTelegramChannel?.title?.trim()
    || transaction.member?.user?.name?.trim()
    || transaction.categoryRef?.name
    || transaction.category
    || 'Transaction';
}
