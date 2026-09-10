export type FinanceLocale = "uk" | "ru" | "en";

export type ConsumerFinanceTelegramUser = {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type ConsumerFinanceProfile = {
  id: string;
  /** Finance-only display name override. Telegram identity remains immutable. */
  displayNameOverride?: string | null;
  defaultCurrency: string;
  timezone: string;
  /** Effective locale after applying the Telegram fallback. */
  locale: FinanceLocale;
  /** Explicit user preference; null means follow Telegram. */
  localeOverride?: FinanceLocale | null;
  onboardingCompletedAt?: string | null;
  telegramUser: ConsumerFinanceTelegramUser;
};

export type ConsumerFinanceSessionState =
  | { authenticated: true; profile: ConsumerFinanceProfile }
  | { authenticated: false };

export type ConsumerFinanceSettingsInput = {
  defaultCurrency: string;
  timezone: string;
  locale?: FinanceLocale | null;
  displayName?: string | null;
};
