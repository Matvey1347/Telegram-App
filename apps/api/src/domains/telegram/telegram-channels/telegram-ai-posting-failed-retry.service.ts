import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      select: { version: true, failures: true },
    });
    if (!run) throw new NotFoundException('AI Posting test run not found');
    if (run.version !== expectedVersion)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    const failures = Array.isArray(run.failures) ? run.failures : [];
    const failure = failures[failureIndex];
    const topic =
      failure &&
      typeof failure === 'object' &&
      !Array.isArray(failure) &&
      'topic' in failure &&
      typeof failure.topic === 'string'
        ? failure.topic.trim().slice(0, 200)
        : '';
    if (!topic) throw new NotFoundException('AI_POSTING_FAILURE_NOT_RETRYABLE');

    return this.generator.generate(
      userId,
      channelId,
      1,
      'MANUAL',
      undefined,
      onProgress,
      topic,
    );
  }
}
