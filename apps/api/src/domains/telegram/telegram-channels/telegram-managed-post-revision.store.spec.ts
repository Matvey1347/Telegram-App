import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';

describe('TelegramManagedPostRevisionStore', () => {
  it('checks revision storage through the active transaction client', async () => {
    const rootQueryRaw = jest.fn();
    const transactionQueryRaw = jest
      .fn()
      .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]);
    const store = new TelegramManagedPostRevisionStore({
      $queryRaw: rootQueryRaw,
    } as never);

    await expect(
      store.hasManagedPostRevisionStorage({
        $queryRaw: transactionQueryRaw,
      } as never),
    ).resolves.toBe(true);

    expect(transactionQueryRaw).toHaveBeenCalledTimes(1);
    expect(rootQueryRaw).not.toHaveBeenCalled();
  });
});
