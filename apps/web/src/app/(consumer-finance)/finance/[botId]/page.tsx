import type { Metadata } from "next";
import { ConsumerFinanceApp } from '@/components/features/finance/consumer-finance/consumer-finance-app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ botId: string }>;
}): Promise<Metadata> {
  const { botId } = await params;
  const encodedBotId = encodeURIComponent(botId);
  return {
    title: "Finance",
    description: "Track income, expenses, accounts, and plans in Finance.",
    applicationName: "Finance",
    manifest: `/finance/${encodedBotId}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Finance",
    },
    icons: {
      icon: "/brand/favicon-finance.png",
      shortcut: "/brand/favicon-finance.png",
      apple: "/brand/finance-apple-touch.png",
    },
  };
}

export default async function FinanceMiniAppPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <ConsumerFinanceApp botId={botId} />;
}
