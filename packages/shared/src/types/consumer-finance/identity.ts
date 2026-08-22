export type FinanceLocale = "uk" | "ru" | "en";

export type ConsumerFinanceProfile = {
  id: string;
  defaultCurrency: string;
  timezone: string;
  /** Effective locale after applying the Telegram fallback. */
  locale: FinanceLocale;
  /** Explicit user preference; null means follow Telegram. */
  localeOverride?: FinanceLocale | null;
  onboardingCompletedAt?: string | null;
};

export type ConsumerFinanceSessionState =
  | { authenticated: true; profile: ConsumerFinanceProfile }
  | { authenticated: false };

export type ConsumerFinanceSettingsInput = {
  defaultCurrency: string;
  timezone: string;
  locale?: FinanceLocale | null;
};
