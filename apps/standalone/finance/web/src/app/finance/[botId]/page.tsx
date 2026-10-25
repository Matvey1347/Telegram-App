import type { Metadata } from "next";
import { FinanceRootApp } from "@finance-web/components/finance-root-app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ botId: string }>;
}): Promise<Metadata> {
  const { botId } = await params;
  const encodedBotId = encodeURIComponent(botId);
  const favicon = `/api/finance-bots/${encodedBotId}/branding/favicon`;
  return {
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
    manifest: `/finance/${encodedBotId}/manifest.webmanifest`,
  };
}

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
