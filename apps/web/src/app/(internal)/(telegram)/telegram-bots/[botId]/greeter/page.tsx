import { GreeterPage } from "@greeter/web/components/app/greeter-page";

export default async function Page({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  return <GreeterPage botId={botId} />;
}
