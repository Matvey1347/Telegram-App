"use client";

import { useState } from "react";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { Button, Card, FormField } from "./ui";
import {
  financeCopy,
  normalizeFinanceLocale,
  type FinanceLocale,
} from "./finance-i18n";
import { FinanceLanguageSelect } from "./ui/finance-language-select";
import { FinanceTimezoneSelect } from "./ui/finance-timezone-select";
import { FinanceCurrencySelect } from "./ui/finance-currency-select";

export function FinanceOnboarding({
  profile,
  initialLocale,
  onComplete,
}: {
  profile: ConsumerFinanceProfile;
  initialLocale?: string | null;
  onComplete: (input: {
    defaultCurrency: string;
    timezone: string;
    locale: FinanceLocale;
  }) => void | Promise<unknown>;
}) {
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState<FinanceLocale>(() =>
    normalizeFinanceLocale(profile.locale ?? initialLocale),
  );
  const [currency, setCurrency] = useState(profile.defaultCurrency || "USD");
  const [timezone, setTimezone] = useState(
    profile.timezone ||
      (typeof Intl === "undefined"
        ? "UTC"
        : Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      "UTC",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const t = financeCopy(locale);
  const finish = async () => {
    setPending(true);
    setError(false);
    try {
      await onComplete({
        defaultCurrency: currency,
        timezone,
        locale,
      });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Card className="space-y-4 p-5">
      {step === 0 ? (
        <>
          <h1 className="text-xl font-semibold">{t.onboardingTitle}</h1>
          <pre className="rounded-lg bg-neutral-900 p-3 text-sm text-sky-200">
            {t.onboardingExample}
          </pre>
          <Button className="w-full" onClick={() => setStep(1)}>
            {t.continue}
          </Button>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <h1 className="text-xl font-semibold">{t.onboardingCurrency}</h1>
          <p className="text-sm text-neutral-400">{t.onboardingCurrencyHelp}</p>
          <FormField label={t.language}>
            <FinanceLanguageSelect
              copy={t}
              value={locale}
              onChange={setLocale}
            />
          </FormField>
          <FormField label={t.mainCurrency}>
            <FinanceCurrencySelect
              locale={locale}
              value={currency}
              onChange={setCurrency}
            />
          </FormField>
          <FormField label={t.onboardingTimezone}>
            <FinanceTimezoneSelect
              locale={locale}
              label={t.onboardingTimezone}
              value={timezone}
              onChange={setTimezone}
            />
          </FormField>
          <Button className="w-full" onClick={() => setStep(2)}>
            {t.continue}
          </Button>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h1 className="text-xl font-semibold">{t.onboardingChat}</h1>
          <p className="text-sm text-neutral-400">{t.onboardingChatHelp}</p>
          <p className="text-sm text-neutral-400">{t.onboardingAccount}</p>
          <Button
            className="w-full"
            disabled={!timezone || pending}
            onClick={() => void finish()}
          >
            {pending ? t.saving : t.finish}
          </Button>
          {error ? (
            <p className="text-sm text-rose-300">{t.financeUnavailable}</p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
