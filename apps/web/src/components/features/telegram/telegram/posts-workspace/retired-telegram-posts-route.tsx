import { redirect } from "next/navigation";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";

export async function RetiredTelegramPostsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ postId?: string | string[] }>;
}) {
  const [{ channelId }, { postId }] = await Promise.all([params, searchParams]);
  redirect(buildTelegramPostsUrl({
    channelId,
    postId: typeof postId === "string" ? postId : null,
  }));
}
