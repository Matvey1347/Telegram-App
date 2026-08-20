import { OperationalHistoryRetentionService } from './operational-history-retention.service';

describe('OperationalHistoryRetentionService', () => {
  it('deletes only explicitly terminal history before each cutoff', async () => {
    const deleted = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      telegramBotUpdateLog: { deleteMany: deleted },
      telegramBotDelivery: { deleteMany: deleted },
      scheduledTaskRun: { deleteMany: deleted },
      telegramSystemBotUpdateLog: { deleteMany: deleted },
    } as any;
    const service = new OperationalHistoryRetentionService(prisma);

    await expect(
      service.cleanup(new Date('2026-08-09T00:00:00.000Z')),
    ).resolves.toEqual({
      updateLogs: 2,
      deliveries: 2,
      scheduledTaskRuns: 2,
      systemBotUpdateLogs: 2,
    });
    expect(prisma.telegramBotDelivery.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: ['SENT', 'FAILED', 'CANCELLED'] },
      }),
    });
    expect(prisma.scheduledTaskRun.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        finishedAt: { lt: expect.any(Date) },
        status: { in: ['SUCCESS', 'FAILED', 'SKIPPED'] },
      }),
    });
  });
});
