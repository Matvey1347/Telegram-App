import { TelegramCrmRuntimeLeaseService } from './telegram-crm-runtime-lease.service';

describe('TelegramCrmRuntimeLeaseService', () => {
  afterEach(() => jest.useRealTimers());

  it('renews a held lease and releases it during a clean shutdown', async () => {
    jest.useFakeTimers();
    const locks = {
      acquire: jest.fn().mockResolvedValue(true),
      renew: jest.fn().mockResolvedValue({ count: 1 }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TelegramCrmRuntimeLeaseService(locks as never);

    await expect(service.acquire()).resolves.toBe(true);
    await expect(service.acquire()).resolves.toBe(true);
    expect(locks.acquire).toHaveBeenCalledTimes(1);
    const onLost = jest.fn();
    service.startRenewing(onLost);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(locks.renew).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
    await service.release();
    expect(locks.release).toHaveBeenCalledTimes(1);
  });

  it('stops renewing and signals the manager when ownership is lost', async () => {
    jest.useFakeTimers();
    const locks = {
      acquire: jest.fn().mockResolvedValue(true),
      renew: jest.fn().mockResolvedValue({ count: 0 }),
      release: jest.fn(),
    };
    const service = new TelegramCrmRuntimeLeaseService(locks as never);
    await service.acquire();
    const onLost = jest.fn();
    service.startRenewing(onLost);

    await jest.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(onLost).toHaveBeenCalledTimes(1);
    await service.release();
    expect(locks.release).not.toHaveBeenCalled();
  });
});
