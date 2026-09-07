import { ResponseCacheService } from './response-cache.service';

describe('ResponseCacheService', () => {
  it('loads identical requests once and serves the cached response', async () => {
    const cache = new ResponseCacheService();
    const load = jest.fn().mockResolvedValue({ items: ['contact-1'] });

    const first = await cache.getOrSet('crm:list:page-1', 30_000, load);
    const second = await cache.getOrSet('crm:list:page-1', 30_000, load);

    expect(first).toEqual({ items: ['contact-1'] });
    expect(second).toBe(first);
    expect(load.mock.calls).toHaveLength(1);
  });

  it('does not cache a failed request', async () => {
    const cache = new ResponseCacheService();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ items: [] });

    await expect(
      cache.getOrSet('crm:list:page-1', 30_000, load),
    ).rejects.toThrow('database unavailable');
    await expect(
      cache.getOrSet('crm:list:page-1', 30_000, load),
    ).resolves.toEqual({ items: [] });
    expect(load.mock.calls).toHaveLength(2);
  });

  it('does not let an invalidated in-flight response repopulate stale data', async () => {
    const cache = new ResponseCacheService();
    let resolveFirst!: (value: { version: number }) => void;
    const firstLoad = jest.fn(
      () =>
        new Promise<{ version: number }>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const key = 'api:user-1:workspace-1:GET:/telegram-crm/contacts?page=1';
    const pending = cache.getOrSet(key, 30_000, firstLoad);

    cache.clearWorkspacePath('workspace-1', '/telegram-crm/contacts');
    resolveFirst({ version: 1 });
    await expect(pending).resolves.toEqual({ version: 1 });

    const freshLoad = jest.fn().mockResolvedValue({ version: 2 });
    await expect(cache.getOrSet(key, 30_000, freshLoad)).resolves.toEqual({
      version: 2,
    });
    expect(freshLoad).toHaveBeenCalledTimes(1);
  });
});
