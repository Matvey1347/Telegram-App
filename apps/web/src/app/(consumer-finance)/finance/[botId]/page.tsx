import { ConsumerFinanceApp } from '@/components/features/finance/consumer-finance/consumer-finance-app';

export const metadata = { title: "Finance" };

export default async function FinanceMiniAppPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <ConsumerFinanceApp botId={botId} />;
}
