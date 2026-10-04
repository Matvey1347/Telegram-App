"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceInvestmentInput } from "@telegram-system/shared";
import { FinanceInvestmentEditor } from "@finance-pro/web/components/investments/finance-investment-editor";
import type { FinanceLocale } from "@finance-pro/web/components/i18n/core";
import { consumerFinanceInvestmentsApi } from "@finance-pro/web/lib/api/consumer-finance-investments-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";
import { invalidateConsumerAssetDerivations } from "@finance-pro/web/lib/cache/consumer-finance-assets-cache";

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
}
