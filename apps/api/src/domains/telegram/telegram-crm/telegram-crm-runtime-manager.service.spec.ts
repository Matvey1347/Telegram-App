import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import type {
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import type { CrmRuntimeAccount } from './telegram-crm-account-session.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const account = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  apiId: '1',
  apiHashEncrypted: 'hash',
  apiHashIv: 'iv',
  apiHashAuthTag: 'tag',
  sessionEncrypted: 'session',
  sessionIv: 'session-iv',
  sessionAuthTag: 'session-tag',
  status: 'connected',
  isActive: true,
  crmSyncEnabled: true,
  crmSendEnabled: true,
  telegramUserId: '42',
  lastErrorMessage: null,
} as const satisfies CrmRuntimeAccount;

describe('TelegramCrmRuntimeManager', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses one bounded startup query, deduplicates wakes, and closes on OFF', async () => {
    const disabled = { ...account, crmSyncEnabled: false };
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([account]),
      find: jest
        .fn()
        .mockResolvedValueOnce(account)
        .mockResolvedValue(disabled),
      isLiveEligible: jest.fn((row: CrmRuntimeAccount) => row.crmSyncEnabled),
      credentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
    };
    const handle = {
      onUpdate: jest.fn().mockReturnValue(jest.fn()),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = { open: jest.fn().mockResolvedValue(handle) };
    const recovery = {
      recover: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        checkpoint: { pts: 1, qts: 0, date: 2, seq: 3 },
      }),
    };
    const notifier = new TelegramAccountRuntimeNotifier();
    const intervalSpy = jest.spyOn(global, 'setInterval');
    const manager = new TelegramCrmRuntimeManager(
      { telegramUserAccountIntegration: { updateMany: jest.fn() } } as never,
      sessions as never,
      adapter,
      {} as never,
      notifier,
      recovery as never,
    );

    await manager.onApplicationBootstrap();
    expect(sessions.startupAccounts).toHaveBeenCalledTimes(1);
    expect(sessions.startupAccounts).toHaveBeenCalledWith(101);
    expect(adapter.open).toHaveBeenCalledTimes(1);
    expect(intervalSpy).not.toHaveBeenCalled();

    await manager.wakeAccount(account.id, account.workspaceId);
    expect(adapter.open).toHaveBeenCalledTimes(1);

    await manager.wakeAccount(account.id, account.workspaceId);
    expect(handle.close).toHaveBeenCalledTimes(1);
    await manager.onApplicationShutdown();
    intervalSpy.mockRestore();
  });

  it('replaces the live transport when encrypted API credentials rotate', async () => {
    const rotated = { ...account, apiHashEncrypted: 'hash-rotated' };
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([account]),
      find: jest.fn().mockResolvedValue(rotated),
      isLiveEligible: jest.fn().mockReturnValue(true),
      credentials: jest.fn((row: CrmRuntimeAccount) => ({
        apiId: row.apiId,
        apiHash: row.apiHashEncrypted,
        session: row.sessionEncrypted ?? '',
      })),
    };
    const oldHandle = {
      onUpdate: jest.fn().mockReturnValue(jest.fn()),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const rotatedHandle = {
      onUpdate: jest.fn().mockReturnValue(jest.fn()),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      open: jest
        .fn()
        .mockResolvedValueOnce(oldHandle)
        .mockResolvedValueOnce(rotatedHandle),
    };
    const recovery = {
      recover: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        checkpoint: { pts: 1, qts: 0, date: 2, seq: 3 },
      }),
    };
    const manager = new TelegramCrmRuntimeManager(
      { telegramUserAccountIntegration: { updateMany: jest.fn() } } as never,
      sessions as never,
      adapter,
      {} as never,
      new TelegramAccountRuntimeNotifier(),
      recovery as never,
    );

    await manager.onApplicationBootstrap();
    await manager.wakeAccount(account.id, account.workspaceId);

    expect(oldHandle.close).toHaveBeenCalledTimes(1);
    expect(adapter.open).toHaveBeenCalledTimes(2);
    expect(adapter.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiHash: 'hash-rotated' }),
      expect.any(AbortSignal),
    );
    await manager.onApplicationShutdown();
    expect(rotatedHandle.close).toHaveBeenCalledTimes(1);
  });

  it('fails visibly rather than silently ignoring startup overflow', async () => {
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue(Array(101).fill(account)),
    };
    const manager = new TelegramCrmRuntimeManager(
      {} as never,
      sessions as never,
      {} as never,
      {} as never,
      new TelegramAccountRuntimeNotifier(),
      {} as never,
    );

    await expect(manager.onApplicationBootstrap()).rejects.toThrow(
      'CRM runtime account safety limit exceeded (100)',
    );
    await manager.onApplicationShutdown();
  });

  it('does no recurring database or Telegram work while there are no eligible accounts', async () => {
    jest.useFakeTimers();
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([]),
      find: jest.fn(),
    };
    const adapter = { open: jest.fn() };
    const prisma = {
      telegramUserAccountIntegration: { updateMany: jest.fn() },
    };
    const manager = new TelegramCrmRuntimeManager(
      prisma as never,
      sessions as never,
      adapter,
      {} as never,
      new TelegramAccountRuntimeNotifier(),
      {} as never,
    );

    await manager.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    expect(sessions.startupAccounts).toHaveBeenCalledTimes(1);
    expect(sessions.find).not.toHaveBeenCalled();
    expect(adapter.open).not.toHaveBeenCalled();
    expect(
      prisma.telegramUserAccountIntegration.updateMany,
    ).not.toHaveBeenCalled();

    await manager.onApplicationShutdown();
  });

  it('serializes a gap through the bounded queue and requests recovery after the batch', async () => {
    jest.useFakeTimers();
    let onUpdate: ((update: TelegramCrmMtprotoUpdate) => void) | undefined;
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([account]),
      credentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
    };
    const handle = {
      onUpdate: jest.fn<
        ReturnType<TelegramCrmMtprotoHandle['onUpdate']>,
        Parameters<TelegramCrmMtprotoHandle['onUpdate']>
      >((handler) => {
        onUpdate = handler;
        return jest.fn();
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const recovery = {
      recover: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        checkpoint: { pts: 1, qts: 0, date: 2, seq: 3 },
      }),
    };
    const batchStore = {
      applyUpdates: jest.fn().mockResolvedValue({ needsRecovery: true }),
    };
    const manager = new TelegramCrmRuntimeManager(
      { telegramUserAccountIntegration: { updateMany: jest.fn() } } as never,
      sessions as never,
      { open: jest.fn().mockResolvedValue(handle) },
      batchStore as never,
      new TelegramAccountRuntimeNotifier(),
      recovery as never,
    );

    await manager.onApplicationBootstrap();
    onUpdate?.({ type: 'sync.gap', reason: 'UPDATES_TOO_LONG' });
    await jest.advanceTimersByTimeAsync(50);

    expect(batchStore.applyUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        updates: [{ type: 'sync.gap', reason: 'UPDATES_TOO_LONG' }],
      }),
    );
    expect(recovery.recover).toHaveBeenCalledTimes(2);
    await manager.onApplicationShutdown();
  });

  it('marks a revoked session as error, closes it, and records a failure marker', async () => {
    let onError: ((error: Error) => void) | undefined;
    const revoked = { ...account, status: 'error' };
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([account]),
      find: jest.fn().mockResolvedValue(revoked),
      isLiveEligible: jest.fn().mockReturnValue(false),
      credentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
    };
    const handle = {
      onUpdate: jest.fn<
        ReturnType<TelegramCrmMtprotoHandle['onUpdate']>,
        Parameters<TelegramCrmMtprotoHandle['onUpdate']>
      >((_handler, errorHandler) => {
        onError = errorHandler;
        return jest.fn();
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      telegramUserAccountIntegration: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const recovery = {
      recover: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        checkpoint: { pts: 1, qts: 0, date: 2, seq: 3 },
      }),
      writeFailure: jest.fn().mockResolvedValue(undefined),
    };
    const manager = new TelegramCrmRuntimeManager(
      prisma as never,
      sessions as never,
      { open: jest.fn().mockResolvedValue(handle) },
      {} as never,
      new TelegramAccountRuntimeNotifier(),
      recovery as never,
    );

    await manager.onApplicationBootstrap();
    onError?.(new Error('AUTH_KEY_UNREGISTERED'));
    await new Promise((resolve) => setImmediate(resolve));

    const revokedUpdate = callArgument(
      prisma.telegramUserAccountIntegration.updateMany,
    );
    expect(revokedUpdate).toMatchObject({
      where: {
        id: 'account-1',
        workspaceId: 'workspace-1',
        status: 'connected',
      },
      data: {
        status: 'error',
        lastErrorMessage: 'Telegram session was revoked',
      },
    });
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(recovery.writeFailure).toHaveBeenCalledWith(
      account,
      'SESSION_REVOKED',
      expect.any(Error),
    );
    await manager.onApplicationShutdown();
  });

  it('retries a transient connect failure with capped jitter instead of polling', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const sessions = {
      startupAccounts: jest.fn().mockResolvedValue([account]),
      credentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
    };
    const handle = {
      onUpdate: jest.fn().mockReturnValue(jest.fn()),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      open: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary network error'))
        .mockResolvedValue(handle),
    };
    const recovery = {
      recover: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        checkpoint: { pts: 1, qts: 0, date: 2, seq: 3 },
      }),
    };
    const manager = new TelegramCrmRuntimeManager(
      { telegramUserAccountIntegration: { updateMany: jest.fn() } } as never,
      sessions as never,
      adapter,
      {} as never,
      new TelegramAccountRuntimeNotifier(),
      recovery as never,
    );

    await manager.onApplicationBootstrap();
    expect(adapter.open).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(adapter.open).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(adapter.open).toHaveBeenCalledTimes(2);
    expect(recovery.recover).toHaveBeenCalledTimes(1);
    await manager.onApplicationShutdown();
  });
});
