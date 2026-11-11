import { TelegramAiPostingRuleFeedbackService } from './telegram-ai-posting-rule-feedback.service';

describe('TelegramAiPostingRuleFeedbackService', () => {
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const gateway = { execute: jest.fn() };
  const run = {
    id: 'run-1',
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    version: 3,
    feedback: [],
    operations: [],
    textCost: '0',
  };
  const prisma = {
    telegramAiPostingSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAiPostingTestRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new TelegramAiPostingRuleFeedbackService(
    prisma as never,
    workspace as never,
    gateway as never,
  );
  beforeEach(() => jest.clearAllMocks());

  it('stores a pending rule proposal without applying channel settings', async () => {
    prisma.telegramAiPostingTestRun.findFirst.mockResolvedValue(run);
    prisma.telegramAiPostingTestRun.updateMany.mockResolvedValue({ count: 1 });
    gateway.execute.mockResolvedValue({
      operation: {
        operationId: 'operation-1',
        category: 'TELEGRAM_POSTING_TEXT',
        model: 'configured-text-model',
        status: 'SUCCEEDED',
        actualCost: '0.01',
        pricingStatus: 'PRICED',
        inputTokens: 10,
        outputTokens: 10,
      },
      result: {
        reply: JSON.stringify({
          type: 'add_rule',
          text: 'Use more practical examples',
          reason: 'This addresses the review feedback.',
        }),
      },
    });

    const result = await service.suggestRuleChange(
      'user-1',
      'channel-1',
      'run-1',
      3,
      'Please add more practical examples',
    );

    expect(result.suggestion.status).toBe('PENDING_CONFIRMATION');
    expect(prisma.telegramAiPostingTestRun.updateMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies a feedback rule and writes its configuration snapshot in the same transaction', async () => {
    const settings = {
      id: 'settings-1',
      configurationVersion: 4,
      configuration: { rules: [] },
    };
    const tx = {
      telegramAiPostingTestRun: {
        findFirst: jest.fn().mockResolvedValue({
          ...run,
          version: 3,
          feedback: [
            {
              id: 'suggestion-1',
              type: 'add_rule',
              text: 'Use examples',
              status: 'PENDING_CONFIRMATION',
            },
          ],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramAiPostingSettings: {
        findFirst: jest.fn().mockResolvedValue(settings),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramAiPostingSettingsVersion: {
        create: jest.fn().mockResolvedValue({ version: 5 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await service.confirmRuleChange(
      'user-1',
      'channel-1',
      'run-1',
      'suggestion-1',
      3,
    );

    expect(tx.telegramAiPostingSettings.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          configurationVersion: { increment: 1 },
        }),
      }),
    );
    expect(tx.telegramAiPostingSettingsVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsId: 'settings-1',
          version: 5,
          changeSource: 'feedback',
          configuration: expect.objectContaining({
            rules: [
              expect.objectContaining({
                text: 'Use examples',
                source: 'feedback',
                active: true,
              }),
            ],
          }),
        }),
      }),
    );
  });
});
