import type { FinanceVisualContext } from "./finance-visual-context";
import {
  AccountsScene,
  CategoriesScene,
  OverviewScene,
  TransactionsScene,
  TransfersScene,
} from "./finance-context-scenes-ledger";
import {
  AnalyticsScene,
  BudgetScene,
  DebtsScene,
  InvestmentsScene,
  PlanScene,
  RecurringPaymentsScene,
  RemindersScene,
  SavingsScene,
  SettingsScene,
} from "./finance-context-scenes-planning";

export type FinanceStateGraphicKind = "ledger" | "flow" | "growth" | "planning";

export function FinanceStateContextGraphic({
  context,
}: {
  context: FinanceVisualContext;
}) {
  switch (context) {
    case "overview":
      return <OverviewScene />;
    case "transactions":
      return <TransactionsScene />;
    case "transfers":
      return <TransfersScene />;
    case "accounts":
      return <AccountsScene />;
    case "categories":
      return <CategoriesScene />;
    case "debts":
      return <DebtsScene />;
    case "recurringPayments":
      return <RecurringPaymentsScene />;
    case "savings":
      return <SavingsScene />;
    case "investments":
      return <InvestmentsScene />;
    case "analytics":
      return <AnalyticsScene />;
    case "budget":
      return <BudgetScene />;
    case "reminders":
      return <RemindersScene />;
    case "plan":
      return <PlanScene />;
    case "settings":
      return <SettingsScene />;
  }
}
