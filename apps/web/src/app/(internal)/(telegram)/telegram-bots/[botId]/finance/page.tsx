import { redirect } from "next/navigation";
import { financeBotAdminHref } from "@/components/features/telegram/telegram-bots/finance/finance-bot-admin-routes";

export default async function FinanceBotAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ environment?: string }>;
}) {
  const [{ botId }, { environment }] = await Promise.all([params, searchParams]);
  redirect(financeBotAdminHref(botId, "overview", environment));
}
