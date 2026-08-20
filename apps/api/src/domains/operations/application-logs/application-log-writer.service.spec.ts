import { ApplicationLogWriterService } from './application-log-writer.service';

describe('ApplicationLogWriterService idle behavior', () => {
  const originalBatchSize = process.env.APP_LOG_BATCH_SIZE;
  const originalFlushInterval = process.env.APP_LOG_FLUSH_INTERVAL_MS;

  beforeAll(() => jest.useFakeTimers());
  beforeEach(() => {
    jest.clearAllTimers();
    process.env.APP_LOG_BATCH_SIZE = '50';
    process.env.APP_LOG_FLUSH_INTERVAL_MS = '1000';
  });
  afterEach(() => {
    if (originalBatchSize === undefined) delete process.env.APP_LOG_BATCH_SIZE;
    else process.env.APP_LOG_BATCH_SIZE = originalBatchSize;
    if (originalFlushInterval === undefined) {
      delete process.env.APP_LOG_FLUSH_INTERVAL_MS;
    } else {
      process.env.APP_LOG_FLUSH_INTERVAL_MS = originalFlushInterval;
    }
  });
  afterAll(() => jest.useRealTimers());

  function setup() {
    const prisma = {
      applicationLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    return {
      writer: new ApplicationLogWriterService(prisma as never),
      prisma,
    };
  }

  it('has no periodic timer or database activity while idle', async () => {
    const { writer, prisma } = setup();

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.applicationLog.createMany).not.toHaveBeenCalled();

    await writer.onModuleDestroy();
  });

  it('arms one one-shot flush only after a log is enqueued', async () => {
    const { writer, prisma } = setup();
    writer.enqueue({
      level: 'warn',
      kind: 'application',
      environment: 'test',
      service: 'api',
      event: 'warning',
      message: 'warning',
    });

    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(prisma.applicationLog.createMany).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(prisma.applicationLog.createMany).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    await writer.onModuleDestroy();
  });
});
