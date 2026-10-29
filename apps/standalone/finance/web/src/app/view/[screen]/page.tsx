import { notFound, redirect } from "next/navigation";

const browserScreens = new Set([
  "home", "history", "analytics", "ai", "accounts", "categories",
  "recurring", "debts", "investments", "subscription", "profile",
  "rates", "privacy", "tutorial", "financeSettings",
]);

export default async function FinanceBrowserScreen({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!browserScreens.has(screen)) notFound();
  redirect(screen === "home" ? "/app" : `/app/${screen}`);
}
