import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

describe('CRM runtime deployment ownership', () => {
  it('keeps an explicitly disabled host disconnected and refuses manual handles', async () => {
    const previous = process.env.CRM_RUNTIME_ENABLED;
    process.env.CRM_RUNTIME_ENABLED = 'false';
    try {
      const sessions = { startupAccounts: jest.fn(), find: jest.fn() };
      const lease = { acquire: jest.fn(), release: jest.fn() };
      const adapter = { open: jest.fn() };
      const manager = new TelegramCrmRuntimeManager(
        {} as never,
        sessions as never,
        adapter as never,
        {} as never,
        new TelegramAccountRuntimeNotifier(),
        {} as never,
        undefined,
        undefined,
        lease as never,
      );
      await manager.onApplicationBootstrap();
      await manager.wakeAccount('account', 'workspace');
      expect(sessions.startupAccounts).not.toHaveBeenCalled();
      expect(sessions.find).not.toHaveBeenCalled();
      expect(lease.acquire).not.toHaveBeenCalled();
      await expect(
        manager.withAccountHandle('workspace', 'account', 'sync', () =>
          Promise.resolve(),
        ),
      ).rejects.toThrow('another application instance');
      expect(adapter.open).not.toHaveBeenCalled();
      await manager.onApplicationShutdown();
    } finally {
      if (previous === undefined) delete process.env.CRM_RUNTIME_ENABLED;
      else process.env.CRM_RUNTIME_ENABLED = previous;
    }
  });
});
