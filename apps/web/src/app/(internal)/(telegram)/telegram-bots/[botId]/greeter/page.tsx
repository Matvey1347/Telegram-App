import { GreeterPage } from "@/components/features/telegram/telegram-bots/greeter/greeter-page";

export default async function Page({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  return <GreeterPage botId={botId} />;
}
