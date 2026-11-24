import { FinanceBotAdmin } from '@/components/features/telegram/telegram-bots/finance/finance-bot-admin';
import { publicWebEnvironment } from "@/config/public-env";

export default async function FinanceBotAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ environment?: string }>;
}) {
  const [{ botId }, { environment }] = await Promise.all([params, searchParams]);
  const selected = environment === 'LOCAL' || environment === 'PRODUCTION'
    ? environment
    : publicWebEnvironment.databaseEnvironment === 'local' ? 'LOCAL' : 'PRODUCTION';
  return <FinanceBotAdmin botId={botId} environment={selected} />;
}
