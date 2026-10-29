import { notFound } from "next/navigation";
import { FinanceProductPreview } from "@finance-web/components/finance-product-preview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (screen !== "home" && screen !== "analytics" && screen !== "history" && screen !== "accounts" && screen !== "debts") notFound();
  return <FinanceProductPreview screen={screen} />;
}
