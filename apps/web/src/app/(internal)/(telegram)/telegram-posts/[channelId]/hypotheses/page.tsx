import { TelegramPostsPageClient } from "@/components/features/telegram/telegram/posts-workspace/telegram-posts-page-client";

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
