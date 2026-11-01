import { Prisma } from '@prisma/client';
import { TelegramCrmManualRetentionService } from './telegram-crm-manual-retention.service';
describe('bounded manual Instagram activity retention', () => {
  it('does no startup work and deletes only old manual reports with one existing-maintenance query', async () => {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockResolvedValue(3);
    const service = new TelegramCrmManualRetentionService({
      $executeRaw: execute,
    } as never);
    expect(execute).not.toHaveBeenCalled();
    expect(await service.cleanup(new Date('2026-11-01T12:00:00Z'))).toBe(3);
    const query = execute.mock.calls[0][0];
    expect(query.values).toContain(20_000);
    expect(query.values).toContainEqual(new Date('2025-11-01T12:00:00Z'));
    expect(query.text).toContain(
      "metadata->>'kind' IN ('MANUAL_ACTIVITY', 'INSTAGRAM_IDENTITY')",
    );
    expect(query.text).toContain("metadata->>'channel' = 'INSTAGRAM'");
    expect(query.text).toContain('"createdAt"');
    expect(query.text).toContain('SKIP LOCKED');
    expect(query.text).toContain('NOT EXISTS');
    expect(query.text).toContain('sourceAdvertiserActivityId');
    expect(query.text).toContain('a."saleId" IS NULL');
    expect(query.text).not.toContain('TelegramCrmMessage');
    expect(query.text).not.toContain('AiOperation');
  });
  it('surfaces a failed pass without a retry or timer', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      new TelegramCrmManualRetentionService({
        $executeRaw: execute,
      } as never).cleanup(),
    ).rejects.toThrow('database unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
