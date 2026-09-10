"use client";

import { createContext, useContext, type PropsWithChildren } from "react";
import type { ConsumerFinanceScreen } from "../consumer-finance-navigation";

export type FinanceVisualContext =
  | "overview"
  | "transactions"
  | "transfers"
  | "debts"
  | "recurringPayments"
  | "savings"
  | "investments"
  | "accounts"
  | "categories"
  | "analytics"
  | "budget"
  | "reminders"
  | "plan"
  | "settings";

const FinanceVisualContextValue =
  createContext<FinanceVisualContext>("overview");

export function FinanceVisualContextProvider({
  value,
  children,
}: PropsWithChildren<{ value: FinanceVisualContext }>) {
  return (
    <FinanceVisualContextValue.Provider value={value}>
      {children}
    </FinanceVisualContextValue.Provider>
  );
}

export function useFinanceVisualContext() {
  return useContext(FinanceVisualContextValue);
}

export function financeVisualContextForScreen(
  screen: ConsumerFinanceScreen,
): FinanceVisualContext {
  if (screen === "home") return "overview";
  if (screen === "regular-payments") return "recurringPayments";
  if (screen === "account") return "accounts";
  if (screen === "investment") return "investments";
  if (screen === "billing") return "plan";
  if (screen === "profile") return "settings";
  return screen;
}
