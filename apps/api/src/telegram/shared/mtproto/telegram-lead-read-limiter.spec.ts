import { TelegramLeadReadLimiter } from './telegram-lead-read-limiter';
const deferred = () => {
  let release!: (value: number) => void;
  const promise = new Promise<number>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
describe('bounded shared-channel RPC capacity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('retains timed-out capacity until actual SDK settlement and never queues another request', async () => {
    const limiter = new TelegramLeadReadLimiter(),
      first = deferred(),
      second = deferred();
    const calls = [
      limiter.run(() => first.promise),
      limiter.run(() => second.promise),
    ];
    const rejected = calls.map((call) =>
      expect(call).rejects.toThrow('LEAD_TELEGRAM_TIMEOUT'),
    );
    await expect(limiter.run(() => Promise.resolve(3))).rejects.toThrow(
      'LEAD_TELEGRAM_CAPACITY',
    );
    await jest.advanceTimersByTimeAsync(15_000);
    await Promise.all(rejected);
    await expect(limiter.run(() => Promise.resolve(4))).rejects.toThrow(
      'LEAD_TELEGRAM_CAPACITY',
    );
    first.release(1);
    second.release(2);
    await Promise.resolve();
    await Promise.resolve();
    await expect(limiter.run(() => Promise.resolve(5))).resolves.toBe(5);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('caps process-wide channel work at8 across independent existing account handles', async () => {
    const pending = Array.from({ length: 8 }, deferred),
      limiters = Array.from({ length: 4 }, () => new TelegramLeadReadLimiter());
    const calls = pending.map((value, index) =>
      limiters[Math.floor(index / 2)].run(() => value.promise),
    );
    await expect(
      new TelegramLeadReadLimiter().run(() => Promise.resolve(9)),
    ).rejects.toThrow('LEAD_TELEGRAM_CAPACITY');
    pending.forEach((value, index) => value.release(index));
    await Promise.all(calls);
    expect(jest.getTimerCount()).toBe(0);
  });
});
