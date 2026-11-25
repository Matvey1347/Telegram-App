import { TelegramAiPostingAutopilotNotificationService } from './telegram-ai-posting-autopilot-notification.service';

describe('TelegramAiPostingAutopilotNotificationService', () => {
  const setup = () => {
    const notify = jest.fn().mockResolvedValue({ failed: 0 });
    const prisma: any = {
      workspace: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({
            autopilotNotificationDestination: 'TELEGRAM_GROUP',
            autopilotErrorNotificationDestination: 'TELEGRAM_PRIVATE',
          }),
      },
      telegramChannel: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'channel',
            title: 'Editorial🍃',
            username: 'editorial_channel',
          }),
      },
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

  it('routes one compact report with errors to the chosen destination', async () => {
    const { service, notify } = setup();
    await service.emitRunSummary('ws', 'channel', 'run', {
      coverageDays: 4,
      targetCoverageDays: 14,
      criticalDraftThreshold: 10,
      readyDrafts: 3,
      generated: 2,
      scheduled: 3,
      scheduledInWindow: 8,
      scheduledThrough: '2026-12-03T17:00:00Z',
      channelTitle: 'Editorial',
      costs: { text: '0.003', search: '0.007' },
      unknownCosts: 1,
      costBreakdown: { successful: '0.003', failed: '0.007', shared: '0', unknownByBucket: { successful: 0, failed: 1, shared: 0 } },
      rubrics: ['Reader poll'],
      errors: ['AI_API_UNAVAILABLE'],
      scheduleMode: 'LOCAL',
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'WEEKLY_REPORT',
        destination: 'TELEGRAM_PRIVATE',
      }),
    );
    const report = notify.mock.calls.at(-1)?.[0];
    expect(report).toMatchObject({
      title: 'Editorial',
      metadata: { scheduled: 3 },
    });
    expect(report.body).toContain('Черновики · +2');
    expect(report.metadata.telegramHtml).toContain(
      '<a href="https://t.me/editorial_channel">Editorial</a>',
    );
    expect(report.metadata.telegramHtml).toContain('⚠️ Ошибки · 1');
    for (const line of ['Готовые публикации · $0.003', 'Публикации с ошибками · $0.007', 'Всего · $0.01']) {
      expect(report.body).toContain(line);
      expect(report.metadata.telegramHtml).toContain(line);
    }
    expect(report.body).toContain('есть неподтверждённые расходы');
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
