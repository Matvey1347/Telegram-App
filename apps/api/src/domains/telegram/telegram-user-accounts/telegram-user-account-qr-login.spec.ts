import { ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountQrLoginService } from './telegram-user-account-qr-login.service';

const account = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  label: '@old',
  apiId: '123',
  apiHashEncrypted: 'hash',
  apiHashIv: 'hash-iv',
  apiHashAuthTag: 'hash-tag',
  status: TelegramUserAccountStatus.error,
  updatedAt: new Date('2026-08-23T10:00:00.000Z'),
};

function serviceHarness(options?: { found?: boolean; qrResult?: unknown }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    telegramUserAccountIntegration: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options?.found === false ? null : account),
      updateMany,
    },
  };
  const loginWithQr = jest.fn().mockResolvedValue(
    options?.qrResult ?? {
      status: 'needs_password',
      tempSession: 'temporary',
    },
  );
  const finalize = jest.fn();
  const service = new TelegramUserAccountQrLoginService(
    prisma as never,
    {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    } as never,
    {
      decrypt: jest.fn().mockReturnValue('api-hash'),
      encrypt: jest.fn().mockReturnValue({
        encrypted: 'encrypted-temp',
        iv: 'temp-iv',
        authTag: 'temp-tag',
      }),
    } as never,
    { loginWithQr } as never,
    { finalize } as never,
  );
  return { service, prisma, loginWithQr, updateMany, finalize };
}

describe('TelegramUserAccountsService QR login', () => {
  it('does not write before Telegram reaches a terminal QR state', async () => {
    let resolveQr!: (value: unknown) => void;
    const qrResult = new Promise((resolve) => {
      resolveQr = resolve;
    });
    const test = serviceHarness({ qrResult });
    const action = test.service.login(
      'user-1',
      account.id,
      jest.fn(),
      new AbortController().signal,
      jest.fn(),
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(test.updateMany).not.toHaveBeenCalled();
    resolveQr({ status: 'needs_password', tempSession: 'temporary' });
    await expect(action).resolves.toEqual({
      success: true,
      status: 'needs_password',
    });
  });

  it('does not persist a terminal result when cancellation wins the race', async () => {
    const abort = new AbortController();
    const test = serviceHarness({
      qrResult: {
        status: 'needs_password',
        tempSession: 'temporary',
      },
    });
    test.loginWithQr.mockImplementation(async () => {
      abort.abort();
      return { status: 'needs_password', tempSession: 'temporary' };
    });

    await expect(
      test.service.login(
        'user-1',
        account.id,
        jest.fn(),
        abort.signal,
        jest.fn(),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(test.updateMany).not.toHaveBeenCalled();
    expect(test.finalize).not.toHaveBeenCalled();
  });

  it('stores QR 2FA state encrypted and guarded by workspace/version', async () => {
    const test = serviceHarness();

    await test.service.login(
      'user-1',
      account.id,
      jest.fn(),
      new AbortController().signal,
      jest.fn(),
    );

    expect(test.updateMany).toHaveBeenCalledWith({
      where: {
        id: account.id,
        workspaceId: account.workspaceId,
        updatedAt: account.updatedAt,
      },
      data: expect.objectContaining({
        status: TelegramUserAccountStatus.needs_password,
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: 'encrypted-temp',
      }),
    });
  });

  it('finalizes a revoked account and syncs dialogs exactly once after QR success', async () => {
    const profile = {
      id: '42',
      username: 'restored',
      firstName: 'Restored',
      lastName: null,
      photoUrl: null,
      nameColor: null,
      capabilities: {
        isPremium: false,
        captionLengthMax: 1024,
        messageLengthMax: 4096,
        maxUploadFileSizeMb: 2000,
        supportsCustomEmoji: false,
        checkedAt: '2026-08-23T10:01:00.000Z',
        limitsSource: 'telegram_config',
      },
    };
    const test = serviceHarness({
      qrResult: { status: 'connected', session: 'new-session', profile },
    });
    test.finalize.mockResolvedValue({
      ...account,
      label: '@restored',
      telegramUserId: '42',
      username: 'restored',
      firstName: 'Restored',
      lastName: null,
      phoneMasked: '+48***00',
      photoUrl: null,
      nameColor: null,
      isPremium: false,
      premiumCheckedAt: new Date('2026-08-23T10:01:00.000Z'),
      captionLengthMax: 1024,
      messageLengthMax: 4096,
      premiumCapabilities: profile.capabilities,
      status: TelegramUserAccountStatus.connected,
      lastErrorMessage: null,
      lastCheckedAt: new Date('2026-08-23T10:01:00.000Z'),
      lastSyncedAt: new Date('2026-08-23T10:01:00.000Z'),
      isActive: true,
    });
    const syncAfterConnect = jest.fn().mockResolvedValue({ success: true });
    const onProgress = jest.fn();

    await expect(
      test.service.login(
        'user-1',
        account.id,
        onProgress,
        new AbortController().signal,
        syncAfterConnect,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'connected',
        account: expect.objectContaining({
          id: account.id,
          status: 'connected',
          lastErrorMessage: null,
        }),
      }),
    );
    expect(test.finalize).toHaveBeenCalledWith(account, {
      session: 'new-session',
      profile,
    });
    expect(onProgress).toHaveBeenCalledWith({
      type: 'connected',
      account: expect.objectContaining({
        id: account.id,
        status: 'connected',
      }),
    });
    expect(onProgress.mock.invocationCallOrder[0]).toBeLessThan(
      syncAfterConnect.mock.invocationCallOrder[0],
    );
    expect(syncAfterConnect).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale QR completion instead of overwriting newer login state', async () => {
    const test = serviceHarness();
    test.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      test.service.login(
        'user-1',
        account.id,
        jest.fn(),
        new AbortController().signal,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces workspace isolation before opening Telegram', async () => {
    const test = serviceHarness({ found: false });

    await expect(
      test.service.login(
        'user-1',
        'other-workspace-account',
        jest.fn(),
        new AbortController().signal,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      test.prisma.telegramUserAccountIntegration.findFirst,
    ).toHaveBeenCalledWith({
      where: { id: 'other-workspace-account', workspaceId: 'workspace-1' },
    });
    expect(test.loginWithQr).not.toHaveBeenCalled();
  });
});
