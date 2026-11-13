import { ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingFailedRetryService } from './telegram-ai-posting-failed-retry.service';

describe('TelegramAiPostingFailedRetryService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-a'),
  };
  const prisma = {
    telegramAiPostingTestRun: { findFirst: jest.fn() },
  };
  const generator = { generate: jest.fn() };
  const service = new TelegramAiPostingFailedRetryService(
    prisma as never,
    workspace as never,
    generator as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.resolveWorkspaceIdForUser.mockResolvedValue('workspace-a');
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      version: 2,
      failures: [
        {
          topic: 'A channel specific topic',
          code: 'AI_POSTING_REVIEW_REJECTED',
        },
      ],
    });
    generator.generate.mockResolvedValue({
      generated: [{ title: 'Regenerated' }],
    });
  });

  it('regenerates the failed topic as a fresh single publication', async () => {
    const onProgress = jest.fn();

    await service.regenerateFailedPublication(
      'user-a',
      'channel-a',
      'run-a',
      0,
      2,
      onProgress,
    );

    expect(prisma.telegramAiPostingTestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-a',
        workspaceId: 'workspace-a',
        telegramChannelId: 'channel-a',
      },
      select: { version: true, failures: true },
    });
    expect(generator.generate).toHaveBeenCalledWith(
      'user-a',
      'channel-a',
      1,
      'MANUAL',
      undefined,
      onProgress,
      'A channel specific topic',
    );
  });

  it('rejects stale runs and failures without a topic', async () => {
    await expect(
      service.regenerateFailedPublication('user-a', 'channel-a', 'run-a', 0, 1),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue({
      version: 2,
      failures: [{ code: 'AI_POSTING_DRAFT_INVALID' }],
    });
    await expect(
      service.regenerateFailedPublication('user-a', 'channel-a', 'run-a', 0, 2),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(generator.generate).not.toHaveBeenCalled();
  });
});
