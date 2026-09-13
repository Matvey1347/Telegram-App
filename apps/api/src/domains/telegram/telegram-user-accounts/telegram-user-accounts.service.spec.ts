import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';
import { REVOKED_TELEGRAM_SESSION_MESSAGE } from '../../../telegram/shared/telegram-session-errors';

describe('TelegramUserAccountsService account checks', () => {
  it('confirms QR 2FA from a valid temporary session without a phone-code hash', async () => {
    const account = {
      id: 'account-qr-2fa',
      workspaceId: 'workspace-1',
      label: '@owner',
      status: TelegramUserAccountStatus.needs_password,
      updatedAt: new Date(),
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      loginPhoneCodeHash: null,
      loginTempSessionEncrypted: 'temp',
      loginTempSessionIv: 'temp-iv',
      loginTempSessionAuthTag: 'temp-tag',
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
      },
    };
    const profile = {
      id: '42',
      username: 'owner',
      firstName: 'Owner',
      lastName: null,
      photoUrl: null,
      nameColor: null,
      capabilities: {
        isPremium: false,
        captionLengthMax: 1024,
        messageLengthMax: 4096,
        maxUploadFileSizeMb: 2000,
        supportsCustomEmoji: false,
        checkedAt: new Date().toISOString(),
        limitsSource: 'telegram_config',
      },
    };
    const signInWithPassword = jest.fn().mockResolvedValue({
      session: 'authorized-session',
      me: profile,
    });
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      { signInWithPassword } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );
    const connected = {
      ...account,
      status: TelegramUserAccountStatus.connected,
    };
    (
      service as unknown as { loginFinalizer: { finalize: jest.Mock } }
    ).loginFinalizer = {
      finalize: jest.fn().mockResolvedValue(connected),
    };
    jest
      .spyOn(service as never, 'syncDialogsAfterConnect' as never)
      .mockResolvedValue({ success: true } as never);

    await expect(
      service.confirmPassword('user-1', account.id, { password: 'secret' }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: TelegramUserAccountStatus.connected,
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      apiId: '123',
      apiHash: 'decrypted',
      password: 'secret',
      tempSession: 'decrypted',
    });
  });

  it('returns the code delivery channel selected by Telegram', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      phoneEncrypted: 'phone',
      phoneIv: 'phone-iv',
      phoneAuthTag: 'phone-tag',
      updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const startLogin = jest.fn().mockResolvedValue({
      phoneCodeHash: 'code-hash',
      isCodeViaApp: true,
      tempSession: 'session',
    });
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {
        decrypt: jest.fn().mockReturnValue('decrypted'),
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'temp-session',
          iv: 'temp-iv',
          authTag: 'temp-tag',
        }),
      } as never,
      {
        startLogin,
      } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    await expect(
      service.startLogin('user-1', account.id, { delivery: 'SMS' }),
    ).resolves.toEqual({
      success: true,
      status: TelegramUserAccountStatus.needs_code,
      isCodeViaApp: true,
    });
    expect(startLogin).toHaveBeenCalledWith(
      account.apiId,
      'decrypted',
      'decrypted',
      true,
    );
  });

  it('keeps a usable app-code state when Telegram refuses SMS delivery', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      phoneEncrypted: 'phone',
      phoneIv: 'phone-iv',
      phoneAuthTag: 'phone-tag',
      updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const rpcError = Object.assign(
      new Error('406: SEND_CODE_UNAVAILABLE (caused by auth.ResendCode)'),
      { errorMessage: 'SEND_CODE_UNAVAILABLE' },
    );
    const startLogin = jest
      .fn()
      .mockRejectedValueOnce(rpcError)
      .mockResolvedValueOnce({
        phoneCodeHash: 'fallback-code-hash',
        isCodeViaApp: true,
        tempSession: 'fallback-session',
      });
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {
        decrypt: jest.fn().mockReturnValue('decrypted'),
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'temp-session',
          iv: 'temp-iv',
          authTag: 'temp-tag',
        }),
      } as never,
      { startLogin } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    await expect(
      service.startLogin('user-1', account.id, { delivery: 'SMS' }),
    ).resolves.toEqual({
      success: true,
      status: TelegramUserAccountStatus.needs_code,
      isCodeViaApp: true,
      smsUnavailable: true,
    });
    expect(startLogin).toHaveBeenNthCalledWith(
      2,
      account.apiId,
      'decrypted',
      'decrypted',
    );
    expect(
      prisma.telegramUserAccountIntegration.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: account.workspaceId,
          updatedAt: account.updatedAt,
        }),
        data: expect.objectContaining({
          loginPhoneCodeHash: 'fallback-code-hash',
        }),
      }),
    );
  });

  it('does not let a delayed phone login overwrite newer account state', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      phoneEncrypted: 'phone',
      phoneIv: 'phone-iv',
      phoneAuthTag: 'phone-tag',
      updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new TelegramUserAccountsService(
      {
        telegramUserAccountIntegration: {
          findFirst: jest.fn().mockResolvedValue(account),
          updateMany,
        },
      } as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {
        decrypt: jest.fn().mockReturnValue('decrypted'),
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'temp-session',
          iv: 'temp-iv',
          authTag: 'temp-tag',
        }),
      } as never,
      {
        startLogin: jest.fn().mockResolvedValue({
          phoneCodeHash: 'code-hash',
          isCodeViaApp: true,
          tempSession: 'session',
        }),
      } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    await expect(
      service.startLogin('user-1', account.id, { delivery: 'APP' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: account.id,
          workspaceId: account.workspaceId,
          updatedAt: account.updatedAt,
        },
      }),
    );
  });

  it('returns a retryable client error when Telegram rate-limits login codes', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      phoneEncrypted: 'phone',
      phoneIv: 'phone-iv',
      phoneAuthTag: 'phone-tag',
    };
    const update = jest.fn();
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        update,
      },
    };
    const startLogin = jest
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error(
            'A wait of 117 seconds is required (caused by auth.SendCode)',
          ),
          { seconds: 117 },
        ),
      );
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      { startLogin } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    try {
      await service.startLogin('user-1', account.id, { delivery: 'APP' });
      throw new Error('Expected a rate-limit exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(exception.getResponse()).toEqual({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: 'Telegram rate limit reached. Try again in 117 seconds.',
        code: 'TELEGRAM_FLOOD_WAIT',
        details: { retryAfterSeconds: 117 },
      });
    }

    expect(update).not.toHaveBeenCalled();
  });

  it('marks a revoked Telegram session as error instead of leaving it connected', async () => {
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      label: '@owner',
      status: TelegramUserAccountStatus.connected,
      isPremium: false,
      premiumCheckedAt: null,
      captionLengthMax: 1024,
      messageLengthMax: 4096,
      sessionEncrypted: 'session',
      sessionIv: 'session-iv',
      sessionAuthTag: 'session-tag',
      apiId: '123',
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
    };
    const revoked = {
      ...account,
      status: TelegramUserAccountStatus.error,
      lastErrorMessage: REVOKED_TELEGRAM_SESSION_MESSAGE,
    };
    const update = jest.fn((input: unknown) => {
      void input;
      return Promise.resolve(revoked);
    });
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        findFirstOrThrow: jest.fn(),
        update,
      },
    };
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      {
        getAccountProfile: jest
          .fn()
          .mockRejectedValue(new Error('401: SESSION_REVOKED')),
      } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    await service.check('user-1', account.id);

    expect(update).toHaveBeenCalledTimes(1);
    const updateInput = update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: {
        status: TelegramUserAccountStatus;
        lastErrorMessage: string;
        lastCheckedAt: Date;
      };
    };
    expect(updateInput.where).toEqual({ id: account.id });
    expect(updateInput.data.status).toBe(TelegramUserAccountStatus.error);
    expect(updateInput.data.lastErrorMessage).toBe(
      REVOKED_TELEGRAM_SESSION_MESSAGE,
    );
    expect(updateInput.data.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('forwards real channel sync stages through the import progress stream', async () => {
    const progress: Array<{
      phase: string;
      message: string;
      current: number;
      total: number;
      stageCurrent?: number;
      stageTotal?: number;
    }> = [];
    const syncNow = jest.fn(
      async (
        _userId: string,
        _channelId: string,
        _dto: unknown,
        onProgress: (
          item: {
            phase: string;
            message: string;
            stageCurrent?: number;
            stageTotal?: number;
          },
          current: number,
          total: number,
        ) => Promise<void>,
      ) => {
        await onProgress(
          { phase: 'sync_step', message: 'Importing historical posts' },
          1,
          4,
        );
        await onProgress(
          {
            phase: 'loading_invite_links',
            message: 'Loading invite links 2/5',
            stageCurrent: 2,
            stageTotal: 5,
          },
          2,
          4,
        );
      },
    );
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'account-1',
          workspaceId: 'workspace-1',
          label: '@owner',
          apiId: '123',
          apiHashEncrypted: 'hash',
          apiHashIv: 'hash-iv',
          apiHashAuthTag: 'hash-tag',
          sessionEncrypted: 'session',
          sessionIv: 'session-iv',
          sessionAuthTag: 'session-tag',
          isActive: true,
        }),
      },
      telegramChannel: {
        create: jest.fn().mockResolvedValue({
          id: 'workspace-channel-1',
          title: 'Imported channel',
          username: 'imported_channel',
        }),
      },
      telegramChannelAdminLink: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const sourceAccess = {
      normalizeMtprotoPermissions: jest.fn().mockReturnValue({
        role: 'OWNER',
        permissions: {},
      }),
      canBeUsedForAnalytics: jest.fn().mockReturnValue(true),
      upsertAccess: jest.fn().mockResolvedValue({}),
      recordDataSource: jest.fn().mockResolvedValue({}),
    };
    const service = new TelegramUserAccountsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      {
        getAdminChannels: jest.fn().mockResolvedValue([
          {
            id: '-1001',
            title: 'Imported channel',
            username: 'imported_channel',
            isCreator: true,
            adminRights: null,
          },
        ]),
      } as never,
      sourceAccess as never,
      { get: jest.fn() } as never,
      {
        ensureStorageAvailable: jest.fn().mockResolvedValue(undefined),
        resolveChannelImportPolicy: jest.fn().mockResolvedValue({
          acquisitionType: 'CREATED',
          postsSyncFrom: null,
          inviteLinksSyncFrom: null,
          purchaseTransactionId: null,
        }),
      } as never,
      { syncNow } as never,
      {} as never,
      {} as never,
      { writeStructured: jest.fn() } as never,
    );

    await service.importChannels(
      'user-1',
      'account-1',
      { channels: [{ telegramChannelId: '-1001' }] },
      (item, current, total) => {
        progress.push({ ...item, current, total });
      },
    );

    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'sync_step',
          message: 'Imported channel: Importing historical posts',
          current: 33,
          total: 100,
        }),
        expect.objectContaining({
          phase: 'loading_invite_links',
          message: 'Imported channel: Loading invite links 2/5',
          stageCurrent: 2,
          stageTotal: 5,
          current: 55,
          total: 100,
        }),
      ]),
    );
  });
});
