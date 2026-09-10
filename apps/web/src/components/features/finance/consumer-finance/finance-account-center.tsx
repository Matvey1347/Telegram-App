"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { consumerFinanceProfileApi } from "@/lib/features/finance/consumer-finance-profile-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button, Card, FormField, Input, SavingState } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAccountCenterCopy } from "./i18n/account-center";
import { FinanceProfileAvatar } from "./finance-profile-avatar";
import { FinanceSettings } from "./finance-settings";
import { FinancePlans } from "./finance-plans";

export function FinanceAccountCenter({
  botId,
  profile,
  locale,
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  locale: FinanceLocale;
}) {
  const t = financeAccountCenterCopy(locale);
  const client = useQueryClient();
  const [displayName, setDisplayName] = useState(
    profile.displayNameOverride ?? profile.telegramUser.displayName,
  );
  const save = useMutation({
    mutationFn: () =>
      consumerFinanceProfileApi.updateSettings(botId, {
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        displayName: displayName.trim(),
      }),
    onSuccess: (updated) => {
      client.setQueryData(consumerFinanceKeys.session(botId), {
        authenticated: true,
        profile: updated,
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">{t.profile}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
            <FinanceProfileAvatar profile={profile} showName />
          </div>
          <div className="space-y-3">
            <FormField label={t.displayName}>
              <Input
                aria-label={t.displayName}
                value={displayName}
                maxLength={120}
                autoComplete="name"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </FormField>
            <div>
              <p className="text-xs text-neutral-500">{t.telegramAccount}</p>
              <p className="mt-1 text-sm text-neutral-300">
                {profile.telegramUser.username
                  ? `@${profile.telegramUser.username}`
                  : "—"}
              </p>
            </div>
            <p className="text-xs leading-5 text-neutral-500">
              {t.identityHelp}
            </p>
            <Button
              className="w-full sm:w-auto"
              disabled={!displayName.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t.saving : t.saveProfile}
            </Button>
            {save.isPending ? <SavingState text={t.saving} compact /> : null}
            {save.isSuccess ? (
              <p role="status" className="text-sm text-emerald-300">
                {t.profileSaved}
              </p>
            ) : null}
            {save.isError ? (
              <p role="alert" className="text-sm text-rose-300">
                {t.profileError}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
      <FinanceSettings botId={botId} profile={profile} locale={locale} />
      <FinancePlans botId={botId} locale={locale} />
    </div>
  );
}
