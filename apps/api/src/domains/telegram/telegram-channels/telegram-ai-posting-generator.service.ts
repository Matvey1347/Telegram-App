import {
  BadGatewayException, ConflictException, Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { TelegramAiPostingImageService } from './telegram-ai-posting-image.service';
import { TelegramChannelAiPlanningContextService } from './telegram-channel-ai-planning-context.service';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import {
  decodeAiPostingRunPublications,
  encodeAiPostingRunPublications,
} from './telegram-ai-posting-run-data';
import {
  detectTelegramAiPostingLanguage,
  telegramAiPostingLanguageName,
  resolveTelegramAiPostingLanguage,
} from './telegram-ai-posting-language';
import { generateTelegramAiPostingDraft } from './telegram-ai-posting-draft-generator';
import { createTelegramAiPostingInvocation, telegramAiPostingBatchExecutor } from './telegram-ai-posting-generation-invoke';
import { telegramAiPostingMediaPreferences, createTelegramAiPostingMediaRunState } from './telegram-ai-posting-media-preferences';
import { readTelegramAiPostingLearningBlock } from './telegram-ai-posting-learning-read';
import { createTelegramAiPostingProgress, TelegramAiPostingRunStopped, type TelegramAiPostingProgress } from './telegram-ai-posting-progress';

import {
  type TelegramAiPostingRunOperation as Run,
  telegramAiPostingRunCosts,
  telegramAiPostingGenerationErrorCode,
  telegramAiPostingGenerationFailures,
  telegramAiPostingGenerationErrorReasons,
  telegramAiPostingSourceDiagnosticsFromError,
} from './telegram-ai-posting-generation-outcome';
import { restoreTelegramAiPostingEditorialSelection, telegramAiPostingEditorialSelection, type TelegramAiPostingEditorialAssignment } from './telegram-ai-posting-editorial-selection';
import {
  telegramAiPostingPlanningContextText,
  telegramAiPostingPlanPrompt,
  parseTelegramAiPostingTopics,
} from './telegram-ai-posting-topic-plan';
import { telegramAiPostingOperationFromError } from './telegram-ai-posting-test-run-errors';
import { appendChannelEndingSignature, MAX_TELEGRAM_AI_POSTING_BATCH_SIZE } from '@telegram-system/shared';
import {
  assertTelegramAiPostingRunActive, claimTelegramAiPostingRetrySlot, createTelegramAiPostingGenerationRun, readTelegramAiPostingGenerationSettings,
  settleTelegramAiPostingRetrySlot, type TelegramAiPostingRetrySlot,
} from './telegram-ai-posting-generation-store';
import { readAiPostingEditorialHistory } from './telegram-ai-posting-editorial-history';
import { telegramAiPostingVisualDirection, telegramAiPostingVisualMotif } from './telegram-ai-posting-visual-direction';
import { telegramAiPostingHybridMediaMode } from './telegram-ai-posting-hybrid-media';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
@Injectable()
export class TelegramAiPostingGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly gateway: AiGateway,
    private readonly sources: TelegramAiPostingSourceService,
    private readonly planningContext: TelegramChannelAiPlanningContextService,
    private readonly images: TelegramAiPostingImageService,
  ) {}

  async generate(
    userId: string,
    channelId: string,
    count: number,
    mode: 'MANUAL' | 'AUTOMATIC' = 'MANUAL',
    autopilotRunId?: string,
    onProgress?: (
      item: TelegramAiPostingProgress,
      current: number,
      total: number,
    ) => void,
    topicOverride?: string,
    retrySlot?: TelegramAiPostingRetrySlot,
    onAccepted?: (runId: string) => void,
  ) {
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_TELEGRAM_AI_POSTING_BATCH_SIZE
    )
      throw new ConflictException('AI_POSTING_COUNT_INVALID');
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const { channel, settings } = await readTelegramAiPostingGenerationSettings(this.prisma, workspaceId, channelId);
    const run = retrySlot
      ? { ...await claimTelegramAiPostingRetrySlot(this.prisma, workspaceId, channelId, retrySlot), editorialOffset: 0, existing: false }
      : await createTelegramAiPostingGenerationRun(
          this.prisma, workspaceId, channelId, count, settings.configurationVersion,
          (settings.configuration as { imageMode?: string } | null)?.imageMode === 'hybrid',
          Boolean(onAccepted),
        );
    onAccepted?.(run.id);
    if (run.existing) throw new TelegramAiPostingRunStopped();
    if (retrySlot) {
      const result = await this.generateRunContent(
        userId, channelId, 1, workspaceId, settings, mode, run.id, undefined,
        onProgress, channel?.language ?? '', channel?.photoUrl ?? null,
        topicOverride, 0, channel, retrySlot,
      ).catch((error: unknown): Awaited<ReturnType<typeof this.generateRunContent>> => ({
        generated: [],
        requested: 1,
        settingsVersion: settings.configurationVersion,
        sourceDiagnostics: telegramAiPostingSourceDiagnosticsFromError(error),
        unknownImageCost: false,
        failures: telegramAiPostingGenerationFailures(error).map((failure) => ({
          ...failure, publicationIndex: retrySlot.publicationIndex,
          topic: topicOverride ?? '',
        })),
        operations: (error as { postingOperations?: Run[] } | null)?.postingOperations ?? [],
      }));
      const settlement = await settleTelegramAiPostingRetrySlot(
        this.prisma, workspaceId, retrySlot,
        result.generated[0] && { ...result.generated[0], status: 'PENDING', savedPostId: null, rejectionReason: null },
        result.operations, result.failures.map((failure) => ({
          ...failure, publicationIndex: retrySlot.publicationIndex,
          ...(!result.generated.length ? { retryText: true } : {}),
          ...(retrySlot.imageMode ? { imageMode: retrySlot.imageMode } : {}),
        })),
      );
      return { ...result, ...settlement, runId: run.id, version: run.version + 1 };
    }
    try {
      const result = await this.generateRunContent(
        userId,
        channelId,
        count,
        workspaceId,
        settings,
        mode,
        run.id,
        autopilotRunId,
        onProgress,
        channel?.language ?? '',
        channel?.photoUrl ?? null,
        topicOverride,
        run.editorialOffset,
        channel,
        undefined,
        Boolean(onAccepted),
      );
      const publications = result.generated.map((item) => ({
        ...item,
        status: 'PENDING',
        rejectionReason: null,
        savedPostId: null,
      }));
      const costs = telegramAiPostingRunCosts(result.operations);
      if (result.unknownImageCost) costs.image = null;
      await this.prisma.telegramAiPostingTestRun.update({
        where: { id: run.id, ...(onAccepted ? { status: 'RUNNING' } : {}) },
        data: {
          status: result.failures.length ? 'PARTIAL' : 'COMPLETED',
          publications: encodeAiPostingRunPublications(
            publications,
            result.sourceDiagnostics,
          ),
          failures: result.failures,
          operations: result.operations,
          planningCost: costs.planning,
          textCost: costs.text,
          imageCost: costs.image,
          reviewCost: costs.review,
          version: { increment: 1 },
        },
      });
      return {
        ...result,
        runId: run.id,
        version: run.version + 1,
        generated: publications,
      };
    } catch (error) {
      if (error instanceof TelegramAiPostingRunStopped || (onAccepted &&
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) throw error;
      const failedOperations =
        error && typeof error === 'object' && 'postingOperations' in error
          ? ((error as { postingOperations?: Run[] }).postingOperations ?? [])
          : [];
      const costs = telegramAiPostingRunCosts(failedOperations);
      await this.prisma.telegramAiPostingTestRun.update({
        where: { id: run.id, ...(onAccepted ? { status: 'RUNNING' } : {}) },
        data: {
          status: 'FAILED',
          publications: encodeAiPostingRunPublications(
            [],
            telegramAiPostingSourceDiagnosticsFromError(error),
          ),
          failures: telegramAiPostingGenerationFailures(error),
          operations: failedOperations,
          planningCost: costs.planning,
          textCost: costs.text,
          imageCost: costs.image,
          reviewCost: costs.review,
          version: { increment: 1 },
        },
      });
      throw error;
    }
  }

  private async generateRunContent(
    userId: string,
    channelId: string,
    count: number,
    workspaceId: string,
    settings: {
      configuration: Prisma.JsonValue;
      configurationVersion: number;
      aiDailyBudget: Prisma.Decimal | null;
      aiMonthlyBudget: Prisma.Decimal | null;
    },
    mode: 'MANUAL' | 'AUTOMATIC',
    testRunId: string,
    autopilotRunId?: string,
    onProgress?: (
      item: TelegramAiPostingProgress,
      current: number,
      total: number,
    ) => void,
    channelLanguage = '',
    channelPhotoUrl: string | null = null,
    topicOverride?: string,
    editorialOffset = 0,
    channel?: {
      title: string;
      username: string | null;
      description: string | null;
      inviteLink: string | null;
      defaultInviteLink: { url: string; isRevoked: boolean } | null;
      publicInviteLink: { url: string; isRevoked: boolean } | null;
      presentationIcon: any;
    } | null,
    retrySlot?: TelegramAiPostingRetrySlot,
    background = false,
  ) {
    const assertActive = background
      ? () => assertTelegramAiPostingRunActive(this.prisma, workspaceId, testRunId)
      : undefined;
    const config = settings.configuration as Record<string, any>;
    const sphereSources = (Array.isArray(config.spheres) ? config.spheres : [])
      .flatMap((sphere: any) =>
        Array.isArray(sphere?.sources)
          ? sphere.sources
              .slice(0, 10)
              .flatMap((value: unknown, index: number) => {
                if (typeof value !== 'string') return [];
                try {
                  const url = new URL(value);
                  if (url.protocol !== 'https:' || url.username || url.password)
                    return [];
                  url.hash = '';
                  return [
                    {
                      id: `sphere-${String(sphere.id).slice(0, 80)}-${index}`,
                      type: 'website',
                      value: url.toString(),
                      enabled: true,
                      useImages: false,
                    },
                  ];
                } catch {
                  return [];
                }
              })
          : [],
      )
      .slice(0, 30);
    const sourceContext = await this.sources.collect({
      workspaceId,
      channelId,
      config: { ...config, sources: [...sphereSources, ...(Array.isArray(config.sources) ? config.sources : [])] },
      imageSelectionKey: testRunId,
    });
    const learningBlock = await readTelegramAiPostingLearningBlock(
      this.prisma,
      channelId,
      config,
    );
    const detectedLanguage = await resolveTelegramAiPostingLanguage(
      this.prisma,
      {
        workspaceId,
        channelId,
        configuredLanguage:
          typeof config.language === 'string' ? config.language : '',
        channelLanguage,
      },
    );
    const generationConfig: Record<string, any> = {
      ...config,
      ending: typeof config.ending === 'string' && config.ending.trim()
        ? config.ending
        : appendChannelEndingSignature('', {
            title: channel?.title,
            username: channel?.username,
            mainInviteLink: channel?.defaultInviteLink?.isRevoked
              ? null
              : channel?.defaultInviteLink?.url,
            publicInviteLink: channel?.publicInviteLink?.isRevoked
              ? null
              : channel?.publicInviteLink?.url,
            inviteLink: channel?.inviteLink,
            description: channel?.description,
            presentationIconPresentation: iconToResolvedEmoji(channel?.presentationIcon ?? null),
          }),
      learningBlock,
      language:
        detectedLanguage ||
        detectTelegramAiPostingLanguage(sourceContext.history) ||
        telegramAiPostingLanguageName(sourceContext.editorialProfile.language),
    };
    const calendar = topicOverride ? null : await this.planningContext.read(
      userId,
      workspaceId,
      channelId,
      false,
    );
    const previousRuns =
      (await this.prisma.telegramAiPostingTestRun.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          id: { not: testRunId },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { publications: true },
      })) ?? [];
    const previousDrafts = previousRuns.flatMap((previousRun) => {
      const decoded = decodeAiPostingRunPublications(previousRun.publications);
      return decoded.publications.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return [];
        const post = value as Record<string, unknown>;
        return [
          {
            topic: typeof post.topic === 'string' ? post.topic : '',
            title: typeof post.title === 'string' ? post.title : '',
            text: typeof post.text === 'string' ? post.text.slice(0, 500) : '',
            imageSearchQuery: typeof post.imageSearchQuery === 'string' ? post.imageSearchQuery.slice(0, 120) : '',
            editorialMetadata: post.editorialMetadata,
          },
        ];
      });
    });
    const inventory = autopilotRunId
      ? await readAiPostingEditorialHistory(this.prisma, workspaceId, channelId, config.historyMode, config.historyFrom)
      : null;
    const known = [
      ...(inventory?.titles ?? []),
      ...sourceContext.existingPosts.map((post) => post.title),
      ...previousDrafts.flatMap((post) => [post.topic, post.title]),
    ]
      .map(normalize)
      .filter(Boolean);
    const planningOperations: Run[] = [];
    const slotOperations = Array.from({ length: count }, (): Run[] => []);
    const allOperations = () => [...planningOperations, ...slotOperations.flat()];
    const progress = createTelegramAiPostingProgress(count, testRunId, onProgress);
    const checkpointPublications = decodeAiPostingRunPublications(retrySlot?.publications);
    let pendingCheckpoint = Promise.resolve();
    const checkpoint = (includeProgress = true) => {
      const write = pendingCheckpoint.then(async () => {
        const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
          where: { id: testRunId, workspaceId, status: 'RUNNING' },
          data: {
            operations: [...(retrySlot?.operations ?? []), ...allOperations()],
            ...(includeProgress ? {
              publications: {
                ...encodeAiPostingRunPublications(checkpointPublications.publications, checkpointPublications.sourceDiagnostics),
                progress: { ...progress.snapshot, stages: { ...progress.snapshot.stages } },
                ...(background ? { background: true } : {}),
              },
            } : {}),
          },
        });
        if (background && !changed.count) throw new TelegramAiPostingRunStopped();
      });
      pendingCheckpoint = write.catch(() => {});
      return write;
    };
    const execute = telegramAiPostingBatchExecutor(async (request) => {
      if (autopilotRunId) {
        const active = await this.prisma.telegramAiPostingSettings.findFirst({
          where: { workspaceId, telegramChannelId: channelId, autopilotEnabled: true, autopilotLeaseExpiresAt: { gt: new Date() } },
          select: { id: true },
        });
        if (!active) throw new TelegramAiPostingRunStopped();
      }
      return this.gateway.execute(request);
    }, assertActive);
    const invocationContext = {
      userId, workspaceId, channelId, testRunId, autopilotRunId, mode,
      monthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
      progress, checkpoint, execute,
    };
    const { invoke } = createTelegramAiPostingInvocation({ ...invocationContext, operations: planningOperations });
    try {
      const recent = previousDrafts.flatMap(({ editorialMetadata }) =>
        editorialMetadata && typeof editorialMetadata === 'object' ? [editorialMetadata] : [],
      );
      recent.push(...(inventory?.usage ?? []));
      const editorialSelections = Array.from({ length: count }, (_, offset) => {
        if (retrySlot?.editorialAssignment || retrySlot?.legacyVote)
          return restoreTelegramAiPostingEditorialSelection(generationConfig, retrySlot.editorialAssignment ?? {}, retrySlot.legacyVote);
        const index = editorialOffset + (retrySlot?.publicationIndex ?? offset);
        const selection = telegramAiPostingEditorialSelection(generationConfig, index, index, recent, inventory?.rubricBoost);
        recent.push(selection);
        return selection;
      });
      const preferences = telegramAiPostingMediaPreferences(generationConfig);
      const byPreference = new Map(preferences.map((preference) => [preference.id, preference]));
      const visualDirections = editorialSelections.map((_, index) =>
        retrySlot?.editorialAssignment?.visualDirection ??
        (generationConfig.visualVariety === true ? telegramAiPostingVisualDirection(editorialOffset + (retrySlot?.publicationIndex ?? index)) : undefined),
      );
      const assignedPreferences = editorialSelections.map(({ sphere, parentSphere }) =>
        byPreference.get(sphere?.mediaPreferenceId ?? parentSphere?.mediaPreferenceId),
      );
      const topics: string[] = topicOverride ? [topicOverride] : [];
      if (!topicOverride && calendar) {
        const planning = telegramAiPostingPlanningContextText(calendar);
        const prompt = telegramAiPostingPlanPrompt(
          generationConfig, sourceContext, planning, count, [...previousDrafts, ...(inventory?.titles ?? []).map((title) => ({ title, topic: title, text: '' }))], editorialSelections, assignedPreferences, visualDirections,
        );
        for (const attempt of [1, 2]) {
          try {
            const reply = await invoke('planning', 'TELEGRAM_POSTING_PLAN', attempt === 1
              ? prompt
              : `${prompt}\nThe previous plan was invalid or repeated an existing topic. Use different subjects and exactly ${count} unique strings, in assignment order, with no other keys or prose.`, attempt);
            const proposed = parseTelegramAiPostingTopics(reply, count);
            const distinct = new Set(known);
            for (const topic of proposed) {
              const key = normalize(topic);
              if (!key || distinct.has(key))
                throw new BadGatewayException('AI_POSTING_TOPIC_REPETITION');
              distinct.add(key);
            }
            topics.push(...proposed);
            break;
          } catch (error) {
            const code = telegramAiPostingGenerationErrorCode(error);
            if (attempt === 2 || !['AI_POSTING_PLAN_INVALID', 'AI_POSTING_PLANNING_OUTPUT_INVALID', 'AI_POSTING_TOPIC_REPETITION'].includes(code))
              throw error;
          }
        }
      }
      if (topics.length < count)
        throw new BadGatewayException('AI_POSTING_TOPIC_REPETITION');
      const mediaRunState = createTelegramAiPostingMediaRunState();
      const channelAvatar = generationConfig.useChannelAvatarInMedia === true
        ? this.images.prepareChannelAvatar(channelPhotoUrl)
        : Promise.resolve(null);
      const results: Array<Awaited<ReturnType<typeof generateTelegramAiPostingDraft>> & {
        publicationIndex: number;
      }> = [];
      const failures: Array<{
        publicationIndex: number;
        topic: string;
        code: string;
        imageMode?: 'found' | 'ai';
        editorialAssignment?: TelegramAiPostingEditorialAssignment;
        reasons?: string[];
      }> = [];
      const planningCost = planningOperations.some(({ stage }) => stage === 'planning')
        ? telegramAiPostingRunCosts(planningOperations).planning
        : null;
      const allocatedPlanningCost = planningCost
        ? new Prisma.Decimal(planningCost)
            .div(count)
            .toDecimalPlaces(12, Prisma.Decimal.ROUND_UP)
            .toString()
        : null;
      const hybrid = generationConfig.imageMode === 'hybrid';
      const mediaModes = topics.slice(0, count).map((_, offset) => hybrid
        ? retrySlot?.imageMode ?? telegramAiPostingHybridMediaMode(
            editorialOffset + (retrySlot?.publicationIndex ?? offset), generationConfig.hybridSearchPercent,
          )
        : undefined);
      const requiresFound = (index: number) => !visualDirections[index] && assignedPreferences[index]?.purpose === 'SEARCH';
      for (const [index, imageMode] of mediaModes.entries()) {
        if (!requiresFound(index)) continue;
        if (hybrid && imageMode === 'ai') {
          const replacement = mediaModes.findIndex((mode, candidate) => mode === 'found' && !requiresFound(candidate));
          if (replacement !== -1) mediaModes[replacement] = 'ai';
        }
        mediaModes[index] = 'found';
      }
      const activeMedia = new Set<Promise<void>>();
      const generateSlot = async (topic: string, offset: number) => {
        const publicationIndex = retrySlot?.publicationIndex ?? offset;
        const imageMode = mediaModes[offset];
        const visualDirection = visualDirections[offset];
        const visualMotif = retrySlot?.editorialAssignment?.visualMotif ??
          (visualDirection ? telegramAiPostingVisualMotif(visualDirection, editorialOffset + publicationIndex) : undefined);
        const operations = slotOperations[offset];
        const invocation = createTelegramAiPostingInvocation({ ...invocationContext, operations, publicationIndex });
        const editorialSelection = editorialSelections[offset];
        let releaseMedia: (() => void) | undefined;
        try {
          const selectedSphere = editorialSelection.sphere;
          const publicationContext = selectedSphere
            ? {
                ...sourceContext,
                sourceContexts: sourceContext.sourceContexts.filter((item) =>
                  !item.includes('[website sphere-') ||
                  [selectedSphere, editorialSelection.parentSphere].some((sphere) =>
                    sphere && item.includes(`[website sphere-${String(sphere.id).slice(0, 80)}-`)),
                ),
              }
            : sourceContext;
          const generated = await generateTelegramAiPostingDraft(
            {
              userId,
              workspaceId,
              channelId,
              channelUsername: channel?.username,
              channelTitle: channel?.title,
              topic,
              imageMode,
              visualDirection,
              visualMotif,
              fallbackToGeneration: true,
              config: {
                ...generationConfig, editorialSelection,
                recentImageSearches: previousDrafts.map(({ imageSearchQuery }) => imageSearchQuery).filter(Boolean).slice(0, 5),
              },
              channelAvatar,
              watermarkChannelAvatar:
                generationConfig.useChannelAvatarInMedia === true,
              watermarkSizePercent: Number(generationConfig.channelAvatarWatermarkSize) || 12,
              watermarkX: Number(generationConfig.channelAvatarWatermarkX ?? 100),
              watermarkY: Number(generationConfig.channelAvatarWatermarkY ?? 100),
              watermarkOpacityPercent: Number(generationConfig.channelAvatarWatermarkOpacity) || 100,
              context: publicationContext,
              mediaRunState,
              execute,
              planningCost: allocatedPlanningCost,
              planningOperations,
              onMediaProgress: async () => {
                while (activeMedia.size >= 5) await Promise.race(activeMedia);
                const media = new Promise<void>((resolve) => { releaseMedia = resolve; });
                activeMedia.add(media);
                void media.then(() => activeMedia.delete(media));
                await invocation.startImage();
              },
              onImageSearchRound: async (round) => {
                if (background && round > 1) await invocation.startImage(round);
              },
              assertActive,
              invoke: invocation.invoke,
              operations,
              mode,
              testRunId,
              autopilotRunId,
              publicationIndex,
              aiDailyBudget: settings.aiDailyBudget?.toString() ?? null,
              aiMonthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
            },
            { images: this.images, costs: telegramAiPostingRunCosts },
          );
          const mediaReady = Boolean(generated.imageUrl) && generated.mediaReadiness === 'READY';
          const mediaStatus = mediaReady ? 'COMPLETED'
            : generated.mediaReadiness === 'MISSING' ? 'MISSING' : 'FAILED';
          invocation.finish(mediaStatus, 1);
          results.push({ ...generated, publicationIndex });
          const publication = { ...generated, publicationIndex, status: 'PENDING', rejectionReason: null, savedPostId: null };
          progress.emit({ stage: 'publication', status: mediaReady ? 'COMPLETED' : 'FAILED', publicationIndex, publication });
          if (background) {
            checkpointPublications.publications.push(publication);
            await checkpoint();
          }
          if (!mediaReady)
            failures.push({
              publicationIndex,
              topic,
              code: generated.mediaFailureCode ?? 'AI_POSTING_IMAGE_MISSING',
            });
        } catch (error) {
          if (error instanceof TelegramAiPostingRunStopped) throw error;
          const code = telegramAiPostingGenerationErrorCode(error);
          invocation.fail(code.startsWith('AI_POSTING_REVIEW_')
            ? 'review'
            : code.startsWith('AI_POSTING_IMAGE_') ? 'image' : 'text');
          const failedOperation =
            telegramAiPostingOperationFromError<Run>(error);
          if (failedOperation && !operations.some((item) => item.operationId === failedOperation.operationId))
            operations.push({ ...failedOperation, publicationIndex });
          failures.push({
            publicationIndex,
            topic,
            code: telegramAiPostingGenerationErrorCode(error),
            ...(imageMode ? { imageMode } : {}),
            editorialAssignment: {
              ...(visualDirection ? { visualDirection, visualMotif } : {}),
              ...(editorialSelection.sphere?.id ? { sphereId: editorialSelection.sphere.id } : {}),
              ...(editorialSelection.rubric?.id ? { rubricId: editorialSelection.rubric.id } : {}),
              ...(editorialSelection.lengths.length === 1 ? { lengthId: editorialSelection.lengths[0].id } : {}),
            },
            ...(telegramAiPostingGenerationErrorReasons(error).length
              ? { reasons: telegramAiPostingGenerationErrorReasons(error) }
              : {}),
          });
          progress.emit({ stage: 'publication', status: 'FAILED', publicationIndex });
          if (background) await checkpoint();
        } finally {
          releaseMedia?.();
        }
      };
      const outcomes = await Promise.allSettled(topics.slice(0, count).map(generateSlot));
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason;
      }
      results.sort((left, right) => left.publicationIndex - right.publicationIndex);
      failures.sort((left, right) => left.publicationIndex - right.publicationIndex);
      const operations = allOperations();
      if (!results.length)
        throw new BadGatewayException({
          code: 'AI_POSTING_NO_DRAFTS_CREATED',
          failures,
          operations,
        });
      return {
        generated: results,
        failures,
        requested: count,
        settingsVersion: settings.configurationVersion,
        operations,
        sourceDiagnostics: sourceContext.sourceDiagnostics,
        unknownImageCost: results.some((item) => item.imageCostUnknown),
      };
    } catch (error) {
      if (error && typeof error === 'object')
        Object.assign(error, {
          postingOperations: allOperations(),
          sourceDiagnostics: sourceContext.sourceDiagnostics,
        });
      throw error;
    }
  }
}
