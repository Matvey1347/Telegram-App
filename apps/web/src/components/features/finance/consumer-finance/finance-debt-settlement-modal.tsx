"use client";

import { useState } from "react";
import type { ConsumerFinanceDebt } from "@telegram-system/shared";
import { Button, ErrorState, FormField, Input, Modal, Select } from "./ui";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { FinanceLocale } from "./i18n/core";
import { financeDebtsCopy } from "./i18n/debts";

export function FinanceDebtSettlementModal({
  debt,
  locale,
  onClose,
  onCreate,
}: {
  debt: ConsumerFinanceDebt;
  locale: FinanceLocale;
  onClose: () => void;
  onCreate: () => Promise<unknown>;
}) {
  const t = financeDebtsCopy(locale);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onCreate();
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
          <Input value={`${debt.account.name} · ${debt.currency}`} readOnly />
        </FormField>
        <FormField label={t.amount}>
          <Input
            value={formatMoney(debt.amount, debt.currency, "symbol")}
            readOnly
          />
        </FormField>
        <p className="text-xs text-neutral-400 sm:col-span-2">
          {t.settleDescription}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="cancel" disabled={pending} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
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
