import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmAiDraftRetentionService } from './telegram-crm-ai-draft-retention.service';

describe('bounded CRM AI draft retention', () => {
  it('does no startup work and deletes expired drafts in one indexed bounded pass without ledger refunds', async () => {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockResolvedValue(42);
    const service = new TelegramCrmAiDraftRetentionService({
      $executeRaw: execute,
    } as unknown as PrismaService);
    expect(execute).not.toHaveBeenCalled();
    const now = new Date('2026-11-01T01:00:00Z');
    expect(await service.cleanup(now)).toBe(42);
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = execute.mock.calls[0][0];
    expect(sql.text).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql.text).toContain("status NOT IN ('GENERATING', 'UNKNOWN')");
    expect(sql.text).toContain('"expiresAt" <');
    expect(sql.values).toContain(10_000);
    expect(sql.values).toContain(now);
    expect(sql.text).not.toContain('AiBudgetPeriod');
    expect(sql.text).not.toContain('AiOperation');
  });
  it('surfaces cleanup failure without retries or deleting usage', async () => {
    const execute: jest.MockedFunction<PrismaClient['$executeRaw']> = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    const service = new TelegramCrmAiDraftRetentionService({
      $executeRaw: execute,
    } as unknown as PrismaService);
    await expect(service.cleanup()).rejects.toThrow('database unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
