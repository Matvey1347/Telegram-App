import { TelegramAiPostingAutopilotService } from './telegram-ai-posting-autopilot.service';
import { TelegramAiPostingAutopilotChannelService } from './telegram-ai-posting-autopilot-channel.service';

describe('TelegramAiPostingAutopilotService', () => {
  const row = {
    id: 'settings', workspaceId: 'ws', telegramChannelId: 'channel',
    configurationVersion: 3, autopilotNextRunAt: new Date(), autopilotRetryOfRunId: null,
  };
  function setup() {
    const prisma = {
      telegramAiPostingSettings: { findMany: jest.fn().mockResolvedValue([row]), findFirst: jest.fn(), updateMany: jest.fn() },
      telegramAiPostingAutopilotRun: { create: jest.fn().mockResolvedValue({ id: 'run' }), update: jest.fn(), deleteMany: jest.fn() },
      telegramAiPostingAutopilotStage: { create: jest.fn() },
    };
    const channel = { run: jest.fn().mockResolvedValue({ status: 'COMPLETED', generated: 2, scheduled: 1, errors: [], nextCheckHours: 2 }) };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(async (token) => token === TelegramAiPostingAutopilotChannelService
        ? channel : { retryDueDeliveries: async () => ({ delivered: 0, failed: 0 }), nextDueDeliveryAt: async () => null }),
    };
    const notifications = { emitRunSummary: jest.fn(), emitRunFailure: jest.fn() };
    const service = new TelegramAiPostingAutopilotService(prisma as never, moduleRef as never, {} as never, notifications as never);
    return { service, prisma, channel, notifications, moduleRef };
  }

  it('runs under the claimed workspace context, releases its lease and reports the result', async () => {
    const { service, prisma, channel, notifications, moduleRef } = setup();
    prisma.telegramAiPostingSettings.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.processDueBatch()).resolves.toMatchObject({ processed: 1, generated: 2, scheduled: 1, failed: 0 });
    expect(channel.run).toHaveBeenCalledWith('ws', 'channel', 'run', expect.any(String));
    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith({ headers: { 'x-workspace-id': 'ws' } }, expect.any(Object));
    expect(prisma.telegramAiPostingSettings.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'settings', autopilotLeaseOwner: expect.any(String) }),
      data: expect.objectContaining({ autopilotLeaseOwner: null, autopilotNextRunAt: expect.any(Date) }),
    }));
    expect(notifications.emitRunSummary).toHaveBeenCalledTimes(1);
  });

  it('never starts work when a second worker lost the lease claim', async () => {
    const { service, prisma, channel } = setup();
    prisma.telegramAiPostingSettings.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await service.processDueBatch();
    await expect(service.processDueBatch()).resolves.toMatchObject({ processed: 0, failed: 0 });
    expect(channel.run).toHaveBeenCalledTimes(1);
  });

  it('marks a lost lease as failed rather than completing a stale run', async () => {
    const { service, prisma, notifications } = setup();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue({ autopilotEnabled: true });
    prisma.telegramAiPostingSettings.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.processDueBatch()).resolves.toMatchObject({ failed: 1 });
    expect(notifications.emitRunSummary).not.toHaveBeenCalled();
    expect(prisma.telegramAiPostingAutopilotRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });

  it('leaves the due scheduler idle when every channel is disabled', async () => {
    const { service, prisma } = setup();
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    await expect(service.nextDueAt()).resolves.toBeNull();
  });
});
