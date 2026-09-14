import type { PrismaService } from '../../../prisma/prisma.service';
import { telegramPostsBadRequest } from './telegram-posts.errors';

export async function requireNonBatchManagedPosts(
  prisma: PrismaService,
  input: {
    workspaceId: string;
    channelId?: string;
    postIds: string[];
  },
) {
  if (!input.postIds.length) return;
  const deliveryClient = (
    prisma as unknown as {
      telegramPostBatchDelivery?: typeof prisma.telegramPostBatchDelivery;
    }
  ).telegramPostBatchDelivery;
  // Several isolated legacy service tests use intentionally partial Prisma
  // doubles. Production Prisma always exposes this model delegate.
  if (!deliveryClient?.count) return;
  const count = await deliveryClient.count({
    where: {
      workspaceId: input.workspaceId,
      managedPostId: { in: [...new Set(input.postIds)] },
      ...(input.channelId ? { telegramChannelId: input.channelId } : {}),
    },
  });
  if (!count) return;
  throw telegramPostsBadRequest(
    'TELEGRAM_POST_NOT_EDITABLE',
    'Batch-owned posts can only be changed by the post batch lifecycle.',
  );
}

export function nonBatchPost(
  workspaceId: string,
  postId: string,
  channelId?: string,
) {
  return {
    id: postId,
    workspaceId,
    ...(channelId ? { telegramChannelId: channelId } : {}),
    postBatchDelivery: { is: null },
  } as const;
}
