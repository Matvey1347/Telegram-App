import { notFound } from "next/navigation";
import { FinanceRootApp } from "@finance-web/components/finance-root-app";

const screens = new Set(["home", "history", "analytics", "ai", "accounts", "categories", "recurring", "debts", "investments", "subscription", "profile", "rates", "privacy", "tutorial", "financeSettings"]);

export default async function FinanceApplicationScreen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!screens.has(screen)) notFound();
  return <FinanceRootApp />;
}
