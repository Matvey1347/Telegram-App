import { PrismaService } from '../../../prisma/prisma.service';

type HydratedTelegramPostMetrics = {
  id: string;
  telegramMessageId: string;
  viewsCount: number | null;
  forwardsCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  postDate: Date;
};

export type SaleWithManagedPostMetrics = {
  placements: Array<{
    telegramChannelId: string;
    managedPost?: { telegramMessageIds: string[] } | null;
    telegramPost?: HydratedTelegramPostMetrics | null;
  }>;
};

export async function hydrateManagedTelegramPosts(
  prisma: PrismaService,
  workspaceId: string,
  sales: SaleWithManagedPostMetrics[],
) {
  const managedPostKeys = new Map<
    string,
    { telegramChannelId: string; telegramMessageId: string }
  >();
  for (const sale of sales) {
    for (const placement of sale.placements) {
      for (const telegramMessageId of placement.managedPost
        ?.telegramMessageIds ?? []) {
        managedPostKeys.set(
          `${placement.telegramChannelId}:${telegramMessageId}`,
          {
            telegramChannelId: placement.telegramChannelId,
            telegramMessageId,
          },
        );
      }
    }
  }
  if (!managedPostKeys.size) return;
  const telegramPosts = await prisma.telegramPost.findMany({
    where: { workspaceId, OR: [...managedPostKeys.values()] },
    select: {
      id: true,
      telegramChannelId: true,
      telegramMessageId: true,
      viewsCount: true,
      forwardsCount: true,
      reactionsCount: true,
      commentsCount: true,
      postDate: true,
    },
  });
  const posts = new Map(
    telegramPosts.map((post) => [
      `${post.telegramChannelId}:${post.telegramMessageId}`,
      post,
    ]),
  );
  for (const sale of sales) {
    for (const placement of sale.placements) {
      const post = placement.managedPost?.telegramMessageIds
        .map((messageId) =>
          posts.get(`${placement.telegramChannelId}:${messageId}`),
        )
        .find(Boolean);
      if (post) placement.telegramPost = post;
    }
  }
}
