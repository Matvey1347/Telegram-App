import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_STAGE: Record<string, string> = {
  TELEGRAM_POSTING_TEXT: 'text',
  TELEGRAM_POSTING_IMAGE: 'image',
  TELEGRAM_POSTING_PLAN: 'planning',
  TELEGRAM_POSTING_REVIEW: 'checks',
};

@Injectable()
export class TelegramAiPostingAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async read(
    userId: string,
    channelId: string,
    query: { from?: string; to?: string },
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const today = new Date();
    const end = query.to ? parseDate(query.to) : utcDate(today);
    const start = query.from
      ? parseDate(query.from)
      : new Date(end.getTime() - 29 * DAY_MS);
    const exclusiveEnd = new Date(end.getTime() + DAY_MS);
    // AiUsageRetentionService retains the detailed operation ledger for 90 days.
    // Keep selectable analytics within the period where operation details exist.
    if (start > end || end.getTime() - start.getTime() >= 90 * DAY_MS)
      throw new BadRequestException('AI_POSTING_ANALYTICS_RANGE_INVALID');
    const sevenDaysAgo = new Date(utcDate(today).getTime() - 6 * DAY_MS);
    const channelScope = `TELEGRAM_CHANNEL:${channelId}`;
    const [
      totals,
      stageRows,
      modeRows,
      rejected,
      readyRows,
      forecast,
      settings,
      budgets,
    ] = await Promise.all([
      this.prisma.$queryRaw<Aggregate[]>(Prisma.sql`
          SELECT COUNT(*)::int AS operations,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failedOperations,
            COUNT(*) FILTER (WHERE COALESCE("aiPostingAttempt", 1) > 1)::int AS retryOperations,
            COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" NOT IN ('NOT_SENT', 'MANUAL'))::int AS unpricedOperations,
            COALESCE(SUM("actualCost"), 0)::text AS knownCost
          FROM "AiOperation"
          WHERE "workspaceId" = ${workspaceId} AND "aiPostingChannelId" = ${channelId}
            AND "createdAt" >= ${start} AND "createdAt" < ${exclusiveEnd}`),
      this.prisma.$queryRaw<StageAggregate[]>(Prisma.sql`
          SELECT category AS stage,
            COUNT(*)::int AS operations,
            COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" NOT IN ('NOT_SENT', 'MANUAL'))::int AS unpricedOperations,
            COALESCE(SUM("actualCost"), 0)::text AS knownCost
          FROM "AiOperation"
          WHERE "workspaceId" = ${workspaceId} AND "aiPostingChannelId" = ${channelId}
            AND "createdAt" >= ${start} AND "createdAt" < ${exclusiveEnd}
          GROUP BY category`),
      this.prisma.$queryRaw<ModeAggregate[]>(Prisma.sql`
          SELECT COALESCE("aiPostingMode", 'TEST') AS mode,
            COUNT(*)::int AS operations,
            COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" NOT IN ('NOT_SENT', 'MANUAL'))::int AS unpricedOperations,
            COALESCE(SUM("actualCost"), 0)::text AS knownCost
          FROM "AiOperation"
          WHERE "workspaceId" = ${workspaceId} AND "aiPostingChannelId" = ${channelId}
            AND "createdAt" >= ${start} AND "createdAt" < ${exclusiveEnd}
          GROUP BY "aiPostingMode"`),
      this.prisma.$queryRaw<Aggregate[]>(Prisma.sql`
          WITH rejected AS (
            SELECT r.id, r."workspaceId", r."telegramChannelId", r."createdAt",
              p.ordinal - 1 AS publication_index,
              p.item->'costs'->>'planning' AS allocated_planning_cost
            FROM "TelegramAiPostingTestRun" r
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(r."publications") = 'array'
                  THEN r."publications"
                WHEN jsonb_typeof(r."publications") = 'object'
                  AND jsonb_typeof(r."publications"->'items') = 'array'
                  THEN r."publications"->'items'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY p(item, ordinal)
            WHERE r."workspaceId" = ${workspaceId} AND r."telegramChannelId" = ${channelId}
              AND r."createdAt" >= ${start} AND r."createdAt" < ${exclusiveEnd}
              AND p.item->>'status' = 'REJECTED'
          ), rejected_operations AS (
            SELECT o."actualCost", o."pricingStatus"
            FROM "AiOperation" o JOIN rejected r
              ON r.id = o."aiPostingTestRunId" AND r.publication_index = o."aiPostingPublicationIndex"
            WHERE o."workspaceId" = ${workspaceId} AND o."aiPostingChannelId" = ${channelId}
              AND o."aiPostingMode" = 'TEST'
          ), rejected_planning AS (
            SELECT allocated_planning_cost FROM rejected WHERE allocated_planning_cost IS NOT NULL
          )
          SELECT
            (SELECT COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" NOT IN ('NOT_SENT', 'MANUAL')) FROM rejected_operations)::int
              + (SELECT COUNT(*) FROM rejected WHERE allocated_planning_cost IS NULL)::int AS unpricedOperations,
            (COALESCE((SELECT SUM("actualCost") FROM rejected_operations), 0)
              + COALESCE((SELECT SUM(allocated_planning_cost::numeric) FROM rejected_planning), 0))::text AS knownCost`),
      this.prisma.$queryRaw<ReadyAggregate[]>(Prisma.sql`
          SELECT COUNT(*)::int AS readyPosts,
            COUNT(*) FILTER (WHERE g."planningCost" IS NULL OR g."textCost" IS NULL OR g."imageCost" IS NULL OR g."reviewCost" IS NULL)::int AS unpricedReadyPosts,
            COALESCE(SUM(COALESCE(g."planningCost", 0) + COALESCE(g."textCost", 0) + COALESCE(g."imageCost", 0) + COALESCE(g."reviewCost", 0)), 0)::text AS knownCost
          FROM "TelegramAiPostingGeneration" g
          JOIN "TelegramManagedPost" p ON p.id = g."managedPostId" AND p.status = 'DRAFT'
          WHERE g."workspaceId" = ${workspaceId} AND g."telegramChannelId" = ${channelId}
            AND g."createdAt" >= ${start} AND g."createdAt" < ${exclusiveEnd}`),
      this.prisma.$queryRaw<Aggregate[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE "actualCost" IS NULL AND "pricingStatus" NOT IN ('NOT_SENT', 'MANUAL'))::int AS unpricedOperations,
            COALESCE(SUM("actualCost"), 0)::text AS knownCost
          FROM "AiOperation"
          WHERE "workspaceId" = ${workspaceId} AND "aiPostingChannelId" = ${channelId}
            AND "createdAt" >= ${sevenDaysAgo} AND "createdAt" < ${new Date(utcDate(today).getTime() + DAY_MS)}`),
      this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: { aiDailyBudget: true, aiMonthlyBudget: true },
      }),
      this.prisma.aiBudgetPeriod.findMany({
        where: {
          workspaceId,
          scope: channelScope,
          OR: [
            { period: 'DAY', periodStart: utcDate(today) },
            { period: 'MONTH', periodStart: utcMonth(today) },
          ],
        },
        select: { period: true, spent: true, reserved: true },
      }),
    ]);

    const summary = totals[0] ?? emptyAggregate();
    const rejectedTotal = rejected[0] ?? emptyAggregate();
    const forecastTotal = forecast[0] ?? emptyAggregate();
    const readyTotal = readyRows[0] ?? {
      readyPosts: 0,
      unpricedReadyPosts: 0,
      knownCost: '0',
    };
    const readyPosts = Number(readyTotal.readyPosts ?? 0);
    const daily = budgets.find((item) => item.period === 'DAY');
    const monthly = budgets.find((item) => item.period === 'MONTH');
    const knownCost = decimalString(summary.knownCost);
    const monthlyKnown = new Prisma.Decimal(forecastTotal.knownCost ?? '0')
      .mul(30)
      .div(7)
      .toDecimalPlaces(12)
      .toString();
    return {
      channelId,
      currency: 'USD' as const,
      from: isoDate(start),
      to: isoDate(end),
      expenses: {
        knownCost,
        unpricedOperations: Number(summary.unpricedOperations ?? 0),
        operations: Number(summary.operations ?? 0),
        failedOperations: Number(summary.failedOperations ?? 0),
        retryOperations: Number(summary.retryOperations ?? 0),
      },
      byStage: stageRows.map((row) => ({
        stage: CATEGORY_STAGE[row.stage] ?? 'other',
        knownCost: decimalString(row.knownCost),
        operations: Number(row.operations),
        unpricedOperations: Number(row.unpricedOperations),
      })),
      byMode: modeRows.map((row) => ({
        mode: row.mode === 'AUTOMATIC' ? 'AUTOMATIC' : 'TEST',
        knownCost: decimalString(row.knownCost),
        operations: Number(row.operations),
        unpricedOperations: Number(row.unpricedOperations),
      })),
      rejectedTests: {
        knownCost: decimalString(rejectedTotal.knownCost),
        unpricedOperations: Number(rejectedTotal.unpricedOperations ?? 0),
      },
      readyPosts,
      unpricedReadyPosts: Number(readyTotal.unpricedReadyPosts ?? 0),
      costPerReadyPost:
        readyPosts > 0 && Number(readyTotal.unpricedReadyPosts ?? 0) === 0
          ? new Prisma.Decimal(readyTotal.knownCost ?? '0')
              .div(readyPosts)
              .toDecimalPlaces(12)
              .toString()
          : null,
      monthlyForecast: {
        knownCost: monthlyKnown,
        unpricedOperations: Number(forecastTotal.unpricedOperations ?? 0),
        basisDays: 7,
      },
      budgets: {
        daily: budgetView(daily, settings?.aiDailyBudget?.toString() ?? null),
        monthly: budgetView(
          monthly,
          settings?.aiMonthlyBudget?.toString() ?? null,
        ),
      },
    };
  }
}

type Aggregate = {
  knownCost: string | null;
  unpricedOperations: number | bigint | null;
  operations?: number | bigint;
  failedOperations?: number | bigint;
  retryOperations?: number | bigint;
};
type StageAggregate = Aggregate & { stage: string };
type ModeAggregate = Aggregate & { mode: string | null };
type ReadyAggregate = {
  readyPosts: number | bigint;
  unpricedReadyPosts: number | bigint;
  knownCost: string | null;
};

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || isoDate(date) !== value)
    throw new BadRequestException('AI_POSTING_ANALYTICS_DATE_INVALID');
  return date;
}
function utcDate(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
function utcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
function decimalString(value: string | null | undefined) {
  return new Prisma.Decimal(value ?? '0').toFixed(12);
}
function emptyAggregate(): Aggregate {
  return { knownCost: '0', unpricedOperations: 0, operations: 0 };
}
function budgetView(
  value: { spent: Prisma.Decimal; reserved: Prisma.Decimal } | undefined,
  limit: string | null,
) {
  const spent = value?.spent ?? new Prisma.Decimal(0);
  const reserved = value?.reserved ?? new Prisma.Decimal(0);
  const numericLimit = limit === null ? null : new Prisma.Decimal(limit);
  const remaining = numericLimit?.sub(spent).sub(reserved);
  return {
    limit,
    spent: spent.toFixed(12),
    reserved: reserved.toFixed(12),
    remaining:
      remaining === undefined
        ? null
        : remaining.gt(0)
          ? remaining.toFixed(12)
          : '0.000000000000',
    exhausted: numericLimit !== null && spent.add(reserved).gte(numericLimit),
  };
}
