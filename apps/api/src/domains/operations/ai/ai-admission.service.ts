import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  AiCategory,
  AiCategoryConfiguration,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { AiModelRegistry } from './ai-model-registry';
import { AiDeploymentConfig } from './ai-deployment-config.service';
import { budgetPeriods, reservationCost } from './ai-pricing';

export type AiExecutionRequest = {
  userId: string;
  workspaceId: string;
  category: AiCategory;
  operationId: string;
  mode: 'MANUAL' | 'AUTOMATIC';
  input: string;
  /** Server-only, transient image; never persisted in operation records. */
  image?: { mime: 'image/jpeg'; data: Buffer };
  /** Restricts this experimental manual media batch to one approved source. */
  mediaPilotSourceId?: string;
  /** Trusted server instructions; never populated from a client override. */
  instructions?: string;
  businessObjectId?: string;
  /** Opt-in bounded result persistence for explicitly supported business categories. */
  durableVersion?: string;
  signal?: AbortSignal;
  /** Server-only authorization performed within the admission transaction. */
  admissionGuard?: (tx: Prisma.TransactionClient) => Promise<void>;
};
export const operationFingerprint = (request: AiExecutionRequest) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        request.category,
        request.mode,
        request.input,
        request.businessObjectId ?? null,
        ...(request.image
          ? [
              request.image.mime,
              createHash('sha256').update(request.image.data).digest('hex'),
            ]
          : []),
        ...(request.mediaPilotSourceId ? [request.mediaPilotSourceId] : []),
        ...(request.instructions !== undefined ? [request.instructions] : []),
        ...(request.durableVersion !== undefined
          ? [request.durableVersion]
          : []),
      ]),
    )
    .digest('hex');

