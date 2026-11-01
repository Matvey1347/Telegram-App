import { Prisma } from '@prisma/client';
import type { AiUsageFilter } from '@telegram-system/shared';
import {
  COUNTERS,
  TOKENS,
  DAY_MS,
  dimensionFilter,
  utcDay,
  type TotalRow,
  type UsageRange,
} from './ai-usage-read.helpers';
export type UsageAggregateRow = TotalRow & {
  kind: string;
  key: string;
  provider: string | null;
};

/** Aggregate the compact daily cube in Postgres, with at most 32 unsettled
 * operations per workspace added to the cube. Never load operation history. */
export function usageAggregateQuery(
  workspaceId: string,
  query: AiUsageFilter,
  range: UsageRange,
  now: Date,
): Prisma.Sql {
  const today = utcDay(now);
  const seven = new Date(today.getTime() - 6 * DAY_MS);
  const thirty = new Date(today.getTime() - 29 * DAY_MS);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const min = new Date(
    Math.min(range.from.getTime(), thirty.getTime(), month.getTime()),
  );
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const sums = Prisma.join(
    [...COUNTERS, 'knownCost', ...TOKENS].map(
      (key) =>
        Prisma.sql`COALESCE(SUM(${Prisma.raw(`"${key}"`)}), 0) AS ${Prisma.raw(`"${key}"`)}`,
    ),
  );
  const pendingColumns = Prisma.join(
    TOKENS.map(
      (key) =>
        Prisma.sql`COALESCE(${Prisma.raw(`"${key}"`)}, 0)::bigint AS ${Prisma.raw(`"${key}"`)}`,
    ),
  );
  return Prisma.sql`
    WITH cube AS (
      SELECT "day", "category", "provider", "model", "status", "requests", "errors", "pricedRequests", "unpricedRequests", "unknownUsageRequests", "knownCost", ${Prisma.join(TOKENS.map((key) => Prisma.raw(`"${key}"`)))}
      FROM "AiUsageDaily" WHERE "workspaceId" = ${workspaceId} AND "day" >= ${min} AND "day" < ${tomorrow} ${dimensionFilter(query)}
      UNION ALL
      SELECT "createdAt"::date, "category", "provider", "model",
        CASE WHEN "deadlineAt" <= ${now} THEN 'UNKNOWN' ELSE 'RUNNING' END,
        1, 0, 0, CASE WHEN "deadlineAt" <= ${now} THEN 1 ELSE 0 END,
        CASE WHEN "deadlineAt" <= ${now} THEN 1 ELSE 0 END, 0::decimal, ${pendingColumns}
      FROM "AiOperation" WHERE "workspaceId" = ${workspaceId} AND "status" = 'RUNNING'
        AND "createdAt" >= ${min} AND "createdAt" < ${tomorrow} ${dimensionFilter(query)}
    ), filtered AS (SELECT * FROM cube WHERE TRUE ${query.status ? Prisma.sql`AND "status" = ${query.status}` : Prisma.empty}),
    selected AS (SELECT * FROM filtered WHERE "day" >= ${range.from} AND "day" < ${range.end})
    SELECT 'summary' AS "kind", p.name AS "key", NULL::text AS "provider", ${sums}
    FROM (VALUES ('today', ${today}::date, ${tomorrow}::date), ('sevenDays', ${seven}::date, ${tomorrow}::date),
      ('thirtyDays', ${thirty}::date, ${tomorrow}::date), ('month', ${month}::date, ${tomorrow}::date),
      ('selected', ${range.from}::date, ${range.end}::date)) p(name, start, stop)
    LEFT JOIN filtered f ON f."day" >= p.start AND f."day" < p.stop GROUP BY p.name
    UNION ALL SELECT 'timeline', TO_CHAR("day", 'YYYY-MM-DD'), NULL::text, ${sums} FROM selected GROUP BY "day"
    UNION ALL SELECT 'feature', "category", NULL::text, ${sums} FROM selected GROUP BY "category"
    UNION ALL SELECT 'model', "model", "provider", ${sums} FROM selected GROUP BY "model", "provider"`;
}
