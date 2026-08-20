import { FinanceBotAdmin } from '@/components/features/telegram/telegram-bots/finance/finance-bot-admin';

export default async function FinanceBotAdminPage({ params }: { params: Promise<{ botId: string }> }) { const { botId } = await params; return <FinanceBotAdmin botId={botId} />; }
