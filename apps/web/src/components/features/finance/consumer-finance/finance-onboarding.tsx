"use client";

import { useState } from "react";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import {
  financeCopy,
  normalizeFinanceLocale,
  supportedFinanceLocales,
  type FinanceLocale,
} from "./finance-i18n";

const currencies = ["UAH", "USD", "EUR", "PLN"];

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
  }) => void;
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
  const t = financeCopy(locale);
  const finish = () =>
    onComplete({
      defaultCurrency: currency,
      timezone,
      locale,
    });
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
            <Select
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as FinanceLocale)
              }
            >
              {supportedFinanceLocales.map((item) => (
                <option key={item} value={item}>
                  {item === "uk"
                    ? t.languageUkrainian
                    : item === "ru"
                      ? t.languageRussian
                      : t.languageEnglish}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.mainCurrency}>
            <Select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.onboardingTimezone}>
            <Input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
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
          <Button className="w-full" disabled={!timezone} onClick={finish}>
            {t.finish}
          </Button>
        </>
      ) : null}
    </Card>
  );
}
