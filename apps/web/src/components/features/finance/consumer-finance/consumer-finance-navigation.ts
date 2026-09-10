import type { FinanceCoreCopy } from "./i18n/core";

export type ConsumerFinanceSurface = "browser" | "telegram";
export type ConsumerFinanceAction = "expense" | "income" | "transfer";
export type ConsumerFinanceScreen =
  | "home"
  | "transactions"
  | "transfers"
  | "debts"
  | "regular-payments"
  | "savings"
  | "investments"
  | "investment"
  | "analytics"
  | "accounts"
  | "account"
  | "settings"
  | "categories"
  | "reminders"
  | "billing"
  | "budget"
  | "profile";

const SCREEN_COPY_KEYS: Record<ConsumerFinanceScreen, keyof FinanceCoreCopy> = {
  home: "overview",
  transactions: "transactions",
  transfers: "transfers",
  debts: "debts",
  "regular-payments": "regularPayments",
  savings: "savings",
  investments: "investments",
  investment: "investment",
  analytics: "analytics",
  accounts: "accounts",
  account: "editAccount",
  settings: "settings",
  categories: "categories",
  budget: "budget",
  reminders: "reminders",
  billing: "plan",
  profile: "accountCenter",
};

export function financeScreenLabel(
  copy: FinanceCoreCopy,
  screen: ConsumerFinanceScreen,
) {
  return copy[SCREEN_COPY_KEYS[screen]];
}

export function financeSurfaceForBootstrap(
  status: string,
): ConsumerFinanceSurface {
  return status === "ready" || status === "error" ? "telegram" : "browser";
}

const SCREEN_VALUES = new Set<ConsumerFinanceScreen>([
  "home",
  "transactions",
  "transfers",
  "debts",
  "regular-payments",
  "savings",
  "investments",
  "investment",
  "analytics",
  "accounts",
  "account",
  "settings",
  "categories",
  "budget",
  "reminders",
  "billing",
  "profile",
]);

export function readConsumerFinanceScreen(location: Location) {
  const params = new URLSearchParams(location.search);
  if (params.get("transfer") === "1") return "transfers";
  const requested = params.get("screen");
  if (requested === "account" && !params.get("accountId")?.trim()) {
    return "accounts";
  }
  if (requested === "investment" && !params.get("investmentId")?.trim()) {
    return "investments";
  }
  if (requested === "ultimate") return "analytics";
  return requested && SCREEN_VALUES.has(requested as ConsumerFinanceScreen)
    ? (requested as ConsumerFinanceScreen)
    : "home";
}

export function consumerFinanceScreenUrl(
  location: Location,
  screen: ConsumerFinanceScreen,
) {
  const url = new URL(location.href);
  url.searchParams.delete("transfer");
  url.searchParams.delete("regularPaymentId");
  url.searchParams.delete("occurrenceAt");
  url.searchParams.delete("configVersion");
  url.searchParams.delete("accountId");
  url.searchParams.delete("investmentId");
  if (screen === "home") url.searchParams.delete("screen");
  else url.searchParams.set("screen", screen);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function consumerFinanceAccountUrl(
  location: Location,
  accountId: string,
) {
  const url = new URL(location.href);
  url.searchParams.delete("transfer");
  url.searchParams.delete("regularPaymentId");
  url.searchParams.delete("occurrenceAt");
  url.searchParams.delete("configVersion");
  url.searchParams.set("screen", "account");
  url.searchParams.set("accountId", accountId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readConsumerFinanceAccountId(location: Location) {
  if (readConsumerFinanceScreen(location) !== "account") return null;
  const value = new URLSearchParams(location.search).get("accountId")?.trim();
  return value || null;
}

export function consumerFinanceInvestmentUrl(
  location: Location,
  investmentId: string,
) {
  const url = new URL(location.href);
  url.searchParams.delete("accountId");
  url.searchParams.set("screen", "investment");
  url.searchParams.set("investmentId", investmentId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readConsumerFinanceInvestmentId(location: Location) {
  if (readConsumerFinanceScreen(location) !== "investment") return null;
  return (
    new URLSearchParams(location.search).get("investmentId")?.trim() || null
  );
}

export type ConsumerFinanceRegularPaymentTarget = {
  regularPaymentId: string;
  occurrenceAt: string;
  expectedVersion: number;
};

function isValidOccurrenceAt(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  );
}

export function readConsumerFinanceRegularPaymentTarget(
  location: Location,
): ConsumerFinanceRegularPaymentTarget | null {
  if (readConsumerFinanceScreen(location) !== "regular-payments") return null;
  const params = new URLSearchParams(location.search);
  const regularPaymentId = params.get("regularPaymentId")?.trim();
  const occurrenceAt = params.get("occurrenceAt")?.trim();
  const expectedVersion = Number(params.get("configVersion"));
  if (
    !regularPaymentId ||
    !occurrenceAt ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !isValidOccurrenceAt(occurrenceAt)
  ) {
    return null;
  }
  return { regularPaymentId, occurrenceAt, expectedVersion };
}

export function hasConsumerFinanceRegularPaymentTarget(location: Location) {
  const params = new URLSearchParams(location.search);
  return (
    params.has("regularPaymentId") ||
    params.has("occurrenceAt") ||
    params.has("configVersion")
  );
}

export function isMoreScreen(screen: ConsumerFinanceScreen) {
  return [
    "transfers",
    "debts",
    "regular-payments",
    "savings",
    "investments",
    "investment",
    "accounts",
    "account",
    "budget",
    "categories",
    "reminders",
    "billing",
    "settings",
    "profile",
  ].includes(screen);
}
