import { TelegramAiPostingAutopilotNotificationService } from './telegram-ai-posting-autopilot-notification.service';

describe('TelegramAiPostingAutopilotNotificationService', () => {
  const setup = () => {
    const notify = jest.fn().mockResolvedValue({ failed: 0 });
    const prisma: any = {
      telegramAiPostingAutopilotStage: { create: jest.fn() },
    };
    const moduleRef: any = {
      resolve: jest.fn().mockResolvedValue({ notify }),
    };
    return {
      service: new TelegramAiPostingAutopilotNotificationService(
        prisma,
        moduleRef,
      ),
      notify,
      prisma,
    };
  };

  it('sends immediate critical events and the scheduled weekly report', async () => {
    const { service, notify } = setup();
    await service.emitRunSummary('ws', 'channel', 'run', {
      coverageDays: 4,
      targetCoverageDays: 14,
      criticalDraftThreshold: 10,
      readyDrafts: 3,
      generated: 2,
      scheduledInWindow: 8,
      errors: ['AI_API_UNAVAILABLE'],
      scheduleMode: 'LOCAL',
    });

    expect(notify.mock.calls.map(([input]) => input.event)).toEqual([
      'LOW_SCHEDULE_COVERAGE',
      'CRITICAL_DRAFT_STOCK',
      'AI_API_OR_BUDGET_FAILURE',
      'WEEKLY_REPLENISHMENT',
      'WEEKLY_REPORT',
    ]);
    expect(notify.mock.calls[1][0].priority).toBe('HIGH');
  });

  it('records notification errors without leaking the raw exception', async () => {
    const { service, notify, prisma } = setup();
    notify.mockRejectedValue(new Error('SMTP_PASSWORD=secret'));
    await service.emitRunSummary('ws', 'channel', 'run', {
      coverageDays: 14,
      targetCoverageDays: 14,
      criticalDraftThreshold: 1,
      readyDrafts: 4,
      generated: 0,
      scheduledInWindow: 10,
      errors: [],
      scheduleMode: 'TELEGRAM_NATIVE',
    });

    expect(prisma.telegramAiPostingAutopilotStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run',
          stage: 'NOTIFICATIONS',
          errorMessage: 'AUTOPILOT_STAGE_FAILED',
        }),
      }),
    );
  });
});
