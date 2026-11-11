import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PerformancePostInput } from './telegram-post-performance-math';

export async function flagCrossPromotionPosts(
  prisma: PrismaService,
  channelId: string,
  rows: PerformancePostInput[],
): Promise<PerformancePostInput[]> {
  const managedIds = [
    ...new Set(rows.flatMap((row) => row.managedPosts.map((item) => item.id))),
  ];
  const crossPromoted = new Set<string>();
  for (let offset = 0; offset < managedIds.length; offset += 500) {
    const batch = managedIds.slice(offset, offset + 500);
    if (!batch.length) continue;
    const matching = await prisma.$queryRaw<Array<{ managedPostId: string }>>(
      Prisma.sql`
        SELECT DISTINCT placement.value->>'managedPostId' AS "managedPostId"
        FROM "CrossPromotionPlan" plan
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(plan."placementPostIds") = 'array'
            THEN plan."placementPostIds" ELSE '[]'::jsonb END
        ) placement(value)
        WHERE placement.value->>'telegramChannelId' = ${channelId}
          AND placement.value->>'managedPostId' IN (${Prisma.join(batch)})
      `,
    );
    matching.forEach((item) => crossPromoted.add(item.managedPostId));
  }
  return rows.map((row) => {
    const managedPosts = row.managedPosts.map((managedPost) => ({
      ...managedPost,
      crossPromotion: crossPromoted.has(managedPost.id),
    }));
    return {
      ...row,
      managedPosts,
      crossPromotion: managedPosts.some(
        (managedPost) => managedPost.crossPromotion,
      ),
    };
  });
}
