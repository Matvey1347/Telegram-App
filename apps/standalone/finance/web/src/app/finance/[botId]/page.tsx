import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ botId: string }>;
}): Promise<Metadata> {
  const { botId } = await params;
  const encodedBotId = encodeURIComponent(botId);
  const favicon = "/brand/groshly-dark-icon.png";
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
export default function FinanceTelegramMiniAppPage() {
  redirect("/app");
}
