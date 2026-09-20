"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  History,
  Landmark,
  Repeat2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { accountsApi, memberFinanceApi } from "@/lib/api";
import type { MemberFinanceSummary } from "@/lib/api-types";
import { formatMoney } from "@/lib/features/finance/money";
import {
  Button,
  FormField,
  Input,
  Modal,
  CustomSelect,
  Skeleton,
} from "@/components/ui/primitives";
import {
  accountKeys,
  dashboardKeys,
  memberFinanceKeys,
  workspaceKeys,
} from "@/lib/query-keys";

type Action = "pay" | "invest";

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
      return memberFinanceApi.investSalary(member.id, { amount: value });
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
  const principal = Math.max(0, summary.investments.principal);
  const reinvested = summary.investments.investorEarnings;
  const maximum = summary.commissionPayable;
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
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
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
        leadingHeaderAction={
          details.data?.member ? (
            <IconAvatar
              icon={details.data.member.avatarPresentation}
              label={details.data.member.name}
              size="sm"
            />
          ) : undefined
        }
        titleIcon={<Landmark size={18} />}
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
          <Metric label="Invested" value={principal} currency={currency} />
          <Metric label="Reinvested" value={reinvested} currency={currency} />
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
              {action === "pay" ? (
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
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                disabled={
                  !enteredAmount ||
                  enteredAmount > maximum ||
                  (action === "pay" && !accountId) ||
                  mutation.isPending
                }
                onClick={() => mutation.mutate()}
              >
                {action === "pay" ? (
                  <Banknote size={15} />
                ) : (
                  <TrendingUp size={15} />
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
            {(details.data?.timeline ?? []).map((item) => {
              const isInvestment = [
                "SALARY_INVESTED",
                "EXTERNAL_CONTRIBUTION",
                "REINVESTMENT_CONTRIBUTION",
                "AUTO_REINVESTMENT",
              ].includes(item.type);
              const content = (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-emerald-300">
                    {historyIcon(item.type)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-200">
                      {historyLabel(item.type)}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {new Date(item.date).toLocaleString()}{" "}
                      {item.title ? `· ${item.title}` : ""}
                    </div>
                  </div>
                </div>
              );
              const amount = (
                <span className="shrink-0 tabular-nums text-neutral-100">
                  {formatMoney(Math.abs(item.amount), currency)}
                </span>
              );
              return isInvestment ? (
                <a
                  key={item.id}
                  href="/finance#transactions"
                  aria-label={`Open ${historyLabel(item.type)} in Finance`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition hover:bg-neutral-800/70"
                >
                  {content}
                  {amount}
                </a>
              ) : (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  {content}
                  {amount}
                </div>
              );
            })}
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
        AUTO_REINVESTMENT: "Revenue reinvested",
      } as Record<string, string>
    )[type] ?? type
  );
}

function historyIcon(type: string) {
  if (type === "EXTERNAL_CONTRIBUTION") return <WalletCards size={15} />;
  if (type === "SALARY_INVESTED") return <TrendingUp size={15} />;
  if (type === "REINVESTMENT_CONTRIBUTION" || type === "AUTO_REINVESTMENT") {
    return <Repeat2 size={15} />;
  }
  if (type === "COMMISSION_EARNED" || type === "SALARY_PAID") {
    return <Banknote size={15} />;
  }
  return <Landmark size={15} />;
}
