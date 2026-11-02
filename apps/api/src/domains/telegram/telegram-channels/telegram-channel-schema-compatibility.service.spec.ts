import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';

describe('TelegramChannelSchemaCompatibilityService', () => {
  it('checks import storage read-only and caches the result', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ available: true }]),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new TelegramChannelSchemaCompatibilityService(
      prisma as never,
    );
    await service.ensureTelegramChannelImportPolicyColumnsAvailable();
    await service.ensureTelegramChannelImportPolicyColumnsAvailable();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires a migration when import storage is missing and never repairs it at runtime', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ available: false }]),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new TelegramChannelSchemaCompatibilityService(
      prisma as never,
    );
    await expect(
      service.ensureTelegramChannelImportPolicyColumnsAvailable(),
    ).rejects.toThrow('TELEGRAM_CHANNEL_IMPORT_SCHEMA_MIGRATION_REQUIRED');
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('does not request an exclusive PostGroup lock when the migrated schema is present', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          hasIsSystem: true,
          hasSystemKey: true,
          hasSystemKeyIndex: true,
        },
      ]),
      $transaction: jest.fn(),
    };
    const service = new TelegramChannelSchemaCompatibilityService(
      prisma as never,
    );

    await service.ensurePostGroupSystemColumnsAvailable();
    await service.ensurePostGroupSystemColumnsAvailable();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bounds compatibility DDL with a transaction-local lock timeout', async () => {
    const transactionClient = { $executeRawUnsafe: jest.fn() };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          hasIsSystem: false,
          hasSystemKey: false,
          hasSystemKeyIndex: false,
        },
      ]),
      $transaction: jest.fn(
        (run: (client: typeof transactionClient) => Promise<unknown>) =>
          run(transactionClient),
      ),
    };
    const service = new TelegramChannelSchemaCompatibilityService(
      prisma as never,
    );

    await service.ensurePostGroupSystemColumnsAvailable();

    expect(transactionClient.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      "SET LOCAL lock_timeout = '5s'",
    );
    expect(transactionClient.$executeRawUnsafe).toHaveBeenCalledTimes(3);
  });
});
