import { financeBrandIcon } from "@finance-web/lib/finance-brand-icon";
import { FinanceRootApp } from "@finance-web/components/finance-root-app";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ botId: string }>;
}): Promise<Metadata> {
  const { botId } = await params;
  const encodedBotId = encodeURIComponent(botId);
  const favicon = `${financeBrandIcon("light")}?theme=light&v=2`;
  return {
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
    manifest: `/finance/${encodedBotId}/manifest.webmanifest`,
  };
}

/**
 * Telegram's existing Finance menu buttons include the logical bot ID in the
 * path. Render the application here to preserve Telegram launch parameters
 * and the scope of shortcuts installed from this path.
 */
export default function FinanceTelegramMiniAppPage() {
  return <FinanceRootApp />;
}
