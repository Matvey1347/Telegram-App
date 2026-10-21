import { FinanceRootApp } from "@finance-web/components/finance-root-app";

/**
 * Telegram's existing Finance menu buttons include the logical bot ID in the
 * path. The standalone Finance web host resolves the active bot securely from
 * its API session, but retains this route so those buttons open the real app
 * rather than Next's 404 page.
 */
export default async function FinanceTelegramMiniAppPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  return <FinanceRootApp botId={botId} />;
}
