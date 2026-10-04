"use client";

import { useState } from "react";
import type { ConsumerFinanceDebt } from "@telegram-system/shared";
import { Button, FormField, Modal, Select } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeDebtsCopy } from "./i18n/debts";

type DebtCreateMode = "NEW" | "SETTLE";

export function FinanceDebtCreateModal({
  debts,
  locale,
  onClose,
  onCreateNew,
  onSettle,
}: {
  debts: ConsumerFinanceDebt[];
  locale: FinanceLocale;
  onClose: () => void;
  onCreateNew: () => void;
  onSettle: (debt: ConsumerFinanceDebt) => void;
}) {
  const t = financeDebtsCopy(locale);
  const [mode, setMode] = useState<DebtCreateMode>("NEW");
  const [debtId, setDebtId] = useState("");
  const selectedDebt = debts.find((debt) => debt.id === debtId);

  return (
    <Modal open onClose={onClose} closeLabel={t.close} title={t.addDebt}>
      <div className="space-y-3">
        <FormField label={t.debtModalAction}>
          <Select
            uiLocale={locale}
            value={mode}
            onChange={(event) => setMode(event.target.value as DebtCreateMode)}
          >
            <option value="NEW">{t.newDebtAction}</option>
            <option value="SETTLE">{t.settleExistingDebtAction}</option>
          </Select>
        </FormField>
        {mode === "SETTLE" ? (
          <>
            <p className="text-sm text-neutral-400">{t.settleFromAddHelp}</p>
            <FormField label={t.selectedDebt}>
              <Select
                uiLocale={locale}
                value={debtId}
                onChange={(event) => setDebtId(event.target.value)}
              >
                <option value="">{t.chooseDebt}</option>
                {debts.map((debt) => (
                  <option key={debt.id} value={debt.id}>
                    {debt.name} · {debt.amount} {debt.currency}
                  </option>
                ))}
              </Select>
            </FormField>
            {!debts.length ? (
              <p className="text-sm text-neutral-400">{t.noOpenDebts}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-neutral-400">{t.newDebtHelp}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="cancel" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={mode === "SETTLE" && !selectedDebt}
            onClick={() => {
              if (mode === "NEW") onCreateNew();
              else if (selectedDebt) onSettle(selectedDebt);
            }}
          >
            {mode === "NEW" ? t.continueToDebt : t.createTransaction}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
