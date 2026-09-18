"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceInvestmentInput } from "@telegram-system/shared";
import { FinanceInvestmentEditor } from "./finance-investment-editor";
import {
  FinanceInvestmentActionModal,
  type InvestmentAction,
  type InvestmentActionValues,
} from "./finance-investment-action-modal";
import {
  Button,
  ErrorState,
  FormField,
  LoadingState,
  Modal,
  Select,
} from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { consumerFinanceInvestmentsApi } from "@/lib/features/finance/consumer-finance-investments-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { consumerFinanceRequestId } from "@/lib/features/finance/consumer-finance-assets";
import {
  invalidateConsumerAssetDerivations,
  patchInvestmentMutation,
} from "@/lib/features/finance/consumer-finance-assets-cache";

type CreateMode = "NEW" | "CONTRIBUTION" | "RETURN";

export function FinanceInvestmentCreateModal({
  botId,
  locale,
  defaultCurrency,
  onClose,
}: {
  botId: string;
  locale: FinanceLocale;
  defaultCurrency: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const t = financeInvestmentsCopy(locale);
  const [mode, setMode] = useState<CreateMode>("NEW");
  const [investmentId, setInvestmentId] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const investments = useQuery({
    queryKey: consumerFinanceKeys.investments(botId, {
      status: "ACTIVE",
      limit: 100,
    }),
    queryFn: () =>
      consumerFinanceInvestmentsApi.list(botId, {
        status: "ACTIVE",
        limit: 100,
      }),
    retry: false,
  });
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (input: ConsumerFinanceInvestmentInput) =>
      consumerFinanceInvestmentsApi.create(botId, input),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentLists(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
      onClose();
    },
  });
  const cashFlow = useMutation({
    mutationFn: (values: InvestmentActionValues) =>
      consumerFinanceInvestmentsApi.addCashFlow(botId, investmentId, {
        kind: mode as Extract<InvestmentAction, "CONTRIBUTION" | "RETURN">,
        accountId: values.accountId!,
        amount: values.amount!,
        occurredAt: values.occurredAt,
        note: values.note,
        idempotencyKey: consumerFinanceRequestId(
          `investment-${mode.toLowerCase()}`,
        ),
      }),
    onSuccess: (result) => {
      patchInvestmentMutation(client, botId, result);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentLists(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
      onClose();
    },
  });
  const active = investments.data?.items ?? [];
  const selectedInvestment = active.find((item) => item.id === investmentId);
  if (showEditor)
    return (
      <FinanceInvestmentEditor
        open
        locale={locale}
        defaultCurrency={defaultCurrency}
        pending={save.isPending}
        error={save.isError}
        onClose={onClose}
        onSubmit={(input) => save.mutate(input)}
      />
    );
  if (showAction && selectedInvestment && accounts.data)
    return (
      <FinanceInvestmentActionModal
        open
        action={mode as Extract<InvestmentAction, "CONTRIBUTION" | "RETURN">}
        investment={selectedInvestment}
        accounts={accounts.data}
        valuations={[]}
        locale={locale}
        pending={cashFlow.isPending}
        error={cashFlow.isError}
        onClose={onClose}
        onSubmit={(values) => cashFlow.mutate(values)}
      />
    );
  if (investments.isLoading || accounts.isLoading)
    return <LoadingState text={t.loading} />;
  if (investments.isError || accounts.isError)
    return (
      <Modal open onClose={onClose} title={t.add}>
        <ErrorState text={t.loadError} />
      </Modal>
    );
  return (
    <Modal open onClose={onClose} closeLabel={t.close} title={t.add}>
      <div className="space-y-3">
        <FormField label={t.investmentModalAction}>
          <Select
            uiLocale={locale}
            value={mode}
            onChange={(event) => setMode(event.target.value as CreateMode)}
          >
            <option value="NEW">{t.newInvestmentAction}</option>
            <option value="CONTRIBUTION">{t.addContributionAction}</option>
            <option value="RETURN">{t.addReturnAction}</option>
          </Select>
        </FormField>
        {mode === "NEW" ? (
          <p className="text-sm text-neutral-400">{t.newInvestmentHelp}</p>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              {t.existingInvestmentHelp}
            </p>
            <FormField label={t.chooseInvestment}>
              <Select
                uiLocale={locale}
                value={investmentId}
                onChange={(event) => setInvestmentId(event.target.value)}
              >
                <option value="">{t.chooseInvestment}</option>
                {active.map((investment) => (
                  <option key={investment.id} value={investment.id}>
                    {investment.name} · {investment.currency}
                  </option>
                ))}
              </Select>
            </FormField>
            {!active.length ? (
              <p className="text-sm text-neutral-400">
                {t.noActiveInvestments}
              </p>
            ) : null}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="cancel" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={mode !== "NEW" && !selectedInvestment}
            onClick={() => {
              if (mode === "NEW") setShowEditor(true);
              else setShowAction(true);
            }}
          >
            {mode === "NEW" ? t.continueToInvestment : t.continueToCashFlow}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
