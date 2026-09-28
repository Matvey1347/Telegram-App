"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Landmark, TrendingUp } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { FinanceTransactionRow } from "@/components/features/finance/internal/finance-overview-list-rows";
import { CurrencyAmount } from "@/components/features/finance/internal/finance-format";
import { accountsApi, memberFinanceApi, workspaceMembersApi } from "@/lib/api";
import type { MemberFinanceSummary } from "@/lib/api-types";
import { formatDate } from "@/lib/date-format";
import { formatMoney } from "@/lib/features/finance/money";
import {
  Button,
  CustomSelect,
  EmptyState,
  FormField,
  Input,
  Modal,
  Skeleton,
} from "@/components/ui/primitives";
import {
  accountKeys,
  dashboardKeys,
  memberFinanceKeys,
  workspaceKeys,
} from "@/lib/query-keys";

type SalaryAction = "pay" | "invest";
type InvestmentLedgerTab = "investments" | "reinvestments";

export function WorkspaceMemberFinance({
  member,
  summary,
  canManage,
}: {
  member: { id: string; user: { name: string } };
  summary?: MemberFinanceSummary;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ledgerTab, setLedgerTab] =
    useState<InvestmentLedgerTab>("investments");
  const [salaryAction, setSalaryAction] = useState<SalaryAction | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const investments = useQuery({
    queryKey: memberFinanceKeys.investmentTransactions(member.id),
    queryFn: () => workspaceMembersApi.investments(member.id),
    enabled: open,
  });
  const reinvestments = useQuery({
    queryKey: memberFinanceKeys.detail(member.id),
    queryFn: () => memberFinanceApi.details(member.id),
    enabled: open && ledgerTab === "reinvestments",
  });
  const accounts = useQuery({
    queryKey: accountKeys.accounts(),
    queryFn: accountsApi.list,
    enabled: salaryAction === "pay" && canManage,
  });
  const mutation = useMutation({
    mutationFn: () => {
      const value = Number(amount);
      return salaryAction === "pay"
        ? memberFinanceApi.pay(member.id, { amount: value, accountId })
        : memberFinanceApi.investSalary(member.id, { amount: value });
    },
    onSuccess: async () => {
      setAmount("");
      setAccountId("");
      setSalaryAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: memberFinanceKeys.summaries() }),
        queryClient.invalidateQueries({ queryKey: memberFinanceKeys.detail(member.id) }),
        queryClient.invalidateQueries({
          queryKey: memberFinanceKeys.investmentTransactions(member.id),
        }),
        queryClient.invalidateQueries({ queryKey: workspaceKeys.members() }),
        queryClient.invalidateQueries({ queryKey: accountKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() }),
      ]);
    },
  });

  if (!summary) return null;

  const currency = summary.primaryCurrency;
  const total = summary.investments.total;
  const principal = Math.max(0, summary.investments.principal);
  const reinvested = summary.investments.investorEarnings;
  const maximum = summary.commissionPayable;
  const enteredAmount = Number(amount);
  const hasPayableCommission = maximum > 0;
  const hasFinanceData = total > 0 || hasPayableCommission;

  if (!hasFinanceData) return null;

  const closeSalaryAction = () => {
    setSalaryAction(null);
    setAmount("");
    setAccountId("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-left transition hover:border-emerald-500/30"
      >
        {hasPayableCommission ? (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-neutral-400">
              <Banknote size={14} className="text-emerald-300" /> Commission
              payable
            </span>
            <strong className="tabular-nums text-emerald-300">
              {formatMoney(maximum, currency)}
            </strong>
          </div>
        ) : null}
        {total > 0 ? (
          <div
            className={`${hasPayableCommission ? "mt-3" : ""} grid grid-cols-2 gap-2 text-[11px] text-neutral-500`}
          >
            <span>Invested {formatMoney(principal, currency)}</span>
            <span className="text-right">
              Reinvested {formatMoney(reinvested, currency)}
            </span>
          </div>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.user.name} · investments`}
        titleIcon={<Landmark size={18} />}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Earned"
            value={summary.commissionEarned}
            currency={currency}
          />
          {hasPayableCommission ? (
            <Metric label="To pay" value={maximum} currency={currency} />
          ) : null}
          <Metric label="Invested" value={principal} currency={currency} />
          <Metric label="Reinvested" value={reinvested} currency={currency} />
        </div>

        {canManage && hasPayableCommission ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
                setSalaryAction("pay");
              }}
            >
              <Banknote size={15} /> Pay salary
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setSalaryAction("invest");
              }}
            >
              <TrendingUp size={15} /> Invest salary
            </Button>
          </div>
        ) : null}

        <section className="mt-5" aria-labelledby={`member-investments-${member.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4
              id={`member-investments-${member.id}`}
              className="font-medium text-white"
            >
              {ledgerTab === "investments"
                ? "Investment transactions"
                : "Reinvestment sources"}
            </h4>
            <div
              role="tablist"
              aria-label="Investment history"
              className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-1 text-xs"
            >
              <LedgerTab
                active={ledgerTab === "investments"}
                onClick={() => setLedgerTab("investments")}
              >
                Investments
              </LedgerTab>
              <LedgerTab
                active={ledgerTab === "reinvestments"}
                onClick={() => setLedgerTab("reinvestments")}
              >
                Reinvestments
              </LedgerTab>
            </div>
          </div>
          <div className="mt-2 overflow-hidden rounded-xl border border-neutral-800">
            {ledgerTab === "investments" && investments.isLoading ? (
              <div
                className="space-y-2 p-3"
                aria-label="Loading member investment transactions"
              >
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {ledgerTab === "investments" && investments.isError ? (
              <div className="flex items-center justify-between gap-3 p-3 text-sm text-rose-300">
                <span>Could not load this member’s investment transactions</span>
                <Button variant="secondary" onClick={() => investments.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {ledgerTab === "investments" && investments.data?.map((transaction) => (
              <FinanceTransactionRow
                key={transaction.id}
                transaction={transaction}
                readOnly
              />
            ))}
            {ledgerTab === "investments" && !investments.isLoading && !investments.data?.length ? (
              <EmptyState text="No investment transactions for this member" />
            ) : null}
            {ledgerTab === "reinvestments" && reinvestments.isLoading ? (
              <div
                className="space-y-2 p-3"
                aria-label="Loading member reinvestment sources"
              >
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {ledgerTab === "reinvestments" && reinvestments.isError ? (
              <div className="flex items-center justify-between gap-3 p-3 text-sm text-rose-300">
                <span>Could not load this member’s reinvestment sources</span>
                <Button variant="secondary" onClick={() => reinvestments.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {ledgerTab === "reinvestments"
              ? reinvestmentEntries(reinvestments.data?.timeline).map((entry) => (
                  <ReinvestmentRow
                    key={entry.id}
                    entry={entry}
                    currency={currency}
                  />
                ))
              : null}
            {ledgerTab === "reinvestments" && !reinvestments.isLoading && !reinvestmentEntries(reinvestments.data?.timeline).length ? (
              <EmptyState text="No reinvestment sources for this member" />
            ) : null}
          </div>
        </section>
      </Modal>

      <Modal
        open={salaryAction !== null}
        onClose={closeSalaryAction}
        title={salaryAction === "pay" ? "Pay salary" : "Invest salary"}
        titleIcon={
          salaryAction === "pay" ? (
            <Banknote size={18} />
          ) : (
            <TrendingUp size={18} />
          )
        }
      >
        <p className="text-sm text-neutral-400">
          Available commission: {formatMoney(maximum, currency)}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormField label={`Amount, ${currency}`}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </FormField>
          {salaryAction === "pay" ? (
            <FormField label="Account">
              <CustomSelect
                value={accountId}
                onChange={setAccountId}
                placeholder="Select account"
                options={(accounts.data ?? []).map((account) => ({
                  value: account.id,
                  label: account.name,
                  meta: account.currency,
                  iconPresentation: account.iconPresentation ?? undefined,
                  iconFallback: account.currency,
                }))}
              />
            </FormField>
          ) : null}
        </div>
        {mutation.error ? (
          <p className="mt-2 text-sm text-rose-300">
            {(
              mutation.error as {
                response?: { data?: { message?: string } };
              }
            ).response?.data?.message ?? "Operation failed"}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeSalaryAction}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !enteredAmount ||
              enteredAmount > maximum ||
              (salaryAction === "pay" && !accountId) ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {salaryAction === "pay" ? (
              <Banknote size={15} />
            ) : (
              <TrendingUp size={15} />
            )}
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}

function LedgerTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 font-medium transition ${active ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

type ReinvestmentEntry = {
  id: string;
  type: string;
  date: string;
  amount: number;
  title?: string | null;
};

function reinvestmentEntries(timeline?: ReinvestmentEntry[]) {
  return (timeline ?? []).filter(
    (entry) =>
      entry.type === "AUTO_REINVESTMENT" ||
      entry.type.startsWith("REINVESTMENT_"),
  );
}

function ReinvestmentRow({
  entry,
  currency,
}: {
  entry: ReinvestmentEntry;
  currency: string;
}) {
  const isWithdrawal = entry.amount < 0;
  const isAutomatic = entry.type === "AUTO_REINVESTMENT";
  return (
    <div className="grid gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <IconAvatar
          icon={{ type: "unicode", value: isWithdrawal ? "↩️" : "♻️" }}
          label="Reinvestment"
          size="md"
        />
        <div className="min-w-0">
          <div className="truncate font-medium text-white">
            {entry.title || (isAutomatic ? "Profit share" : "Profit reinvested")}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {isAutomatic ? "Automatic profit share" : "Recorded reinvestment"}
            <span aria-hidden="true"> · </span>
            {formatDate(entry.date)}
          </div>
        </div>
      </div>
      <CurrencyAmount
        amount={entry.amount}
        currency={currency}
        className={`font-semibold ${isWithdrawal ? "text-rose-300" : "text-emerald-300"}`}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-950 p-2.5">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-white">
        {formatMoney(value, currency)}
      </div>
    </div>
  );
}
