"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { Button, Card, FormField, SavingState } from "./ui";
import { consumerFinanceProfileApi } from "@/lib/features/finance/consumer-finance-profile-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeSettingsCopy } from "./i18n/settings";
import { FinancePrivacy } from "./finance-privacy";
import { FinanceCurrencySelect } from "./ui/finance-currency-select";
import { FinanceTimezoneSelect } from "./ui/finance-timezone-select";

/** Finance preferences and privacy controls used by the account center. */
export function FinanceSettings({
  botId,
  profile,
  locale,
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  locale: FinanceLocale;
}) {
  const t = financeSettingsCopy(locale);
  const client = useQueryClient();
  const [currency, setCurrency] = useState(profile.defaultCurrency);
  const [timezone, setTimezone] = useState(profile.timezone);
  const save = useMutation({
    mutationFn: () =>
      consumerFinanceProfileApi.updateSettings(botId, {
        defaultCurrency: currency,
        timezone,
      }),
    onSuccess: (updated) => {
      client.setQueryData(consumerFinanceKeys.session(botId), {
        authenticated: true,
        profile: updated,
      });
      if (
        currency !== profile.defaultCurrency ||
        timezone !== profile.timezone
      ) {
        void Promise.all([
          client.invalidateQueries({
            queryKey: consumerFinanceKeys.dashboard(botId),
          }),
          client.invalidateQueries({
            queryKey: consumerFinanceKeys.accounts(botId),
          }),
          client.invalidateQueries({
            queryKey: consumerFinanceKeys.analyticsRoot(botId),
          }),
        ]);
      }
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">{t.general}</h2>
        <div className="mt-3 space-y-3">
          <div>
            <FormField label={t.mainCurrency}>
              <FinanceCurrencySelect
                locale={locale}
                value={currency}
                onChange={setCurrency}
              />
            </FormField>
            <p className="mt-1 text-xs text-neutral-500">{t.currencyHelp}</p>
          </div>
          <FormField label={t.timezone}>
            <FinanceTimezoneSelect
              locale={locale}
              label={t.timezone}
              value={timezone}
              onChange={setTimezone}
            />
          </FormField>
          <Button
            className="w-full"
            disabled={!currency || !timezone || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.saving : t.save}
          </Button>
          {save.isPending ? <SavingState text={t.saving} compact /> : null}
          {save.isError ? (
            <p role="alert" className="text-sm text-rose-300">
              {t.financeUnavailable}
            </p>
          ) : null}
        </div>
      </Card>
      <FinancePrivacy botId={botId} locale={locale} />
    </div>
  );
}
