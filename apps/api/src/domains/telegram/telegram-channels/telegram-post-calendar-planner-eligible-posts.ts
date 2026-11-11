import { PrismaService } from '../../../prisma/prisma.service';

export type EligiblePlannerPost = {
  id: string;
  title: string;
  groupId: string | null;
  groupPosition: number | null;
  createdAt: Date;
};

export async function loadEligibleTelegramPlannerPosts(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  postGroupIds: string[],
  excludePostIds: string[],
  limit: number,
  now = new Date(),
): Promise<EligiblePlannerPost[]> {
  const settings = await prisma.telegramAiPostingSettings.findFirst({
    where: { workspaceId, telegramChannelId: channelId },
    select: { draftExpirationDays: true },
  });
  const expirationDays = settings?.draftExpirationDays ?? 30;
  const expiredBefore = new Date(
    now.getTime() - expirationDays * 24 * 60 * 60 * 1000,
  );
  await prisma.telegramManagedPost.updateMany({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      origin: 'SYSTEM',
      status: 'DRAFT',
      aiPostingRecheckRequired: false,
      createdAt: { lt: expiredBefore },
      aiPostingGeneration: { isNot: null },
    },
    data: { aiPostingRecheckRequired: true },
  });
  return prisma.telegramManagedPost.findMany({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      origin: 'SYSTEM',
      status: 'DRAFT',
      aiPostingRecheckRequired: false,
      text: { not: null },
      adSalePlacements: { none: {} },
      OR: [
        { aiPostingGeneration: { is: null } },
        { createdAt: { gte: expiredBefore } },
      ],
      ...(excludePostIds.length
        ? { id: { notIn: [...new Set(excludePostIds)] } }
        : {}),
      ...(postGroupIds.length ? { groupId: { in: postGroupIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      groupId: true,
      groupPosition: true,
      createdAt: true,
    },
    orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}
