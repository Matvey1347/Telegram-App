import { notFound } from "next/navigation";
import { FinanceBotAdmin } from "@/components/features/telegram/telegram-bots/finance/finance-bot-admin";
import { isFinanceBotSection } from "@/components/features/telegram/telegram-bots/finance/finance-bot-admin-routes";
import { publicWebEnvironment } from "@/config/public-env";

export default async function FinanceBotAdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string; section: string }>;
  searchParams: Promise<{ environment?: string }>;
}) {
  const [{ botId, section }, { environment }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!isFinanceBotSection(section)) notFound();
  const selected =
    environment === "LOCAL" || environment === "PRODUCTION"
      ? environment
      : publicWebEnvironment.databaseEnvironment === "local"
        ? "LOCAL"
        : "PRODUCTION";
  return (
    <FinanceBotAdmin botId={botId} environment={selected} section={section} />
  );
}
