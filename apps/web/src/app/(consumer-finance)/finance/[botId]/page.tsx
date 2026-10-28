import type { Metadata } from "next";
import { ConsumerFinanceApp } from "@consumer-finance/web/components/app/consumer-finance-app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ botId: string }>;
}): Promise<Metadata> {
  const { botId } = await params;
  const encodedBotId = encodeURIComponent(botId);
  const faviconUrl = "/brand/groshly-icon.png";
  return {
    title: "Groshly",
    description: "Track income, expenses, accounts, and plans in Finance.",
    applicationName: "Groshly",
    manifest: `/finance/${encodedBotId}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Groshly",
    },
    icons: {
      icon: faviconUrl,
      shortcut: faviconUrl,
      apple: faviconUrl,
    },
  };
}

export default async function FinanceMiniAppPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  return <ConsumerFinanceApp botId={botId} />;
}
