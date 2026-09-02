import { TelegramCrmAutomationClaimService } from './telegram-crm-automation-claim.service';

describe('TelegramCrmAutomationClaimService', () => {
  function sqlText(value: { strings?: readonly string[] }) {
    return value.strings?.join('?') ?? String(value);
  }

  it('atomically reclaims expired SENDING with SKIP LOCKED', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'execution-1' }]),
    };
    const service = new TelegramCrmAutomationClaimService(prisma as never);

    await expect(service.claim(25)).resolves.toEqual(['execution-1']);
    const sql = sqlText(prisma.$queryRaw.mock.calls[0]![0]);
    expect(sql).toContain("'SENDING'");
    expect(sql).toContain('"leaseExpiresAt" <=');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('"attempts" < "maxAttempts"');
    expect(sql).toContain('AMBIGUOUS_SEND_RECOVERY');
  });

  it('terminalizes exhausted ambiguous states through a bounded locked CTE', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({ $queryRaw: queryRaw }),
      ),
    };
    const service = new TelegramCrmAutomationClaimService(prisma as never);

    await service.terminalizeExhausted(25);
    const sql = sqlText(queryRaw.mock.calls[0]![0]);
    expect(sql).toContain("'SENDING'");
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('AMBIGUOUS_SEND_UNRESOLVED');
    expect(sql).toContain('outcome remains ambiguous');
  });
});
