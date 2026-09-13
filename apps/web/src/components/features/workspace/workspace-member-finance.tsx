"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Banknote, History, TrendingUp } from "lucide-react";
import { accountsApi, memberFinanceApi } from "@/lib/api";
import type { MemberFinanceSummary } from "@/lib/api-types";
import { formatMoney } from "@/lib/features/finance/money";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import {
  accountKeys,
  dashboardKeys,
  memberFinanceKeys,
  workspaceKeys,
} from "@/lib/query-keys";

type Action = "pay" | "invest" | "withdraw";

export function WorkspaceMemberFinance({
  member,
  summary,
  canManage,
}: {
  member: { id: string; user: { name: string } };
  summary?: MemberFinanceSummary;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>("pay");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const details = useQuery({
    queryKey: memberFinanceKeys.detail(member.id),
    queryFn: () => memberFinanceApi.details(member.id),
    enabled: open,
  });
  const accounts = useQuery({
    queryKey: accountKeys.accounts(),
    queryFn: accountsApi.list,
    enabled: open && canManage,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (action === "pay")
        return memberFinanceApi.pay(member.id, { amount: value, accountId });
      if (action === "invest")
        return memberFinanceApi.investSalary(member.id, { amount: value });
      return memberFinanceApi.withdrawReinvestment(member.id, {
        amount: value,
        accountId,
      });
    },
    onSuccess: async () => {
      setAmount("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: memberFinanceKeys.summaries() }),
        qc.invalidateQueries({ queryKey: memberFinanceKeys.detail(member.id) }),
        qc.invalidateQueries({ queryKey: workspaceKeys.members() }),
        qc.invalidateQueries({ queryKey: accountKeys.accounts() }),
        qc.invalidateQueries({ queryKey: dashboardKeys.summary() }),
      ]);
    },
  });
  if (!summary) return null;
  const currency = summary.primaryCurrency;
  const total = summary.investments.total;
  const principal = Math.max(
    0,
    summary.investments.external + summary.investments.salary,
  );
  const reinvest = Math.max(0, summary.investments.reinvestment);
  const reinvestWidth = total > 0 ? Math.min(100, (reinvest / total) * 100) : 0;
  const maximum = action === "withdraw" ? reinvest : summary.commissionPayable;
  const enteredAmount = Number(amount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-left transition hover:border-emerald-500/30"
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-neutral-400">
            <Banknote size={14} className="text-emerald-300" /> Commission
            payable
          </span>
          <strong className="tabular-nums text-emerald-300">
            {formatMoney(summary.commissionPayable, currency)}
          </strong>
        </div>
        {total > 0 ? (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px] text-neutral-500">
              <span>Capital {formatMoney(principal, currency)}</span>
              <span>Reinvest {formatMoney(reinvest, currency)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-sky-500/60">
              <span
                className="ml-auto h-full bg-violet-400"
                style={{ width: `${reinvestWidth}%` }}
              />
            </div>
          </div>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.user.name} · money history`}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Earned"
            value={summary.commissionEarned}
            currency={currency}
          />
          <Metric
            label="To pay"
            value={summary.commissionPayable}
            currency={currency}
          />
          <Metric label="Capital" value={principal} currency={currency} />
          <Metric label="Reinvest" value={reinvest} currency={currency} />
        </div>

        {canManage ? (
          <div className="mt-5 rounded-xl border border-neutral-800 p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={action === "pay" ? "primary" : "secondary"}
                onClick={() => setAction("pay")}
              >
                Pay salary
              </Button>
              <Button
                type="button"
                variant={action === "invest" ? "primary" : "secondary"}
                onClick={() => setAction("invest")}
              >
                Invest salary
              </Button>
              <Button
                type="button"
                variant={action === "withdraw" ? "primary" : "secondary"}
                onClick={() => setAction("withdraw")}
              >
                Withdraw reinvest
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label={`Amount, ${currency}`}>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </FormField>
              {action !== "invest" ? (
                <FormField label="Account">
                  <Select
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">Select account</option>
                    {(accounts.data ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </option>
                    ))}
                  </Select>
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
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                disabled={
                  !enteredAmount ||
                  enteredAmount > maximum ||
                  (action !== "invest" && !accountId) ||
                  mutation.isPending
                }
                onClick={() => mutation.mutate()}
              >
                {action === "pay" ? (
                  <Banknote size={15} />
                ) : action === "invest" ? (
                  <TrendingUp size={15} />
                ) : (
                  <ArrowDownToLine size={15} />
                )}
                Confirm
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <h4 className="flex items-center gap-2 font-medium text-white">
            <History size={16} /> History
          </h4>
          <div className="mt-2 divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {details.isLoading ? (
              <div
                className="space-y-2 p-3"
                aria-label="Loading member finance history"
              >
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {details.isError ? (
              <div className="flex items-center justify-between gap-3 p-3 text-sm text-rose-300">
                <span>Could not load money history</span>
                <Button variant="secondary" onClick={() => details.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {(details.data?.timeline ?? []).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium text-neutral-200">
                    {historyLabel(item.type)}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {new Date(item.date).toLocaleString()}{" "}
                    {item.title ? `· ${item.title}` : ""}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums text-neutral-100">
                  {formatMoney(Math.abs(item.amount), currency)}
                </span>
              </div>
            ))}
            {!details.isLoading && !details.data?.timeline.length ? (
              <div className="px-3 py-6 text-center text-sm text-neutral-500">
                No member finance activity yet
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
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

function historyLabel(type: string) {
  return (
    (
      {
        COMMISSION_EARNED: "Commission earned",
        SALARY_PAID: "Salary paid",
        SALARY_INVESTED: "Salary invested",
        EXTERNAL_CONTRIBUTION: "External investment",
        REINVESTMENT_CONTRIBUTION: "Profit reinvested",
        REINVESTMENT_WITHDRAWAL: "Reinvestment withdrawn",
      } as Record<string, string>
    )[type] ?? type
  );
}
