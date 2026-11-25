import { AI_POSTING_SEARCH_CALL_USD, AI_POSTING_SEARCH_MODEL, AI_POSTING_SEARCH_PROMPT_VERSION } from './ai-posting-image-search';
import { MAX_TELEGRAM_AI_POSTING_BATCH_SIZE } from '@telegram-system/shared';
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
import { AiModelRegistry, TELEGRAM_POSTCARD_REVIEW_SCHEMA_ID, TELEGRAM_POSTING_DRAFT_SCHEMA_ID, TELEGRAM_POSTING_REVIEW_SCHEMA_ID } from './ai-model-registry';
import { AiDeploymentConfig } from './ai-deployment-config.service';
import { budgetPeriods, reservationCost } from './ai-pricing';
import { aiTranscriptionWavSeconds } from './ai-transcription-audio';

export type AiExecutionRequest = {
  userId: string;
  workspaceId: string;
  category: AiCategory;
  operationId: string;
  mode: 'MANUAL' | 'AUTOMATIC';
  input: string;
  /** Server-only, transient image; never persisted in operation records. */
  image?: { mime: 'image/jpeg'; data: Buffer };
  chatPlan?: boolean;
  revisionDraft?: boolean;
  postingDraft?: boolean;
  postingReview?: boolean;
  postcardReview?: boolean;
  postingImageSearch?: { domain?: string };
  postingImageSize?: '1024x1536';
  audio?: { mime: 'audio/wav'; data: Buffer };
  /** Restricts this experimental manual media batch to one approved source. */
  mediaPilotSourceId?: string;
  /** Trusted server instructions; never populated from a client override. */
  instructions?: string;
  businessObjectId?: string;
  aiPosting?: {
    channelId: string;
    testRunId?: string;
    autopilotRunId?: string;
    publicationIndex?: number;
    attempt?: number;
    postingMode: 'TEST' | 'AUTOMATIC';
    dailyBudget?: string | null;
    monthlyBudget?: string | null;
  };
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
        request.chatPlan === true,
        request.revisionDraft === true,
        ...(request.postingDraft ? [TELEGRAM_POSTING_DRAFT_SCHEMA_ID] : []),
        ...(request.postcardReview ? [TELEGRAM_POSTCARD_REVIEW_SCHEMA_ID] : []),
        ...(request.postingImageSize ? [request.postingImageSize] : []),
        ...(request.postingReview ? [TELEGRAM_POSTING_REVIEW_SCHEMA_ID] : []),
        ...(request.postingImageSearch ? [AI_POSTING_SEARCH_PROMPT_VERSION, request.postingImageSearch.domain ?? null] : []),
        request.businessObjectId ?? null,
        request.aiPosting
          ? {
              channelId: request.aiPosting.channelId,
              testRunId: request.aiPosting.testRunId ?? null,
              autopilotRunId: request.aiPosting.autopilotRunId ?? null,
              publicationIndex: request.aiPosting.publicationIndex ?? null,
              attempt: request.aiPosting.attempt ?? null,
              postingMode: request.aiPosting.postingMode,
            }
          : null,
        ...(request.image
          ? [
              request.image.mime,
              createHash('sha256').update(request.image.data).digest('hex'),
            ]
          : []),
        ...(request.audio
          ? [
              request.audio.mime,
              createHash('sha256').update(request.audio.data).digest('hex'),
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
  private readonly postingAdmissions = new Map<string, Promise<void>>();

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
    if (!request.aiPosting) return this.admitOperation(request);

    // Queue before opening a transaction. Parallel slots otherwise spend their
    // transaction time waiting for the same workspace advisory lock.
    const previous = this.postingAdmissions.get(request.workspaceId) ??
      Promise.resolve();
    const admission = previous.then(() => this.admitOperation(request));
    const tail = admission.then(() => undefined, () => undefined);
    this.postingAdmissions.set(request.workspaceId, tail);
    try {
      return await admission;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2024', 'P2028'].includes(error.code))
        throw new ServiceUnavailableException('AI_ADMISSION_TIMEOUT');
      throw error;
    } finally {
      if (this.postingAdmissions.get(request.workspaceId) === tail)
        this.postingAdmissions.delete(request.workspaceId);
    }
  }

  private async admitOperation(request: AiExecutionRequest) {
    const now = new Date();
    if (request.postingImageSearch && (
      request.category !== 'TELEGRAM_POSTING_REVIEW' || !request.aiPosting || request.image || request.audio ||
      request.postingReview || request.durableVersion || request.input.length > 2400 ||
      (request.postingImageSearch.domain !== undefined && !/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/u.test(request.postingImageSearch.domain))
    )) throw new BadRequestException('AI_POSTING_IMAGE_SEARCH_INVALID');
    if (
      request.chatPlan &&
      (request.category !== 'TELEGRAM_POSTING_PLAN' ||
        request.mode !== 'MANUAL' ||
        !request.aiPosting ||
        request.image ||
        request.audio)
    )
      throw new BadRequestException('AI_CHAT_PLAN_INVALID');
    if (
      request.revisionDraft &&
      (request.category !== 'TELEGRAM_POSTING_TEXT' ||
        request.mode !== 'MANUAL' ||
        !request.aiPosting ||
        request.image ||
        request.audio ||
        request.chatPlan)
    )
      throw new BadRequestException('AI_REVISION_DRAFT_INVALID');
    if (
      request.postingDraft &&
      (request.category !== 'TELEGRAM_POSTING_TEXT' ||
        !request.aiPosting ||
        request.image ||
        request.audio ||
        request.chatPlan ||
        request.revisionDraft)
    )
      throw new BadRequestException('AI_POSTING_DRAFT_CATEGORY_INVALID');
    if (request.postingReview && (
      request.category !== 'TELEGRAM_POSTING_REVIEW' || !request.aiPosting ||
      request.image || request.audio || request.chatPlan || request.revisionDraft || request.postingDraft
    ))
      throw new BadRequestException('AI_POSTING_REVIEW_CATEGORY_INVALID');
    if (request.postcardReview && (request.category !== 'TELEGRAM_POSTING_REVIEW' || !request.aiPosting || !request.image))
      throw new BadRequestException('AI_POSTCARD_REVIEW_CATEGORY_INVALID');
    const audioInvalid =
      request.audio !== undefined &&
      (request.category !== 'TELEGRAM_POSTING_PLAN' ||
        request.mode !== 'MANUAL' ||
        !request.aiPosting ||
        !!request.image ||
        !!request.durableVersion ||
        !!request.mediaPilotSourceId ||
        request.audio.mime !== 'audio/wav' ||
        aiTranscriptionWavSeconds(request.audio.data) === null);
    const imagePayloadInvalid =
      request.image !== undefined &&
      (![
        'LEAD_AD_CLASSIFICATION',
        'TELEGRAM_POSTING_IMAGE',
        'TELEGRAM_POSTING_PLAN',
        'TELEGRAM_POSTING_REVIEW',
      ].includes(request.category) ||
        (request.category === 'TELEGRAM_POSTING_PLAN' &&
          (request.mode !== 'MANUAL' ||
            !request.aiPosting ||
            request.durableVersion !== undefined ||
            request.mediaPilotSourceId !== undefined)) ||
        (request.category === 'TELEGRAM_POSTING_REVIEW' &&
          (!request.aiPosting || request.durableVersion !== undefined || request.mediaPilotSourceId !== undefined)) ||
        (request.category === 'LEAD_AD_CLASSIFICATION' &&
          request.durableVersion !== 'lead-media-vision-v1') ||
        (request.category === 'TELEGRAM_POSTING_IMAGE' &&
          (request.durableVersion !== undefined ||
            request.mediaPilotSourceId !== undefined)) ||
        request.image.mime !== 'image/jpeg' ||
        !Buffer.isBuffer(request.image.data) ||
        request.image.data.length < 3 ||
        request.image.data.length > 5 * 1024 * 1024 ||
        !request.image.data
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff])));
    if (
      !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        request.operationId,
      ) ||
      (request.businessObjectId && request.businessObjectId.length > 100) ||
      (request.aiPosting !== undefined &&
        (!/^[A-Za-z0-9_-]{1,100}$/.test(request.aiPosting.channelId) ||
          request.businessObjectId !== request.aiPosting.channelId ||
          (request.aiPosting.testRunId !== undefined &&
            !/^[A-Za-z0-9_-]{1,100}$/.test(request.aiPosting.testRunId)) ||
          (request.aiPosting.autopilotRunId !== undefined &&
            !/^[A-Za-z0-9_-]{1,100}$/.test(request.aiPosting.autopilotRunId)) ||
          (request.aiPosting.publicationIndex !== undefined &&
            (!Number.isInteger(request.aiPosting.publicationIndex) ||
              request.aiPosting.publicationIndex < 0 ||
              request.aiPosting.publicationIndex >= MAX_TELEGRAM_AI_POSTING_BATCH_SIZE)) ||
          (request.aiPosting.attempt !== undefined &&
            (!Number.isInteger(request.aiPosting.attempt) ||
              request.aiPosting.attempt < 1 ||
              request.aiPosting.attempt > 20)) ||
          !['TEST', 'AUTOMATIC'].includes(request.aiPosting.postingMode))) ||
      Buffer.byteLength(request.input, 'utf8') +
        Buffer.byteLength(request.instructions ?? '', 'utf8') >
        256 * 1024 ||
      imagePayloadInvalid ||
      audioInvalid ||
      (request.durableVersion === 'lead-media-vision-v1' && !request.image) ||
      (request.image !== undefined &&
        request.category === 'LEAD_AD_CLASSIFICATION' &&
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
      if (this.deployment.usageSource === 'LOCAL_UNSYNCED') {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock_shared(hashtextextended('local-ai-snapshot', 0))`,
        );
      }
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
      if (!this.registry.supports(request.category, configured.modelId))
        throw new ConflictException('AI_MODEL_CATEGORY_UNSUPPORTED');
      const config = request.postingImageSearch
        ? { ...configured, modelId: AI_POSTING_SEARCH_MODEL, promptVersion: AI_POSTING_SEARCH_PROMPT_VERSION, maxOutputTokens: 512 }
        : request.audio
        ? {
            ...configured,
            modelId: 'gpt-transcribe',
            schemaId: 'telegram_posting_chat_audio_v1',
            promptVersion: 'telegram-posting-chat-audio-v1',
          }
        : request.image && request.category === 'LEAD_AD_CLASSIFICATION'
          ? {
              ...configured,
              schemaId: this.registry.schema(request.category, true).id,
              promptVersion: 'lead-media-vision-v1',
              mediaPilotSourceId: request.mediaPilotSourceId,
            }
          : request.image && request.category === 'TELEGRAM_POSTING_PLAN'
            ? {
                ...configured,
                modelId: 'gpt-5.4-mini-2026-03-17',
                schemaId: this.registry.schema(request.category, true).id,
                promptVersion: 'telegram-posting-chat-vision-v1',
              }
            : request.image && request.category === 'TELEGRAM_POSTING_REVIEW'
              ? {
                  ...configured,
                  modelId: 'gpt-5.4-mini-2026-03-17',
                  schemaId: request.postcardReview ? TELEGRAM_POSTCARD_REVIEW_SCHEMA_ID : this.registry.schema(request.category, true).id,
                  promptVersion: request.postcardReview ? 'telegram-postcard-visual-review-v1' : 'telegram-posting-visual-review-v1',
                  maxOutputTokens: Math.min(configured.maxOutputTokens, request.postcardReview ? 240 : 180),
                }
              : request.postingDraft
                ? { ...configured, schemaId: TELEGRAM_POSTING_DRAFT_SCHEMA_ID, promptVersion: 'telegram-posting-draft-v1' }
                : request.postingReview
                  ? { ...configured, schemaId: TELEGRAM_POSTING_REVIEW_SCHEMA_ID, promptVersion: 'telegram-posting-editorial-review-v1' }
                  : configured;
      if (
        !this.deployment.enabled ||
        !this.deployment.configured ||
        !workspace?.enabled ||
        !config.enabled
      )
        throw new ServiceUnavailableException('AI_DISABLED');
      const unlimitedPosting =
        workspace.aiPostingUnlimited === true &&
        request.aiPosting !== undefined &&
        [
          'TELEGRAM_POSTING_PLAN',
          'TELEGRAM_POSTING_TEXT',
          'TELEGRAM_POSTING_REVIEW',
          'TELEGRAM_POSTING_IMAGE',
        ].includes(request.category);
      if (
        !unlimitedPosting &&
        (!workspace.dailyBudget ||
          !workspace.monthlyBudget ||
          !workspace.maxRequestCost)
      )
        throw new ConflictException('AI_BUDGET_REQUIRED');
      if (
        request.mode === 'AUTOMATIC' &&
        (!workspace.automaticEnabled ||
          !config.automaticEnabled ||
          (!unlimitedPosting && (!config.dailyBudget || !config.monthlyBudget)))
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
      const price = request.audio
        ? this.registry.transcriptionPrice()
        : this.registry.price(config.modelId);
      if (!price) throw new ConflictException('AI_MODEL_UNPRICED');
      const reservedCost = request.audio
        ? new Prisma.Decimal('0.0045')
        : reservationCost(price, config.maxInputTokens, config.maxOutputTokens)
            .plus(request.postingImageSearch ? AI_POSTING_SEARCH_CALL_USD : 0);
      if (request.image && request.category === 'LEAD_AD_CLASSIFICATION') {
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
      // An explicitly configured image limit replaces the workspace per-request
      // cap; workspace and category daily/monthly budgets still apply.
      const requestLimit =
        request.category === 'TELEGRAM_POSTING_IMAGE' && config.maxRequestCost
          ? config.maxRequestCost
          : workspace.maxRequestCost;
      if (
        !unlimitedPosting &&
        (reservedCost.gt(requestLimit!) ||
          (request.category !== 'TELEGRAM_POSTING_IMAGE' &&
            config.maxRequestCost &&
            reservedCost.gt(config.maxRequestCost)))
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
      const budgetScopes: Array<{ scope: string; limit?: string | null }> = [
        { scope: 'WORKSPACE' },
        { scope: request.category },
      ];
      if (request.aiPosting)
        budgetScopes.push({
          scope: `TELEGRAM_CHANNEL:${request.aiPosting.channelId}`,
          limit:
            request.aiPosting.dailyBudget === undefined
              ? null
              : request.aiPosting.dailyBudget,
        });
      for (const { scope, limit: channelDailyLimit } of budgetScopes)
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
              : scope.startsWith('TELEGRAM_CHANNEL:')
                ? period.period === 'DAY'
                  ? channelDailyLimit
                  : (request.aiPosting?.monthlyBudget ?? null)
                : period.period === 'DAY'
                  ? config.dailyBudget
                  : config.monthlyBudget;
          if (
            (!unlimitedPosting || (request.aiPosting?.autopilotRunId && scope.startsWith('TELEGRAM_CHANNEL:'))) &&
            limit !== null &&
            limit !== undefined &&
            bucket.spent
              .add(bucket.reserved)
              .add(reservedCost)
              .gt(new Prisma.Decimal(limit.toString()))
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
          source: this.deployment.usageSource,
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
          aiPostingChannelId: request.aiPosting?.channelId,
          aiPostingTestRunId: request.aiPosting?.testRunId,
          aiPostingAutopilotRunId: request.aiPosting?.autopilotRunId,
          aiPostingPublicationIndex: request.aiPosting?.publicationIndex,
          aiPostingAttempt: request.aiPosting?.attempt,
          aiPostingMode: request.aiPosting?.postingMode,
          configurationSnapshot: config,
          pricingSnapshot: request.postingImageSearch ? { ...price, webSearchCallUsd: AI_POSTING_SEARCH_CALL_USD } : price,
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
