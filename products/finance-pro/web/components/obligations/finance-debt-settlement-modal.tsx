"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceDebt } from "@telegram-system/shared";
import {
  Button,
  DateInput,
  ErrorState,
  FormField,
  Input,
  Modal,
  Select,
} from "@finance-pro/web/components/ui";
import type { FinanceLocale } from "@finance-pro/web/components/i18n/core";
import { financeDebtsCopy } from "@finance-pro/web/components/i18n/debts";
import { consumerFinanceLedgerApi } from "@finance-pro/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceObligationsApi } from "@finance-pro/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";

export function FinanceDebtSettlementModal({
  debt: initialDebt,
  botId,
  locale,
  onClose,
  onCreate,
}: {
  debt: ConsumerFinanceDebt;
  botId: string;
  locale: FinanceLocale;
  onClose: () => void;
  onCreate: (
    debt: ConsumerFinanceDebt,
    accountId: string,
    amount: string,
    settlementDate: string,
  ) => Promise<unknown>;
}) {
  const t = financeDebtsCopy(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  const debts = useQuery({
    queryKey: consumerFinanceKeys.debts(botId, { status: "OPEN", limit: 100 }),
    queryFn: () => consumerFinanceObligationsApi.debts(botId, { status: "OPEN", limit: 100 }),
  });
  const openDebts = debts.data?.items ?? [initialDebt];
  const [debtId, setDebtId] = useState(initialDebt.id);
  const debt = openDebts.find((candidate) => candidate.id === debtId) ?? initialDebt;
  const settlementAccounts = (accounts.data ?? []).filter(
    (account) => !account.archivedAt,
  );
  const accountOptions = settlementAccounts.length
    ? settlementAccounts
    : [{ ...debt.account, archivedAt: null }];
  const [accountId, setAccountId] = useState(debt.accountId);
  const selectedAccountId = accountOptions.some((account) => account.id === accountId)
    ? accountId
    : (accountOptions[0]?.id ?? "");
  const selectedAccount = accountOptions.find((account) => account.id === selectedAccountId);
  const [amount, setAmount] = useState(debt.amount);
  const [settlementDate, setSettlementDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  useEffect(() => {
    setAccountId(debt.accountId);
    setAmount(debt.amount);
  }, [debt.accountId, debt.amount, debt.id]);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onCreate(debt, selectedAccountId, amount, settlementDate);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t.close}
      title={t.createSettlement}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t.operationType}>
          <Select uiLocale={locale} value="DEBT_SETTLEMENT" disabled>
            <option value="DEBT_SETTLEMENT">{t.debtRepayment}</option>
          </Select>
        </FormField>
        <FormField label={t.selectedDebt}>
          <Select
            uiLocale={locale}
            value={debt.id}
            onChange={(event) => setDebtId(event.target.value)}
          >
            {openDebts.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} · {candidate.amount} {candidate.currency}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={selectedAccountId}
            disabled={!accountOptions.length}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accountOptions.map((account) => (
              <option
                key={account.id}
                value={account.id}
                data-icon-emoji={
                  account.iconPresentation.type === "unicode"
                    ? account.iconPresentation.value
                    : undefined
                }
                data-option-meta={account.currency}
              >
                {account.name} · {account.currency}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.amount}>
          <Input
            autoFocus
            inputMode="decimal"
            suffix={selectedAccount?.currency}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label={t.settlementDate}>
          <DateInput
            value={settlementDate}
            onChange={(event) => setSettlementDate(event.target.value)}
          />
        </FormField>
        <p className="text-xs text-neutral-400 sm:col-span-2">
          {t.settleDescription}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="cancel" disabled={pending} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={
              pending ||
              !selectedAccountId ||
              !settlementDate ||
              !(Number(amount) > 0)
            }
            onClick={() => void submit()}
          >
            {pending ? t.saving : t.createTransaction}
          </Button>
        </div>
        {failed ? (
          <div className="sm:col-span-2">
            <ErrorState text={t.debtSettleError} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
