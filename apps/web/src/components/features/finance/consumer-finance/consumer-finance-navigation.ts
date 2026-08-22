import type { ConsumerFinanceScreen } from "./consumer-finance-screens";
import type { FinanceCopy } from "./finance-i18n";

export type ConsumerFinanceSurface = "browser" | "telegram";
export type ConsumerFinanceAction = "expense" | "income" | "transfer";

const SCREEN_COPY_KEYS: Record<ConsumerFinanceScreen, keyof FinanceCopy> = {
  home: "overview",
  transactions: "transactions",
  transfers: "transfers",
  analytics: "analytics",
  ultimate: "financeUltimate",
  accounts: "accounts",
  settings: "settings",
  categories: "categories",
  budget: "budget",
  reminders: "reminders",
  billing: "plan",
};

export function financeScreenLabel(
  copy: FinanceCopy,
  screen: ConsumerFinanceScreen,
) {
  return copy[SCREEN_COPY_KEYS[screen]];
}

export function financeSurfaceForBootstrap(
  status: string,
): ConsumerFinanceSurface {
  return status === "browser" ? "browser" : "telegram";
}

const SCREEN_VALUES = new Set<ConsumerFinanceScreen>([
  "home",
  "transactions",
  "transfers",
  "analytics",
  "ultimate",
  "accounts",
  "settings",
  "categories",
  "budget",
  "reminders",
  "billing",
]);

export function readConsumerFinanceScreen(location: Location) {
  const params = new URLSearchParams(location.search);
  if (params.get("transfer") === "1") return "transfers";
  const requested = params.get("screen") as ConsumerFinanceScreen | null;
  return requested && SCREEN_VALUES.has(requested) ? requested : "home";
}

export function consumerFinanceScreenUrl(
  location: Location,
  screen: ConsumerFinanceScreen,
) {
  const url = new URL(location.href);
  url.searchParams.delete("transfer");
  if (screen === "home") url.searchParams.delete("screen");
  else url.searchParams.set("screen", screen);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isMoreScreen(screen: ConsumerFinanceScreen) {
  return [
    "transfers",
    "accounts",
    "budget",
    "categories",
    "ultimate",
    "reminders",
    "billing",
    "settings",
  ].includes(screen);
}
