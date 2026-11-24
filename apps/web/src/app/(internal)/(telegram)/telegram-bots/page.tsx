import { TelegramBotsPage } from "@/components/features/telegram/telegram-bots/telegram-bots-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return <TelegramBotsPage tab={tab === "support" ? "support" : "bots"} />;
}
