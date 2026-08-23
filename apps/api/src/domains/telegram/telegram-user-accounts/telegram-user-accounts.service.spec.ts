import { HttpException, HttpStatus } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';
import { REVOKED_TELEGRAM_SESSION_MESSAGE } from '../../../telegram/shared/telegram-session-errors';

describe('TelegramUserAccountsService account checks', () => {
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
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue(account),
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
    };
    const prisma = {
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
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
    expect(prisma.telegramUserAccountIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loginPhoneCodeHash: 'fallback-code-hash',
        }),
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
});
