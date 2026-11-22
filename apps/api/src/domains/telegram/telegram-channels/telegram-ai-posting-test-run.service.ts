import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramAiPostingImageService } from './telegram-ai-posting-image.service';
import { saveRejectedTelegramAiPostingImage } from './telegram-ai-posting-image-avoidance.store';
import { TelegramAiPostingStructureService } from './telegram-ai-posting-structure.service';
import { telegramHtmlToManagedMarkup } from '@api/telegram/shared/markup/telegram-markup';
import {
  applyTelegramAiPostingTestRunFormatting,
  preserveTelegramAiPostingReferences,
} from './telegram-ai-posting-test-run-format';
import {
  parseTelegramAiPostingJson,
  telegramAiPostingOperationFromError,
} from './telegram-ai-posting-test-run-errors';
import {
  decodeAiPostingRunPublications,
  encodeAiPostingRunPublications,
} from './telegram-ai-posting-run-data';
import { resolveTelegramAiPostingLanguage } from './telegram-ai-posting-language';
import { publicationEmojiInstruction } from './telegram-ai-posting-prompts';
import {
  clearTelegramAiPostingMediaFailure,
  resolveTelegramAiPostingMediaPreference,
} from './telegram-ai-posting-media-preferences';

import {
  addKnownCost,
  writeTelegramAiPostingTestRun,
  type TelegramAiPostingTestRunOperation as Run,
  type TestPublication,
} from './telegram-ai-posting-test-run.store';

