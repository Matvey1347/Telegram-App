import type { ConsumerFinanceScreen } from "./consumer-finance-screens";

export type ConsumerFinanceSurface = "browser" | "telegram";
export type ConsumerFinanceAction = "expense" | "income" | "transfer";

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
    "settings",
  ].includes(screen);
}
