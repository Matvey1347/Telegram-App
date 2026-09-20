"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceDebt } from "@telegram-system/shared";
import { Button, ErrorState, FormField, Input, Modal, Select } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeDebtsCopy } from "./i18n/debts";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";

export function FinanceDebtSettlementModal({
  debt,
  botId,
  locale,
  onClose,
  onCreate,
}: {
  debt: ConsumerFinanceDebt;
  botId: string;
  locale: FinanceLocale;
  onClose: () => void;
  onCreate: (accountId: string, amount: string) => Promise<unknown>;
}) {
  const t = financeDebtsCopy(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
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
  const [amount, setAmount] = useState(debt.amount);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onCreate(selectedAccountId, amount);
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
          <Input value={debt.name} readOnly />
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
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
              !(Number(amount) > 0) ||
              Number(amount) > Number(debt.amount)
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
