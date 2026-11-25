import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

type CostBucket = 'successful' | 'failed' | 'shared';
type ReviewDrafts = { testRunId: string; indices: number[] };

export async function readAutopilotRunCosts(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  runId: string,
  reviewDrafts?: ReviewDrafts,
) {
  const readyReviewDraft = reviewDrafts?.indices.length
    ? Prisma.sql`OR ("aiPostingTestRunId" = ${reviewDrafts.testRunId}
        AND "aiPostingPublicationIndex" IN (${Prisma.join(reviewDrafts.indices)}))`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    Array<{ stage: string; bucket: CostBucket; cost: Prisma.Decimal | null; unknown: number }>
  >`
    SELECT CASE
      WHEN "configurationSnapshot"->>'promptVersion' IN ('telegram-posting-visual-review-v1', 'telegram-posting-web-image-search-v1') THEN 'search'
      WHEN category = 'TELEGRAM_POSTING_PLAN' THEN 'planning'
      WHEN category = 'TELEGRAM_POSTING_TEXT' THEN 'text'
      WHEN category = 'TELEGRAM_POSTING_IMAGE' THEN 'image'
      WHEN category = 'TELEGRAM_POSTING_REVIEW' THEN 'review'
      ELSE 'other' END AS stage,
    CASE WHEN "aiPostingManagedPostId" IS NOT NULL ${readyReviewDraft} THEN 'successful'
      WHEN "aiPostingPublicationIndex" IS NULL AND category = 'TELEGRAM_POSTING_PLAN' THEN 'shared'
      ELSE 'failed' END AS bucket,
    SUM("actualCost") AS cost,
    COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" IN ('UNKNOWN', 'UNPRICED'))::int AS unknown
    FROM "AiOperation"
    WHERE "workspaceId" = ${workspaceId} AND "aiPostingChannelId" = ${channelId}
      AND "aiPostingAutopilotRunId" = ${runId}
    GROUP BY 1, 2
  `;
  const stages = new Map<string, Prisma.Decimal>();
  const buckets = { successful: new Prisma.Decimal(0), failed: new Prisma.Decimal(0), shared: new Prisma.Decimal(0) };
  const unknownByBucket = { successful: 0, failed: 0, shared: 0 };
  let unknownCosts = 0;
  for (const row of rows) {
    if (row.cost !== null) {
      stages.set(row.stage, (stages.get(row.stage) ?? new Prisma.Decimal(0)).plus(row.cost));
      buckets[row.bucket] = buckets[row.bucket].plus(row.cost);
    }
    unknownByBucket[row.bucket] += row.unknown;
    unknownCosts += row.unknown;
  }
  return {
    costs: Object.fromEntries([...stages].map(([stage, cost]) => [stage, cost.toString()])),
    unknownCosts,
    costBreakdown: {
      successful: buckets.successful.toString(),
      failed: buckets.failed.toString(),
      shared: buckets.shared.toString(),
      unknownByBucket,
    },
  };
}
