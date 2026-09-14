"use client";

import { useRef, useState } from "react";
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
import { FinanceTierBadge } from "./finance-plan-promotion";
import { useFinanceEntitlements } from "./use-finance-entitlements";

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
  const entitlements = useFinanceEntitlements(botId);
  const client = useQueryClient();
  const [displayName, setDisplayName] = useState(
    profile.displayNameOverride ?? profile.telegramUser.displayName,
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const updateSession = (updated: ConsumerFinanceProfile) => {
    client.setQueryData(consumerFinanceKeys.session(botId), {
      authenticated: true,
      profile: updated,
    });
  };
  const save = useMutation({
    mutationFn: () =>
      consumerFinanceProfileApi.updateSettings(botId, {
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        displayName: displayName.trim(),
      }),
    onSuccess: updateSession,
  });
  const uploadAvatar = useMutation({
    mutationFn: (file: File) => consumerFinanceProfileApi.uploadAvatar(botId, file),
    onSuccess: updateSession,
  });
  const clearAvatar = useMutation({
    mutationFn: () => consumerFinanceProfileApi.clearAvatar(botId),
    onSuccess: updateSession,
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 border-cyan-900/70 bg-cyan-950/15">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">
            {t.currentPlan}
          </p>
          <p className="mt-1 text-sm text-neutral-400">{t.currentPlanHelp}</p>
        </div>
        <FinanceTierBadge
          tier={entitlements.data?.tier}
          loading={entitlements.isLoading}
        />
      </Card>
      <Card>
        <h2 className="font-medium">{t.profile}</h2>
        <div className="mt-3 space-y-3">
            <FormField label={t.displayName}>
              <Input
                aria-label={t.displayName}
                value={displayName}
                maxLength={120}
                autoComplete="name"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </FormField>
            <FormField label={t.financeAvatar}>
              <div className="flex flex-wrap items-center gap-2">
                <FinanceProfileAvatar profile={profile} />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) uploadAvatar.mutate(file);
                  }}
                />
                <Button
                  type="button"
                  disabled={uploadAvatar.isPending}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadAvatar.isPending ? t.uploadingAvatar : t.changeAvatar}
                </Button>
                {profile.avatarUrl ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={clearAvatar.isPending}
                    onClick={() => clearAvatar.mutate()}
                  >
                    {clearAvatar.isPending ? t.resettingAvatar : t.useTelegramAvatar}
                  </Button>
                ) : null}
              </div>
            </FormField>
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
            {uploadAvatar.isError || clearAvatar.isError ? (
              <p role="alert" className="text-sm text-rose-300">
                {t.avatarError}
              </p>
            ) : null}
        </div>
      </Card>
      <FinanceSettings botId={botId} profile={profile} locale={locale} />
      <FinancePlans botId={botId} locale={locale} />
    </div>
  );
}