@Injectable()
export class AiAdmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiModelRegistry,
    private readonly deployment: AiDeploymentConfig,
  ) {}
  /** Read-only replay can never create an operation or dispatch a provider. */
  async replay(request: AiExecutionRequest) {
    if (
      !request.durableVersion ||
      !request.businessObjectId ||
      !['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION'].includes(
        request.category,
      )
    )
      throw new BadRequestException('AI_REPLAY_INVALID');
    const operation = await this.prisma.aiOperation.findUnique({
      where: {
        workspaceId_operationId: {
          workspaceId: request.workspaceId,
          operationId: request.operationId,
        },
      },
    });
    if (
      !operation ||
      operation.actorUserId !== request.userId ||
      operation.category !== request.category ||
      operation.businessObjectId !== request.businessObjectId ||
      operation.fingerprint !== operationFingerprint(request) ||
      operation.expiresAt <= new Date()
    )
      throw new ConflictException('AI_REPLAY_UNAVAILABLE');
    return operation;
  }
  async admit(request: AiExecutionRequest) {
    const now = new Date();
    if (
      !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        request.operationId,
      ) ||
      (request.businessObjectId && request.businessObjectId.length > 100) ||
      Buffer.byteLength(request.input, 'utf8') +
        Buffer.byteLength(request.instructions ?? '', 'utf8') >
        256 * 1024 ||
      (request.image !== undefined &&
        (request.category !== 'LEAD_AD_CLASSIFICATION' ||
          request.durableVersion !== 'lead-media-vision-v1' ||
          request.image.mime !== 'image/jpeg' ||
          !Buffer.isBuffer(request.image.data) ||
          request.image.data.length < 3 ||
          request.image.data.length > 5 * 1024 * 1024 ||
          !request.image.data
            .subarray(0, 3)
            .equals(Buffer.from([0xff, 0xd8, 0xff])))) ||
      (request.durableVersion === 'lead-media-vision-v1' && !request.image) ||
      (request.image !== undefined &&
        (request.mode !== 'MANUAL' ||
          !request.mediaPilotSourceId ||
          request.mediaPilotSourceId.length > 100)) ||
      (request.mediaPilotSourceId !== undefined && !request.image) ||
      !['MANUAL', 'AUTOMATIC'].includes(request.mode) ||
      (request.durableVersion !== undefined &&
        (!/^[A-Za-z0-9_.-]{1,80}$/.test(request.durableVersion) ||
          !request.businessObjectId ||
          !['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION'].includes(
            request.category,
          )))
    )
      throw new BadRequestException('AI_REQUEST_INVALID');
    const fingerprint = operationFingerprint(request);
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${request.workspaceId}`,
      );
      const existing = await tx.aiOperation.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: request.workspaceId,
            operationId: request.operationId,
          },
        },
      });
      if (existing) {
        if (request.durableVersion && existing.actorUserId !== request.userId)
          throw new ConflictException('AI_OPERATION_CONFLICT');
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException('AI_OPERATION_CONFLICT');
        if (existing.expiresAt <= now)
          throw new ConflictException('AI_OPERATION_EXPIRED');
        return {
          operation: existing,
          replayed: true,
          config:
            existing.configurationSnapshot as unknown as AiCategoryConfiguration,
        };
      }
      if (request.admissionGuard) await request.admissionGuard(tx);
      if (request.operationId.slice(0, 10) !== now.toISOString().slice(0, 10))
        throw new BadRequestException('AI_OPERATION_DATE_INVALID');
      const [workspace, persisted] = await Promise.all([
        tx.aiWorkspaceConfig.findUnique({
          where: { workspaceId: request.workspaceId },
        }),
        tx.aiCategoryConfig.findUnique({
          where: {
            workspaceId_category: {
              workspaceId: request.workspaceId,
              category: request.category,
            },
          },
        }),
      ]);
      const configured = this.registry.resolve(request.category, persisted);
      const config = request.image
        ? {
            ...configured,
            schemaId: this.registry.schema(request.category, true).id,
            promptVersion: 'lead-media-vision-v1',
            mediaPilotSourceId: request.mediaPilotSourceId,
          }
        : configured;
      if (
        !this.deployment.enabled ||
        !this.deployment.configured ||
        !workspace?.enabled ||
        !config.enabled
      )
        throw new ServiceUnavailableException('AI_DISABLED');
      if (
        !workspace.dailyBudget ||
        !workspace.monthlyBudget ||
        !workspace.maxRequestCost
      )
        throw new ConflictException('AI_BUDGET_REQUIRED');
      if (
        request.mode === 'AUTOMATIC' &&
        (!workspace.automaticEnabled ||
          !config.automaticEnabled ||
          !config.dailyBudget ||
          !config.monthlyBudget)
      )
        throw new ConflictException('AI_AUTOMATIC_DISABLED');
      if (
        config.maxInputTokens < 1 ||
        config.maxInputTokens > 32768 ||
        config.maxOutputTokens < 1 ||
        config.maxOutputTokens > 8000 ||
        config.timeoutMs < 1 ||
        config.timeoutMs > 60000 ||
        config.concurrencyLimit < 1 ||
        config.concurrencyLimit > 8
      )
        throw new ConflictException('AI_CONFIG_INVALID');
      const price = this.registry.price(config.modelId);
      if (!price) throw new ConflictException('AI_MODEL_UNPRICED');
      const reservedCost = reservationCost(
        price,
        config.maxInputTokens,
        config.maxOutputTokens,
      );
      if (request.image) {
        // The existing workspace advisory lock also fences settlement and concurrent admissions.
        // Uncertain and still-running operations retain their entire reservation.
        const [pilot] = await tx.$queryRaw<
          Array<{ count: bigint; committed: Prisma.Decimal }>
        >(Prisma.sql`
          SELECT count(*)::bigint AS count,
            COALESCE(SUM(CASE WHEN status IN ('RUNNING', 'UNKNOWN') OR "actualCost" IS NULL
              THEN "reservedCost" ELSE "actualCost" END), 0) AS committed
          FROM "AiOperation"
          WHERE "workspaceId" = ${request.workspaceId}
            AND "configurationSnapshot"->>'promptVersion' = 'lead-media-vision-v1'
            AND "configurationSnapshot"->>'mediaPilotSourceId' = ${request.mediaPilotSourceId}`);
        if (
          Number(pilot.count) >= 30 ||
          pilot.committed.add(reservedCost).gt(1)
        )
          throw new ConflictException('AI_MEDIA_PILOT_BUDGET_EXHAUSTED');
      }
      if (
        reservedCost.gt(workspace.maxRequestCost) ||
        (config.maxRequestCost && reservedCost.gt(config.maxRequestCost))
      )
        throw new ConflictException('AI_REQUEST_BUDGET_EXCEEDED');
      const [active, categoryActive, unresolved] = await Promise.all([
        tx.aiOperation.count({
          where: {
            workspaceId: request.workspaceId,
            status: 'RUNNING',
            deadlineAt: { gt: now },
          },
        }),
        tx.aiOperation.count({
          where: {
            workspaceId: request.workspaceId,
            category: request.category,
            status: 'RUNNING',
            deadlineAt: { gt: now },
          },
        }),
        tx.aiOperation.count({
          where: {
            workspaceId: request.workspaceId,
            status: { in: ['RUNNING', 'UNKNOWN'] },
          },
        }),
      ]);
      if (
        active >= 8 ||
        categoryActive >= config.concurrencyLimit ||
        unresolved >= 32
      )
        throw new ServiceUnavailableException('AI_CAPACITY_EXHAUSTED');
      for (const scope of ['WORKSPACE', request.category])
        for (const period of budgetPeriods(now)) {
          const key = {
            workspaceId: request.workspaceId,
            scope,
            period: period.period,
            periodStart: period.periodStart,
          };
          const bucket = await tx.aiBudgetPeriod.upsert({
            where: { workspaceId_scope_period_periodStart: key },
            create: { ...key, periodEnd: period.periodEnd },
            update: {},
          });
          const limit =
            scope === 'WORKSPACE'
              ? period.period === 'DAY'
                ? workspace.dailyBudget
                : workspace.monthlyBudget
              : period.period === 'DAY'
                ? config.dailyBudget
                : config.monthlyBudget;
          if (
            limit !== null &&
            bucket.spent.add(bucket.reserved).add(reservedCost).gt(limit)
          )
            throw new ConflictException('AI_BUDGET_EXHAUSTED');
          await tx.aiBudgetPeriod.update({
            where: { id: bucket.id },
            data: { reserved: { increment: reservedCost } },
          });
        }
      const operation = await tx.aiOperation.create({
        data: {
          workspaceId: request.workspaceId,
          operationId: request.operationId,
          actorUserId: request.userId,
          category: request.category,
          provider: 'openai',
          model: config.modelId,
          mode: request.mode,
          fingerprint,
          status: 'RUNNING',
          pricingStatus: 'UNKNOWN',
          reservedCost,
          businessObjectId: request.businessObjectId,
          configurationSnapshot: config,
          pricingSnapshot: price,
          pricingVersion: price.version,
          pricingEffectiveAt: new Date(price.effectiveAt),
          deadlineAt: new Date(now.getTime() + config.timeoutMs),
          expiresAt: new Date(now.getTime() + 90 * 86400000),
          createdAt: now,
        },
      });
      return { operation, replayed: false, config };
    });
  }
}
