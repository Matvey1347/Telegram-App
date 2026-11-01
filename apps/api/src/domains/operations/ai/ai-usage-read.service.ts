import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type AiOperation } from '@prisma/client';
import type {
  AiCategory,
  AiOperationsPage,
  AiProvider,
  AiUsageDashboard,
  AiUsageFilter,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { AiModelRegistry } from './ai-model-registry';
import { mapAiOperationView } from './ai-operation-presentation';
import {
  usageAggregateQuery,
  type UsageAggregateRow,
} from './ai-usage-aggregate';
import { usageBudgets } from './ai-usage-budget';
import {
  DAY_MS,
  decodeOperationCursor,
  dimensionFilter,
  operationStatusFilter,
  usageRange,
  usageTotals,
  utcDay,
  validateUsageFilters,
  type OperationCursor,
} from './ai-usage-read.helpers';

@Injectable()
export class AiUsageReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly registry: AiModelRegistry,
  ) {}

  private async workspace(userId: string, query: AiUsageFilter) {
    const access = await this.authorization.require(
      userId,
      'operations.viewAiUsage',
    );
    if (query.workspaceId && query.workspaceId !== access.workspaceId)
      throw new ForbiddenException('Select the requested workspace first');
    validateUsageFilters(
      query,
      this.registry.models().map((model) => model.modelId),
    );
    return access.workspaceId;
  }

  async dashboard(
    userId: string,
    query: AiUsageFilter,
  ): Promise<AiUsageDashboard> {
    const workspaceId = await this.workspace(userId, query);
    const now = new Date();
    const range = usageRange(query, now);
    const day = utcDay(now);
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [rows, outstanding, config, categoryConfig, periods] =
      await Promise.all([
        this.prisma.$queryRaw<UsageAggregateRow[]>(
          usageAggregateQuery(workspaceId, query, range, now),
        ),
        this.prisma.$queryRaw<
          Array<{ pending: bigint; unresolved: bigint }>
        >(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE "status" = 'RUNNING' AND "deadlineAt" > ${now}) AS pending,
          COUNT(*) FILTER (WHERE "status" = 'UNKNOWN' OR "deadlineAt" <= ${now}) AS unresolved
        FROM "AiOperation" WHERE "workspaceId" = ${workspaceId} AND "status" IN ('RUNNING', 'UNKNOWN')
          ${dimensionFilter(query)}`),
        this.prisma.aiWorkspaceConfig.findUnique({ where: { workspaceId } }),
        query.category
          ? this.prisma.aiCategoryConfig.findUnique({
              where: {
                workspaceId_category: { workspaceId, category: query.category },
              },
            })
          : Promise.resolve(null),
        this.prisma.aiBudgetPeriod.findMany({
          where: {
            workspaceId,
            scope: {
              in: query.category
                ? ['WORKSPACE', query.category]
                : ['WORKSPACE'],
            },
            OR: [
              { period: 'DAY', periodStart: day },
              { period: 'MONTH', periodStart: month },
            ],
          },
        }),
      ]);
    const summary = (key: string) =>
      usageTotals(
        rows.find((row) => row.kind === 'summary' && row.key === key),
      );
    const dates = Array.from(
      {
        length: Math.round(
          (range.end.getTime() - range.from.getTime()) / DAY_MS,
        ),
      },
      (_, index) =>
        new Date(range.from.getTime() + index * DAY_MS)
          .toISOString()
          .slice(0, 10),
    );
    return {
      workspaceId,
      currency: 'USD',
      from: range.from.toISOString().slice(0, 10),
      to: range.to,
      asOf: now.toISOString(),
      summary: {
        today: summary('today'),
        sevenDays: summary('sevenDays'),
        thirtyDays: summary('thirtyDays'),
        month: summary('month'),
        selected: summary('selected'),
      },
      timeline: dates.map((date) => ({
        date,
        ...usageTotals(
          rows.find((row) => row.kind === 'timeline' && row.key === date),
        ),
      })),
      byFeature: rows
        .filter((row) => row.kind === 'feature')
        .map((row) => ({
          category: row.key as AiCategory,
          ...usageTotals(row),
        }))
        .sort((a, b) => a.category.localeCompare(b.category)),
      byModel: rows
        .filter((row) => row.kind === 'model')
        .map((row) => ({
          model: row.key,
          provider: row.provider as AiProvider,
          ...usageTotals(row),
        }))
        .sort((a, b) => a.model.localeCompare(b.model)),
      budgets: usageBudgets(
        now,
        query.category,
        config,
        categoryConfig,
        periods,
      ),
      pendingRequests: Number(outstanding[0]?.pending ?? 0),
      unresolvedRequests: Number(outstanding[0]?.unresolved ?? 0),
    };
  }

  async operations(
    userId: string,
    query: AiUsageFilter & {
      cursor?: string;
      limit?: number;
      unresolved?: boolean;
      businessScope?: 'ALL' | 'CANDIDATE_FIRST_OFFER';
    },
  ): Promise<AiOperationsPage> {
    const workspaceId = await this.workspace(userId, query);
    const now = new Date();
    // Held operations outlive detail retention. This explicit mode ignores date
    // filters so administrators can discover and reconcile every retained hold.
    const range = query.unresolved ? null : usageRange(query, now);
    const cursor = decodeOperationCursor(query.cursor);
    const requestedLimit = query.limit ?? (query.unresolved ? 32 : 25);
    const limit = query.unresolved
      ? Math.min(requestedLimit, 32)
      : requestedLimit;
    if (
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 50
    )
      throw new BadRequestException(
        'AI operations limit must be between 1 and 50',
      );
    const rows = await this.prisma.$queryRaw<AiOperation[]>(Prisma.sql`
      SELECT "id", "operationId", "workspaceId", "category", "provider", "model", "providerModel",
        "createdAt", "finishedAt", "deadlineAt", "status", "pricingStatus", "actualCost", "reservedCost",
        "inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteTokens", "reasoningTokens", "totalTokens",
        "durationMs", "errorCategory", "pricingVersion", "pricingEffectiveAt", "businessObjectId"
      FROM "AiOperation" WHERE "workspaceId" = ${workspaceId}
        ${range ? Prisma.sql`AND "createdAt" >= ${range.from} AND "createdAt" < ${range.end}` : Prisma.sql`AND "status" IN ('RUNNING', 'UNKNOWN')`}
        ${dimensionFilter(query)} ${operationStatusFilter(query.status, now)}
        ${query.businessScope === 'CANDIDATE_FIRST_OFFER' ? Prisma.sql`AND "category"='SALES_FIRST_DRAFT' AND "businessObjectId" LIKE 'lead-candidate-draft:%'` : Prisma.empty}
        ${cursor ? Prisma.sql`AND ("createdAt", "id") < (${new Date(cursor.at)}, ${cursor.id})` : Prisma.empty}
      ORDER BY "createdAt" DESC, "id" DESC LIMIT ${limit + 1}`);
    const hasMore = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((row) => mapAiOperationView(row, now));
    const last = items.at(-1);
    const next: OperationCursor | null =
      hasMore && last
        ? { v: 1, kind: 'ai-operations', at: last.createdAt, id: last.id }
        : null;
    return {
      items,
      hasMore,
      nextCursor: next
        ? Buffer.from(JSON.stringify(next)).toString('base64url')
        : null,
    };
  }
}
