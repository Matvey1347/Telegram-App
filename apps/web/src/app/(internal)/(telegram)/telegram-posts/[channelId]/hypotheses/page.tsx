import { TelegramPostsPageClient } from "../../page";

export default async function TelegramPostsHypothesesPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  return (
    <TelegramPostsPageClient
      routeChannelId={decodeURIComponent(channelId)}
      routePostView="hypotheses"
    />
  );
}
