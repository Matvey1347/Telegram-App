import {
  BadGatewayException,
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

type Run = {
  stage: string;
  attempt: number;
  operationId: string;
  category: string;
  model: string;
  status: string;
  actualCost: string | null;
  pricingStatus: string;
  inputTokens: number | null;
  outputTokens: number | null;
};
type TestPublication = {
  topic: string;
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string | null;
  imageSourceId: string | null;
  format: string;
  category: string;
  reviewNotes: string[];
  costs: Record<string, string | null>;
  operations: Run[];
  ideaSources: unknown[];
  status: string;
  rejectionReason: string | null;
  savedPostId: string | null;
};

@Injectable()
export class TelegramAiPostingTestRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly gateway: AiGateway,
    private readonly posts: TelegramManagedPostCommandService,
    private readonly revisions: TelegramManagedPostRevisionStore,
    private readonly images: TelegramAiPostingImageService,
  ) {}

  async listRuns(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return this.prisma.telegramAiPostingTestRun.findMany({
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
    const publications = run.publications as unknown as TestPublication[];
    const item = publications[index];
    if (!item) throw new NotFoundException('AI Posting publication not found');
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
      const runs = run.operations as unknown as Run[];
      const textAttempt =
        item.operations.filter((operation) => operation.stage === 'text')
          .length + 1;
      const prompt = `Return only JSON {"title":string,"text":string,"imagePrompt":string}. Rewrite this Telegram publication according to the user's current channel rules. Topic: ${item.topic}. Rules: ${JSON.stringify(config).slice(0, 8000)}. User feedback: ${value?.slice(0, 1000) ?? 'Improve clarity and distinctiveness'}. Existing text: ${item.text}`;
      const result = await this.gateway.execute({
        userId,
        workspaceId,
        category: 'TELEGRAM_POSTING_TEXT',
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
          dailyBudget: settings.aiDailyBudget?.toString() ?? null,
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
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
        );
        throw new BadGatewayException('AI_POSTING_TEXT_REGENERATION_FAILED');
      }
      const rewritten = this.parseJson(
        (result.result as { reply?: string }).reply ?? '',
      );
      if (
        !rewritten ||
        typeof rewritten.title !== 'string' ||
        typeof rewritten.text !== 'string' ||
        !rewritten.text.trim()
      ) {
        item.operations.push(operation);
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
        );
        throw new BadGatewayException('AI_POSTING_TEXT_REGENERATION_INVALID');
      }
      item.title = rewritten.title.trim();
      item.text = this.applyFormatting(rewritten.text, config);
      if (item.text.length > (item.imageUrl ? 1024 : 4096))
        throw new BadGatewayException('AI_POSTING_TELEGRAM_LENGTH');
      if (typeof rewritten.imagePrompt === 'string')
        item.imagePrompt = rewritten.imagePrompt;
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
          dailyBudget: settings.aiDailyBudget?.toString() ?? null,
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
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
        );
        throw new BadGatewayException('AI_POSTING_REVIEW_REGENERATION_FAILED');
      }
      const verdict = this.parseJson(
        (reviewResult.result as { reply?: string }).reply ?? '',
      );
      if (!verdict || verdict.approved !== true) {
        item.operations.push(operation, reviewOperation);
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          runs,
          'PARTIAL',
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
      await this.writeTestRun(
        run.id,
        workspaceId,
        expectedVersion,
        publications,
        runs,
        'PARTIAL',
      );
      return { ...run, version: expectedVersion + 1, publications };
    }
    if (action === 'regenerate-image') {
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
      if (item.text.length > 1024)
        throw new ConflictException('AI_POSTING_TELEGRAM_LENGTH_WITH_IMAGE');
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
          imageCandidates: [],
          prompt: item.imagePrompt,
          mode: 'MANUAL',
          aiPosting: {
            channelId,
            testRunId: run.id,
            publicationIndex: index,
            attempt:
              item.operations.filter((operation) => operation.stage === 'image')
                .length + 1,
            postingMode: 'TEST',
            dailyBudget: settings.aiDailyBudget?.toString() ?? null,
            monthlyBudget: settings.aiMonthlyBudget?.toString() ?? null,
          },
        });
      } catch (error) {
        const failedOperation = this.operationFromError(error);
        if (failedOperation) {
          const operations = run.operations as unknown as Run[];
          operations.push(failedOperation);
          item.operations.push(failedOperation);
          item.costs.image = addKnownCost(
            item.costs.image,
            failedOperation.actualCost,
            failedOperation.pricingStatus,
          );
          await this.writeTestRun(
            run.id,
            workspaceId,
            expectedVersion,
            publications,
            operations,
            'PARTIAL',
          );
        }
        throw error;
      }
      if (!resolved.image)
        throw new BadGatewayException('AI_POSTING_IMAGE_REGENERATION_FAILED');
      item.imageUrl = resolved.image.url;
      item.imageSourceId = resolved.image.sourceId;
      item.status = 'PENDING';
      if (resolved.operation) {
        const operations = run.operations as unknown as Run[];
        operations.push(resolved.operation);
        item.operations.push(resolved.operation);
        item.costs.image = addKnownCost(
          item.costs.image,
          resolved.operation.actualCost,
          resolved.operation.pricingStatus,
        );
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          operations,
          'PARTIAL',
        );
      } else {
        await this.writeTestRun(
          run.id,
          workspaceId,
          expectedVersion,
          publications,
          run.operations as unknown as Run[],
          'PARTIAL',
        );
      }
      return { ...run, version: expectedVersion + 1, publications };
    }
    if (action === 'reject' && !value?.trim())
      throw new ConflictException('AI_POSTING_REJECTION_REASON_REQUIRED');
    if (action === 'edit') {
      if (!value?.trim() || value.length > (item.imageUrl ? 1024 : 4096))
        throw new ConflictException('AI_POSTING_EDIT_TEXT_INVALID');
      item.text = value.trim();
      item.status = 'EDITED';
    } else if (action === 'approve') {
      item.status = 'APPROVED';
      item.rejectionReason = null;
    } else if (action === 'reject') {
      item.status = 'REJECTED';
      item.rejectionReason = value!.trim().slice(0, 1000);
    } else {
      if (item.savedPostId) return { ...run, publication: item };
      if (value !== undefined) {
        if (!value.trim() || value.length > (item.imageUrl ? 1024 : 4096))
          throw new ConflictException('AI_POSTING_EDIT_TEXT_INVALID');
        item.text = value.trim();
      }
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
        const post = await this.posts.createManagedPostRecord(tx, {
          ...prepared,
          imageUrls: item.imageUrl ? [item.imageUrl] : [],
          mediaItems: item.imageUrl
            ? [{ kind: 'PHOTO', url: item.imageUrl }]
            : [],
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
            publications: publications as unknown as Prisma.InputJsonArray,
            version: { increment: 1 },
          },
        });
        if (!saved.count)
          throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
        return post;
      });
      if (!result.id) throw new ConflictException('AI_POSTING_SAVE_FAILED');
      return { ...run, version: expectedVersion + 2, publications };
    }
    const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
      where: { id: run.id, workspaceId, version: expectedVersion },
      data: {
        publications: publications as unknown as Prisma.InputJsonArray,
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    return { ...run, version: expectedVersion + 1, publications };
  }

  private async writeTestRun(
    id: string,
    workspaceId: string,
    version: number,
    publications: TestPublication[],
    operations: Run[],
    status: string,
  ) {
    const cost = (stage: string): Prisma.Decimal | null => {
      const matching = operations.filter(
        (operation) => operation.stage === stage,
      );
      if (
        matching.some(
          (operation) =>
            operation.actualCost === null &&
            operation.pricingStatus !== 'NOT_SENT',
        )
      )
        return null;
      return matching.reduce(
        (total, operation) => total.add(operation.actualCost ?? 0),
        new Prisma.Decimal(0),
      );
    };
    const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
      where: { id, workspaceId, version },
      data: {
        publications: publications as unknown as Prisma.InputJsonArray,
        operations: operations,
        planningCost: cost('planning'),
        textCost: cost('text'),
        imageCost: cost('image'),
        reviewCost: cost('review'),
        status,
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
  }

  private applyFormatting(text: string, config: Record<string, any>) {
    const tags = [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
    let clean = text
      .replace(/#[\p{L}\p{N}_]+/gu, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (config.ending && !clean.endsWith(String(config.ending).trim()))
      clean = `${clean}\n\n${String(config.ending).trim()}`;
    if (config.hashtags === 'start' && tags.length)
      clean = `${tags.join(' ')}\n\n${clean}`;
    if (config.hashtags === 'end' && tags.length)
      clean = `${clean}\n\n${tags.join(' ')}`;
    return clean;
  }

  private parseJson(value: string): Record<string, any> | null {
    const cleaned = value
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      const parsed: unknown = JSON.parse(cleaned);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }

  private errorCode(error: unknown) {
    if (error instanceof BadGatewayException) {
      const response = error.getResponse();
      return typeof response === 'string'
        ? response
        : ((response as any).code ??
            (response as any).message ??
            'AI_POSTING_GENERATION_FAILED');
    }
    return 'AI_POSTING_GENERATION_FAILED';
  }

  private operationFromError(error: unknown): Run | null {
    if (!(error instanceof BadGatewayException)) return null;
    const response = error.getResponse();
    if (!response || typeof response !== 'object' || !('operation' in response))
      return null;
    const operation = (response as { operation?: Run }).operation;
    return operation && typeof operation.operationId === 'string'
      ? operation
      : null;
  }
}

function addKnownCost(
  current: string | null,
  next: string | null,
  pricingStatus: string,
) {
  if (current === null || (next === null && pricingStatus !== 'NOT_SENT'))
    return null;
  return new Prisma.Decimal(current).add(next ?? 0).toString();
}
