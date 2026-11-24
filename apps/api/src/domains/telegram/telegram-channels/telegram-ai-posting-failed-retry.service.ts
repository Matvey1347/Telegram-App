import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canRetryTelegramAiPostingText, telegramAiPostingRunSlots } from '@telegram-system/shared';
import { decodeAiPostingRunPublications } from './telegram-ai-posting-run-data';
import type { TelegramAiPostingRetrySlot } from './telegram-ai-posting-generation-store';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import type { TelegramAiPostingProgress } from './telegram-ai-posting-progress';

@Injectable()
export class TelegramAiPostingFailedRetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly generator: TelegramAiPostingGeneratorService,
  ) {}

  async regenerateFailedPublication(
    userId: string,
    channelId: string,
    runId: string,
    failureIndex: number,
    expectedVersion: number,
    onProgress?: (
      item: TelegramAiPostingProgress,
      current: number,
      total: number,
    ) => void,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const run = await this.prisma.telegramAiPostingTestRun.findFirst({
      where: { id: runId, workspaceId, telegramChannelId: channelId },
      select: { version: true, status: true, failures: true, requestedCount: true, publications: true, operations: true },
    });
    if (!run) throw new NotFoundException('AI Posting test run not found');
    if (run.version !== expectedVersion || run.status === 'RUNNING')
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    const failures = Array.isArray(run.failures) ? run.failures : [];
    const failure = failures[failureIndex];
    if (!failure || typeof failure !== 'object' || Array.isArray(failure))
      throw new NotFoundException('AI_POSTING_FAILURE_NOT_RETRYABLE');
    const topic = typeof failure.topic === 'string' ? failure.topic.trim().slice(0, 200) : '';
    const reasons = Array.isArray(failure.reasons)
      ? failure.reasons.filter((reason): reason is string => typeof reason === 'string')
      : undefined;
    if (topic && (canRetryTelegramAiPostingText({ code: String(failure.code), reasons, retryText: failure.retryText === true }))) {
      const publicationIndex = telegramAiPostingRunSlots({
        requestedCount: run.requestedCount,
        publications: decodeAiPostingRunPublications(run.publications).publications as Parameters<typeof telegramAiPostingRunSlots>[0]['publications'],
        failures: failures as Parameters<typeof telegramAiPostingRunSlots>[0]['failures'],
      }).findIndex((slot) => slot.failureIndex === failureIndex);
      if (publicationIndex < 0 || publicationIndex >= run.requestedCount)
        throw new NotFoundException('AI_POSTING_FAILURE_NOT_RETRYABLE');
      const assignment = failure.editorialAssignment;
      const editorialAssignment = assignment && typeof assignment === 'object' && !Array.isArray(assignment) && Object.keys(assignment).length ? {
        sphereId: typeof assignment.sphereId === 'string' ? assignment.sphereId : undefined,
        rubricId: typeof assignment.rubricId === 'string' ? assignment.rubricId : undefined,
        lengthId: typeof assignment.lengthId === 'string' ? assignment.lengthId : undefined,
      } : undefined;
      const slot: TelegramAiPostingRetrySlot = {
        ...run,
        id: runId,
        failures,
        operations: Array.isArray(run.operations) ? run.operations as unknown as TelegramAiPostingRetrySlot['operations'] : [],
        failureIndex,
        editorialAssignment,
        legacyVote: !editorialAssignment && reasons?.some((reason) => /two separate voting options/iu.test(reason)),
        publicationIndex,
        imageMode: failure.imageMode === 'found' || failure.imageMode === 'ai' ? failure.imageMode : undefined,
      };
      return this.generator.generate(userId, channelId, 1, 'MANUAL', undefined, onProgress, topic, slot);
    }
    return this.generator.generate(
      userId,
      channelId,
      1,
      'MANUAL',
      undefined,
      onProgress,
      topic || undefined,
    );
  }
}
