"use client";
import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionInput,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  DateRangeInput,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { TransactionRow } from "./finance-dashboard";

export function FinanceTransactions({
  botId,
  accounts,
  categories,
  openTransfer = false,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  openTransfer?: boolean;
}) {
  const client = useQueryClient();
  const { pushToast } = useAppToast();
  const [filters, setFilters] = useState<ConsumerFinanceHistoryQuery>({
    limit: 30,
  });
  const [editing, setEditing] = useState<ConsumerFinanceTransaction | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ConsumerFinanceTransaction | null>(
    null,
  );
  const [undoable, setUndoable] = useState<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: consumerFinanceKeys.transactions(botId, {
      ...filters,
      cursor: undefined,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceApi.transactions(botId, {
        ...filters,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? [];
  const invalidateDashboard = () =>
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.dashboard(botId),
    });
  const remove = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceApi.deleteTransaction(botId, id),
    onSuccess: (_, id) => {
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.transactionLists(botId),
      });
      setUndoable(id);
      invalidateDashboard();
      pushToast("Transaction deleted. Undo is available below.", "info");
    },
    onError: () =>
      pushToast("Could not delete transaction. Try again.", "error"),
  });
  const undo = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceApi.undoTransaction(botId, id),
    onSuccess: () => {
      setUndoable(null);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.transactionLists(botId),
      });
      invalidateDashboard();
      pushToast("Transaction restored.", "success");
    },
    onError: () =>
      pushToast("This transaction can no longer be restored.", "error"),
  });
  return (
    <div className="space-y-4">
      <TransactionEditor
        botId={botId}
        accounts={accounts}
        categories={categories}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          invalidateDashboard();
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.transactionLists(botId),
          });
        }}
      />
      <TransferEditor
        botId={botId}
        accounts={accounts}
        initiallyOpen={openTransfer}
        onSaved={() => {
          invalidateDashboard();
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.accounts(botId),
          });
        }}
      />
      <TransactionFilters
        filters={filters}
        accounts={accounts}
        categories={categories}
        onChange={setFilters}
      />
      <Card>
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <div className="space-y-3">
            <ErrorState text="Could not load transactions." />
            <Button onClick={() => history.refetch()}>Retry</Button>
          </div>
        ) : historyItems.length ? (
          historyItems.map((item) => (
            <div key={item.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <TransactionRow item={item} />
              </div>
              <button
                aria-label="Edit transaction"
                onClick={() => setEditing(item)}
                className="p-2 text-neutral-400"
              >
                <Pencil size={16} />
              </button>
              <button
                aria-label="Delete transaction"
                onClick={() => setDeleting(item)}
                className="p-2 text-rose-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <EmptyState text="No matching transactions." />
        )}
      </Card>
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
      {undoable && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={undo.isPending}
          onClick={() => undo.mutate(undoable)}
        >
          <RotateCcw size={16} /> Undo deleted transaction
        </Button>
      )}
      <ConfirmDeleteModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : Promise.resolve()
        }
        entityName={deleting?.description || "transaction"}
        description="This will update its account balance."
      />
    </div>
  );
}
function TransferEditor({
  botId,
  accounts,
  onSaved,
  initiallyOpen = false,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  onSaved: () => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fromAccountId, setFrom] = useState("");
  const [toAccountId, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (initiallyOpen && accounts.filter((account) => !account.archivedAt).length >= 2) {
      setFrom((current) => current || accounts[0]?.id || "");
      setOpen(true);
    }
  }, [accounts, initiallyOpen]);
  const from =
    accounts.find((account) => account.id === fromAccountId) ?? accounts[0];
  const to = accounts.find((account) => account.id === toAccountId);
  const mutation = useMutation({
    mutationFn: () =>
      consumerFinanceApi.createTransfer(botId, {
        fromAccountId: fromAccountId || from?.id || "",
        toAccountId,
        fromAmount: amount,
        toAmount: received || amount,
        description: description || undefined,
        occurredAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setOpen(false);
      onSaved();
    },
  });
  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setFrom(fromAccountId || accounts[0]?.id || "");
          setOpen(true);
        }}
      >
        Transfer
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Transfer between accounts"
      >
        <div className="space-y-3">
          <FormField label="From account">
            <Select
              value={fromAccountId || from?.id || ""}
              onChange={(event) => setFrom(event.target.value)}
            >
              {accounts
                .filter((account) => !account.archivedAt)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="To account">
            <Select
              value={toAccountId}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">Select account</option>
              {accounts
                .filter(
                  (account) =>
                    !account.archivedAt &&
                    account.id !== (fromAccountId || from?.id),
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label={`Sent amount (${from?.currency ?? ""})`}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
          {to && to.currency !== from?.currency ? (
            <FormField label={`Received amount (${to.currency})`}>
              <Input
                inputMode="decimal"
                value={received}
                onChange={(event) => setReceived(event.target.value)}
              />
            </FormField>
          ) : null}
          <FormField label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <Button
            className="w-full"
            disabled={
              !from ||
              !to ||
              from.id === to.id ||
              !amount ||
              (to.currency !== from.currency && !received) ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            Save transfer
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-rose-300">
              Could not save this transfer.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
function TransactionFilters({
  filters,
  accounts,
  categories,
  onChange,
}: {
  filters: ConsumerFinanceHistoryQuery;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  onChange: (next: ConsumerFinanceHistoryQuery) => void;
}) {
  const update = (changes: Partial<ConsumerFinanceHistoryQuery>) =>
    onChange({ ...filters, ...changes, cursor: undefined });
  return (
    <Card>
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Type"
          value={filters.type ?? ""}
          onChange={(e) =>
            update({
              type: (e.target.value ||
                undefined) as ConsumerFinanceHistoryQuery["type"],
            })
          }
        >
          <option value="">All types</option>
          <option value="EXPENSE">Expenses</option>
          <option value="INCOME">Income</option>
        </Select>
        <Select
          aria-label="Account"
          value={filters.accountId ?? ""}
          onChange={(e) => update({ accountId: e.target.value || undefined })}
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Category"
          value={filters.categoryId ?? ""}
          onChange={(e) => update({ categoryId: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <DateRangeInput
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) =>
            update({ from: from || undefined, to: to || undefined })
          }
        />
        <Button variant="secondary" onClick={() => onChange({ limit: 30 })}>
          Clear filters
        </Button>
      </div>
    </Card>
  );
}
function TransactionEditor({
  botId,
  accounts,
  categories,
  editing,
  onClose,
  onSaved,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  editing: ConsumerFinanceTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] =
    useState<ConsumerFinanceTransactionInput["type"]>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setAmount(editing.amount);
      setAccountId(editing.accountId);
      setCategoryId(editing.categoryId ?? "");
      setDescription(editing.description ?? "");
    }
  }, [editing]);
  const account =
    accounts.find((value) => value.id === accountId) ?? accounts[0];
  const mutation = useMutation({
    mutationFn: () => {
      const payload: ConsumerFinanceTransactionInput = {
        accountId: accountId || account?.id || "",
        categoryId: categoryId || undefined,
        type,
        amount,
        description: description || undefined,
        occurredAt: editing?.occurredAt ?? new Date().toISOString(),
      };
      return editing
        ? consumerFinanceApi.updateTransaction(
            botId,
            editing.id,
            payload,
          )
        : consumerFinanceApi.createTransaction(botId, payload);
    },
    onSuccess: onSaved,
  });
  const visible = open || !!editing;
  return (
    <>
      <Button
        className="w-full"
        onClick={() => {
          setAccountId(accountId || accounts[0]?.id || "");
          setOpen(true);
        }}
      >
        <Plus size={16} /> Add transaction
      </Button>
      <Modal
        open={visible}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title={editing ? "Edit transaction" : "Add transaction"}
      >
        <div className="space-y-3">
          <FormField label="Type">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </Select>
          </FormField>
          <FormField label="Amount">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Account">
            <Select
              value={accountId || account?.id || ""}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts
                .filter((value) => !value.archivedAt)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name} · {value.currency}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Category">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories
                .filter((value) => value.type === type && !value.archivedAt)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <Button
            className="w-full"
            disabled={
              !amount ||
              !account ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save transaction"}
          </Button>
          {mutation.isError && (
            <p className="text-sm text-rose-300">
              Could not save. Check the fields and try again.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