@Injectable()
export class TelegramAiPostingTestRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly gateway: AiGateway,
    private readonly posts: TelegramManagedPostCommandService,
    private readonly revisions: TelegramManagedPostRevisionStore,
    private readonly images: TelegramAiPostingImageService,
    private readonly structure: TelegramAiPostingStructureService,
  ) {}

  async listRuns(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const runs = await this.prisma.telegramAiPostingTestRun.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        requestedCount: true,
        settingsVersion: true,
        version: true,
        status: true,
        createdAt: true,
        publications: true,
        failures: true,
        operations: true,
        feedback: true,
        planningCost: true,
        textCost: true,
        imageCost: true,
        reviewCost: true,
      },
    });
    return runs.map((run) => {
      const decoded = decodeAiPostingRunPublications(run.publications);
      return {
        ...run,
        publications: decoded.publications.map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            return value;
          const publication = value as Record<string, unknown>;
          return {
            ...publication,
            text:
              typeof publication.text === 'string'
                ? telegramHtmlToManagedMarkup(publication.text)
                : '',
          };
        }),
        sourceDiagnostics: decoded.sourceDiagnostics,
      };
    });
  }

  async clearHistory(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const staleRunCutoff = new Date(Date.now() - 30 * 60_000);
    const result = await this.prisma.telegramAiPostingTestRun.deleteMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        OR: [
          { status: { not: 'RUNNING' } },
          { status: 'RUNNING', updatedAt: { lt: staleRunCutoff } },
        ],
      },
    });
    return { deletedCount: result.count };
  }

  async prepareBotImage(userId: string, channelId: string, runId: string, input: {
    index: number; enabled: boolean; size: number; opacity: number; x: number; y: number;
  }) {
    const inRange = (value: unknown, min: number, max: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    if (!input || !Number.isInteger(input.index) || input.index < 0 ||
      typeof input.enabled !== 'boolean' || !inRange(input.size, 5, 30) ||
      !inRange(input.opacity, 10, 100) || !inRange(input.x, 0, 100) || !inRange(input.y, 0, 100))
      throw new BadRequestException('Invalid watermark settings');

    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const run = await this.prisma.telegramAiPostingTestRun.findFirst({
      where: { id: runId, workspaceId, telegramChannelId: channelId },
      select: { publications: true, telegramChannel: { select: { photoUrl: true } } },
    });
    const post = run && decodeAiPostingRunPublications(run.publications)
      .publications[input.index] as TestPublication | undefined;
    if (!post?.imageUrl) throw new NotFoundException('Publication image not found');
    if (!post.imagePreviewUrl) throw new ConflictException('AI_POSTING_WATERMARK_ORIGINAL_MISSING');
    return { imageUrl: input.enabled
      ? await this.images.renderBotWatermark(post.imagePreviewUrl, run?.telegramChannel.photoUrl, input)
      : post.imagePreviewUrl };
  }

  async reviewPublication(
    userId: string,
    channelId: string,
    runId: string,
    index: number,
    expectedVersion: number,
    action:
      | 'approve'
      | 'reject'
      | 'edit'
      | 'save'
      | 'regenerate-text'
      | 'regenerate-image',
    value?: string,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const run = await this.prisma.telegramAiPostingTestRun.findFirst({
      where: { id: runId, workspaceId, telegramChannelId: channelId },
    });
    if (!run) throw new NotFoundException('AI Posting test run not found');
    if (run.version !== expectedVersion)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    const decoded = decodeAiPostingRunPublications(run.publications);
    const publications = decoded.publications.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return value as TestPublication;
      const publication = value as Record<string, unknown>;
      return {
        ...publication,
        text:
          typeof publication.text === 'string'
            ? telegramHtmlToManagedMarkup(publication.text)
            : '',
      } as TestPublication;
    });
    const sourceDiagnostics = decoded.sourceDiagnostics;
    const item = publications[index];
    if (!item) throw new NotFoundException('AI Posting publication not found');
    if (item.savedPostId || item.status === 'SAVED_DRAFT')
      throw new ConflictException('AI_POSTING_PUBLICATION_ALREADY_SAVED');
    if (action === 'regenerate-text') {
      const settings = await this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: {
          configuration: true,
          aiDailyBudget: true,
          aiMonthlyBudget: true,
        },
      });
      if (!settings)
        throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
      const config = settings.configuration as Record<string, any>;
      const language =
        (await resolveTelegramAiPostingLanguage(this.prisma, {
          workspaceId,
          channelId,
          configuredLanguage: config.language,
        })) || 'English';
      const runs = run.operations as unknown as Run[];
      const textAttempt =
        item.operations.filter((operation) => operation.stage === 'text')
          .length + 1;
      const prompt = `Return the complete revised publication as structured fields title, text and imagePrompt. The title and text must be nonempty. Rewrite this Telegram publication according to the user's current channel rules. The reader-facing title and text must be exclusively in ${language}. ${publicationEmojiInstruction(config)} Topic: ${item.topic}. Rules: ${JSON.stringify(config).slice(0, 8000)}. User feedback: ${value?.slice(0, 1000) ?? 'Improve clarity and distinctiveness'}. Existing text: ${item.text}`;
      const result = await this.gateway.execute({
        userId,
        workspaceId,
        category: 'TELEGRAM_POSTING_TEXT',
        revisionDraft: true,
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        mode: 'MANUAL',
        input: prompt,
        businessObjectId: channelId,
        aiPosting: {
          channelId,
          testRunId: run.id,
          publicationIndex: index,
          attempt: textAttempt,
          postingMode: 'TEST',
          dailyBudget: null,
          monthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
        },
      });
      const operation: Run = {
        stage: 'text',
        attempt: textAttempt,
        operationId: result.operation.operationId,
        category: result.operation.category,
        model: result.operation.model,
        status: result.operation.status,
        actualCost: result.operation.actualCost,
        pricingStatus: result.operation.pricingStatus,
        inputTokens: result.operation.inputTokens,
        outputTokens: result.operation.outputTokens,
      };
      runs.push(operation);
      if (
        result.operation.status !== 'SUCCEEDED' ||
        !result.result ||
        typeof result.result !== 'object'
      ) {
        item.operations.push(operation);
        await writeTelegramAiPostingTestRun(
          this.prisma,
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
          sourceDiagnostics,
        );
        throw new BadGatewayException('AI_POSTING_TEXT_REGENERATION_FAILED');
      }
      const rewritten =
        'text' in result.result
          ? (result.result as {
              title?: unknown;
              text?: unknown;
              imagePrompt?: unknown;
            })
          : parseTelegramAiPostingJson(
              (result.result as { reply?: string }).reply ?? '',
            );
      if (
        !rewritten ||
        typeof rewritten.title !== 'string' ||
        typeof rewritten.text !== 'string' ||
        !rewritten.text.trim()
      ) {
        item.operations.push(operation);
        await writeTelegramAiPostingTestRun(
          this.prisma,
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
          sourceDiagnostics,
        );
        throw new BadGatewayException('AI_POSTING_TEXT_REGENERATION_INVALID');
      }
      item.title = rewritten.title.trim();
      item.text = applyTelegramAiPostingTestRunFormatting(
        preserveTelegramAiPostingReferences(
          rewritten.text,
          item.text,
          config,
          value,
        ),
        config,
      );
      if (item.text.length > (item.imageUrl ? 1024 : 4096))
        throw new BadGatewayException('AI_POSTING_TELEGRAM_LENGTH');
      if (typeof rewritten.imagePrompt === 'string')
        item.imagePrompt = rewritten.imagePrompt;
      item.status = 'PENDING';
      item.rejectionReason = null;
      const reviewAttempt =
        item.operations.filter((operation) => operation.stage === 'review')
          .length + 1;
      const reviewResult = await this.gateway.execute({
        userId,
        workspaceId,
        category: 'TELEGRAM_POSTING_REVIEW',
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        mode: 'MANUAL',
        input: `Return only JSON {"approved":boolean,"reasons":string[]}. Review this text for Telegram length, duplication and configured editorial rules. Rules: ${JSON.stringify(config).slice(0, 5000)}. Text: ${item.text}`,
        businessObjectId: channelId,
        aiPosting: {
          channelId,
          testRunId: run.id,
          publicationIndex: index,
          attempt: reviewAttempt,
          postingMode: 'TEST',
          dailyBudget: null,
          monthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
        },
      });
      const reviewOperation: Run = {
        stage: 'review',
        attempt: reviewAttempt,
        operationId: reviewResult.operation.operationId,
        category: reviewResult.operation.category,
        model: reviewResult.operation.model,
        status: reviewResult.operation.status,
        actualCost: reviewResult.operation.actualCost,
        pricingStatus: reviewResult.operation.pricingStatus,
        inputTokens: reviewResult.operation.inputTokens,
        outputTokens: reviewResult.operation.outputTokens,
      };
      runs.push(reviewOperation);
      if (
        reviewResult.operation.status !== 'SUCCEEDED' ||
        !reviewResult.result ||
        typeof reviewResult.result !== 'object'
      ) {
        item.operations.push(operation, reviewOperation);
        await writeTelegramAiPostingTestRun(
          this.prisma,
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
          sourceDiagnostics,
        );
        throw new BadGatewayException('AI_POSTING_REVIEW_REGENERATION_FAILED');
      }
      const verdict = parseTelegramAiPostingJson(
        (reviewResult.result as { reply?: string }).reply ?? '',
      );
      if (!verdict || verdict.approved !== true) {
        item.operations.push(operation, reviewOperation);
        await writeTelegramAiPostingTestRun(
          this.prisma,
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
          sourceDiagnostics,
        );
        throw new BadGatewayException(
          'AI_POSTING_REVIEW_REGENERATION_REJECTED',
        );
      }
      item.operations.push(operation, reviewOperation);
      item.status = 'PENDING';
      item.costs.text = addKnownCost(
        item.costs.text,
        result.operation.actualCost,
        result.operation.pricingStatus,
      );
      item.costs.review = addKnownCost(
        item.costs.review,
        reviewResult.operation.actualCost,
        reviewResult.operation.pricingStatus,
      );
      await writeTelegramAiPostingTestRun(
        this.prisma,
        run.id,
        workspaceId,
        expectedVersion,
        publications,
        runs,
        (Array.isArray(run.failures) && run.failures.length) ||
          publications.some(
            (post) =>
              (post.mediaReadiness ?? (post.imageUrl ? 'READY' : 'MISSING')) !==
              'READY',
          )
          ? 'PARTIAL'
          : 'COMPLETED',
        sourceDiagnostics,
      );
      return {
        ...run,
        status:
          (Array.isArray(run.failures) && run.failures.length) ||
          publications.some(
            (post) =>
              (post.mediaReadiness ?? (post.imageUrl ? 'READY' : 'MISSING')) !==
              'READY',
          )
            ? 'PARTIAL'
            : 'COMPLETED',
        version: expectedVersion + 1,
        publications,
        sourceDiagnostics,
      };
    }
    if (action === 'regenerate-image') {
      const settings = await this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: {
          id: true,
          configuration: true,
          configurationVersion: true,
          aiDailyBudget: true,
          aiMonthlyBudget: true,
          telegramChannel: { select: { photoUrl: true } },
        },
      });
      if (!settings)
        throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
      const config = settings.configuration as Record<string, unknown>;
      const priorAvoidances = Array.isArray(config.imageAvoidances)
        ? config.imageAvoidances.filter(
            (value): value is string =>
              typeof value === 'string' && Boolean(value.trim()),
          )
        : [];
      const rejectedDirection =
        item.imageUrl && typeof item.imagePrompt === 'string'
          ? item.imagePrompt.trim().slice(0, 500)
          : '';
      const nextAvoidances = rejectedDirection
        ? [
            ...priorAvoidances.filter((value) => value !== rejectedDirection),
            rejectedDirection,
          ].slice(-10)
        : priorAvoidances;
      const avoidancesChanged =
        nextAvoidances.some(
          (value, index) => value !== priorAvoidances[index],
        ) || nextAvoidances.length !== priorAvoidances.length;
      if (avoidancesChanged) {
        const updatedConfiguration = {
          ...config,
          imageAvoidances: nextAvoidances,
        };
        const saved = await this.prisma.$transaction((tx) =>
          saveRejectedTelegramAiPostingImage(tx, {
            settingsId: settings.id,
            workspaceId,
            channelId,
            expectedVersion: settings.configurationVersion,
            configuration: updatedConfiguration,
          }),
        );
        if (!saved) throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
      }
      if (item.text.length > 1024)
        throw new ConflictException('AI_POSTING_TELEGRAM_LENGTH_WITH_IMAGE');
      const preference = resolveTelegramAiPostingMediaPreference(config, item);
      let resolved: Awaited<
        ReturnType<TelegramAiPostingImageService['resolve']>
      >;
      try {
        resolved = await this.images.resolve({
          userId,
          workspaceId,
          channelId,
          topic: item.topic,
          imageMode: 'ai',
          referenceImageUrls: preference?.references ?? [],
          channelAvatarUrl: settings.telegramChannel?.photoUrl,
          imageCandidates: [],
          prompt: [
            item.imagePrompt,
            typeof value === 'string' ? value.trim().slice(0, 500) : '',
            nextAvoidances.length
              ? `Avoid similar compositions and visual directions: ${nextAvoidances.slice(-5).join('; ')}`
              : '',
          ]
            .filter(Boolean)
            .join('. '),
          watermarkChannelAvatar: config.useChannelAvatarInMedia === true,
          watermarkSizePercent: Number(config.channelAvatarWatermarkSize) || 12,
          watermarkX: Number(config.channelAvatarWatermarkX ?? 100),
          watermarkY: Number(config.channelAvatarWatermarkY ?? 100),
          watermarkOpacityPercent: Number(config.channelAvatarWatermarkOpacity) || 100,
          mode: 'MANUAL',
          aiPosting: {
            channelId,
            testRunId: run.id,
            publicationIndex: index,
            attempt:
              item.operations.filter((operation) => operation.stage === 'image')
                .length + 1,
            postingMode: 'TEST',
            dailyBudget: null,
            monthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
          },
        });
      } catch (error) {
        const failedOperation = telegramAiPostingOperationFromError<Run>(error);
        if (failedOperation) {
          const operations = run.operations as unknown as Run[];
          operations.push(failedOperation);
          item.operations.push(failedOperation);
          item.costs.image = addKnownCost(
            item.costs.image,
            failedOperation.actualCost,
            failedOperation.pricingStatus,
          );
          await writeTelegramAiPostingTestRun(
            this.prisma,
            run.id,
            workspaceId,
            expectedVersion,
            publications,
            operations,
            'PARTIAL',
            sourceDiagnostics,
          );
        }
        throw error;
      }
      const operations = run.operations as unknown as Run[];
      if (resolved.operation) {
        operations.push(resolved.operation);
        item.operations.push(resolved.operation);
        item.costs.image = addKnownCost(
          item.costs.image,
          resolved.operation.actualCost,
          resolved.operation.pricingStatus,
        );
      }
      if (resolved.costUnknown) {
        item.imageCostUnknown = true;
        item.costs.image = null;
      }
      if (!resolved.image) {
        item.mediaReadiness = item.imageUrl
          ? 'READY'
          : (resolved.readiness ?? 'FAILED');
        item.mediaFailureCode =
          resolved.failureCode ?? 'AI_POSTING_IMAGE_REGENERATION_FAILED';
        await writeTelegramAiPostingTestRun(
          this.prisma,
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          operations,
          'PARTIAL',
          sourceDiagnostics,
        );
        throw new BadGatewayException(item.mediaFailureCode);
      }
      if (preference)
        item.mediaPreference = { id: preference.id, name: preference.name };
      item.imageUrl = resolved.image.url;
      item.imageSourceId = resolved.image.sourceId;
      item.imageFingerprint = resolved.image.fingerprint ?? null;
      item.imageOriginalUrl = resolved.image.originalUrl ?? null;
      item.imagePreviewUrl = resolved.image.previewUrl ?? null;
      item.mediaReadiness = 'READY';
      delete item.mediaFailureCode;
      item.status = 'PENDING';
      item.rejectionReason = null;
      const failures = clearTelegramAiPostingMediaFailure(
        run.failures,
        item.topic,
      );
      await writeTelegramAiPostingTestRun(
        this.prisma,
        run.id,
        workspaceId,
        expectedVersion,
        publications,
        operations,
        failures.length ||
          publications.some((post) => post.mediaReadiness !== 'READY')
          ? 'PARTIAL'
          : 'COMPLETED',
        sourceDiagnostics,
        failures,
      );
      return {
        ...run,
        version: expectedVersion + 1,
        publications,
        failures,
        status:
          failures.length ||
          publications.some((post) => post.mediaReadiness !== 'READY')
            ? 'PARTIAL'
            : 'COMPLETED',
        sourceDiagnostics,
      };
    }
    if (action === 'reject' && !value?.trim())
      throw new ConflictException('AI_POSTING_REJECTION_REASON_REQUIRED');
    if (action === 'edit') {
      if (!value?.trim() || value.length > (item.imageUrl ? 1024 : 4096))
        throw new ConflictException('AI_POSTING_EDIT_TEXT_INVALID');
      item.text = value;
      item.status = 'EDITED';
      item.ownerEdited = true;
      item.rejectionReason = null;
    } else if (action === 'approve') {
      if (item.status === 'REJECTED')
        throw new ConflictException('AI_POSTING_REJECTED_CONTENT_MUST_CHANGE');
      if (!item.text.trim() || item.text.length > (item.imageUrl ? 1024 : 4096))
        throw new ConflictException('AI_POSTING_EDIT_TEXT_INVALID');
      item.status = 'APPROVED';
      item.rejectionReason = null;
    } else if (action === 'reject') {
      item.status = 'REJECTED';
      item.rejectionReason = value!.trim().slice(0, 1000);
    } else {
      if (item.status !== 'APPROVED')
        throw new ConflictException('AI_POSTING_APPROVAL_REQUIRED');
      if (value !== undefined && value !== item.text)
        throw new ConflictException('AI_POSTING_APPROVED_CONTENT_CHANGED');
      if (!item.text.trim() || item.text.length > (item.imageUrl ? 1024 : 4096))
        throw new ConflictException('AI_POSTING_EDIT_TEXT_INVALID');
      const format = typeof item.format === 'string' ? item.format : '';
      const category = typeof item.category === 'string' ? item.category : '';
      const prepared = await this.posts.prepareManagedPostCreate(
        userId,
        channelId,
        {
          title: item.title,
          text: item.text,
          imageUrls: item.imageUrl ? [item.imageUrl] : [],
        },
      );
      const result = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.telegramAiPostingTestRun.updateMany({
          where: { id: run.id, workspaceId, version: expectedVersion },
          data: { version: { increment: 1 } },
        });
        if (!claim.count)
          throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
        const rows = await tx.$queryRaw<
          Array<{ configuration: Prisma.JsonValue }>
        >(Prisma.sql`
          SELECT "configuration" FROM "TelegramAiPostingSettings"
          WHERE "workspaceId" = ${workspaceId} AND "telegramChannelId" = ${channelId}
          FOR SHARE
        `);
        const storedConfig = rows[0]?.configuration;
        const config =
          storedConfig &&
          typeof storedConfig === 'object' &&
          !Array.isArray(storedConfig)
            ? storedConfig
            : {};
        const allowGroups = config.allowCreateGroups === true;
        const allowHypotheses = config.allowCreateHypotheses === true;
        const selectedName = (
          name: string,
          options: Prisma.JsonValue | undefined,
          allowCreate: boolean,
        ) => {
          const normalized = name.trim().toLocaleLowerCase();
          if (!normalized) return '';
          const selected =
            Array.isArray(options) &&
            options.some(
              (option) =>
                typeof option === 'string' &&
                option.trim().toLocaleLowerCase() === normalized,
            );
          return selected ||
            (allowCreate && !['standard', 'general'].includes(normalized))
            ? name
            : '';
        };
        const groupName = selectedName(format, config.formats, allowGroups);
        const hypothesisName = selectedName(
          category,
          config.categories,
          allowHypotheses,
        );
        const structure =
          groupName || hypothesisName
            ? await this.structure.resolveForDraft(tx, {
                workspaceId,
                channelId,
                memberId: prepared.assignedMemberId,
                format: groupName,
                category: hypothesisName,
                allowGroups,
                allowHypotheses,
              })
            : { groupId: null, hypothesisId: null };
        const post = await this.posts.createManagedPostRecord(tx, {
          ...prepared,
          aiPostingReviewStatus: 'APPROVED',
          aiPostingApprovedWithoutEdits: !item.ownerEdited,
          aiPostingRecheckRequired: false,
          ...(structure.groupId ? { groupId: structure.groupId } : {}),
          imageUrls: item.imageUrl ? [item.imageUrl] : [],
          mediaItems: item.imageUrl
            ? [{ kind: 'PHOTO', url: item.imageUrl }]
            : [],
        });
        if (structure.hypothesisId)
          await tx.telegramManagedPostContentHypothesis.create({
            data: {
              managedPostId: post.id,
              hypothesisId: structure.hypothesisId,
            },
          });
        await tx.aiOperation.updateMany({
          where: {
            workspaceId,
            aiPostingTestRunId: run.id,
            aiPostingPublicationIndex: index,
          },
          data: { aiPostingManagedPostId: post.id },
        });
        await this.revisions.createManagedPostRevision(
          tx,
          post,
          'created',
          userId,
        );
        const costs = item.costs;
        await tx.telegramAiPostingGeneration.create({
          data: {
            workspaceId,
            telegramChannelId: channelId,
            managedPostId: post.id,
            settingsVersion: run.settingsVersion,
            attempts: item.operations.filter((op) => op.stage !== 'planning')
              .length,
            ideaSources: item.ideaSources as Prisma.InputJsonArray,
            modelUsage: {
              operations: item.operations,
              format: item.format,
              category: item.category,
              editorialMetadata: item.editorialMetadata ?? null,
            },
            planningCost: costs.planning,
            textCost: costs.text,
            imageCost: costs.image,
            reviewCost: costs.review,
          },
        });
        item.savedPostId = post.id;
        item.status = 'SAVED_DRAFT';
        const saved = await tx.telegramAiPostingTestRun.updateMany({
          where: { id: run.id, workspaceId, version: expectedVersion + 1 },
          data: {
            publications: encodeAiPostingRunPublications(
              publications,
              sourceDiagnostics,
            ),
            version: { increment: 1 },
          },
        });
        if (!saved.count)
          throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
        return post;
      });
      if (!result.id) throw new ConflictException('AI_POSTING_SAVE_FAILED');
      return {
        ...run,
        version: expectedVersion + 2,
        publications,
        sourceDiagnostics,
      };
    }
    const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
      where: { id: run.id, workspaceId, version: expectedVersion },
      data: {
        publications: encodeAiPostingRunPublications(
          publications,
          sourceDiagnostics,
        ),
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    return {
      ...run,
      version: expectedVersion + 1,
      publications,
      sourceDiagnostics,
    };
  }
}
