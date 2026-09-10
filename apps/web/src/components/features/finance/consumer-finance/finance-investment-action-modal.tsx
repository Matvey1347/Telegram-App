"use client";

import { useState } from "react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceInvestment,
  ConsumerFinanceInvestmentValuation,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import {
  dateInputToIso,
  todayInputValue,
} from "@/lib/features/finance/consumer-finance-assets";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export type InvestmentAction =
  | "CONTRIBUTION"
  | "RETURN"
  | "VALUATION"
  | "CLOSE";
export type InvestmentActionValues = {
  accountId?: string;
  amount?: string;
  value?: string;
  occurredAt: string;
  note?: string;
  correctsValuationId?: string;
};

export function FinanceInvestmentActionModal({
  open,
  action,
  investment,
  accounts,
  valuations,
  locale,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  action: InvestmentAction;
  investment: ConsumerFinanceInvestment;
  accounts: ConsumerFinanceAccount[];
  valuations: ConsumerFinanceInvestmentValuation[];
  locale: FinanceLocale;
  pending: boolean;
  error: boolean;
  onClose: () => void;
  onSubmit: (values: InvestmentActionValues) => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const eligible = accounts.filter((account) => !account.archivedAt);
  const [accountId, setAccountId] = useState(eligible[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [corrects, setCorrects] = useState("");
  const title =
    action === "CONTRIBUTION"
      ? t.contribution
      : action === "RETURN"
        ? t.investmentReturn
        : action === "VALUATION"
          ? t.valuation
          : t.closeInvestment;
  const cashFlow = action === "CONTRIBUTION" || action === "RETURN";
  const closing = action === "CLOSE";
  return (
    <Modal open={open} onClose={onClose} title={`${title}: ${investment.name}`}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            accountId: cashFlow || (closing && amount) ? accountId : undefined,
            amount: cashFlow || closing ? amount || undefined : undefined,
            value: action === "VALUATION" ? value : undefined,
            occurredAt: dateInputToIso(date),
            note: note.trim() || undefined,
            correctsValuationId: corrects || undefined,
          });
        }}
      >
        {cashFlow ? (
          <p className="text-sm text-neutral-400">{t.cashFlowHelp}</p>
        ) : action === "VALUATION" ? (
          <p className="text-sm text-neutral-400">{t.manualOnly}</p>
        ) : (
          <p className="text-sm text-neutral-400">{t.closeHelp}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {cashFlow || closing ? (
            <FormField label={t.account} required={cashFlow}>
              <Select
                uiLocale={locale}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">{t.chooseAccount}</option>
                {eligible.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {cashFlow || closing ? (
            <FormField
              label={closing ? t.finalReturn : t.amount}
              required={cashFlow}
            >
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={closing ? t.noFinalReturn : undefined}
              />
            </FormField>
          ) : null}
          {action === "VALUATION" ? (
            <FormField
              label={`${t.currentValue} (${investment.currency})`}
              required
            >
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </FormField>
          ) : null}
          <FormField label={closing ? t.closeDate : t.date} required>
            <DateInput
              lang={locale}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          {action === "VALUATION" ? (
            <FormField label={t.selectCorrection}>
              <Select
                uiLocale={locale}
                value={corrects}
                onChange={(e) => setCorrects(e.target.value)}
              >
                <option value="">{t.notCorrection}</option>
                {valuations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.valuedAt.slice(0, 10)} ·{" "}
                    {formatMoney(item.value, item.currency, "symbol")}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {!closing ? (
            <FormField label={t.note}>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          ) : null}
        </div>
        {action === "VALUATION" && corrects ? (
          <p className="text-xs text-amber-200">{t.correctionHelp}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {t.actionError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              (cashFlow && (!accountId || Number(amount) <= 0)) ||
              (action === "VALUATION" && (value === "" || Number(value) < 0)) ||
              (closing && !!amount && (!accountId || Number(amount) <= 0))
            }
          >
            {pending ? t.saving : title}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
