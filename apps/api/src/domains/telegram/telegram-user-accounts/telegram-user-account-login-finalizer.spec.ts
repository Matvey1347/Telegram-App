import { ConflictException } from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountLoginFinalizer } from './telegram-user-account-login-finalizer';

describe('TelegramUserAccountLoginFinalizer', () => {
  const account = {
    id: 'account-1',
    workspaceId: 'workspace-1',
    label: '@revoked',
    updatedAt: new Date('2026-08-23T10:00:00.000Z'),
  };
  const profile = {
    id: '42',
    username: 'restored',
    firstName: 'Restored',
    lastName: null,
    photoUrl: null,
    nameColor: null,
    capabilities: {
      isPremium: true,
      captionLengthMax: 2048,
      messageLengthMax: 8192,
      maxUploadFileSizeMb: 4000,
      supportsCustomEmoji: true,
      checkedAt: '2026-08-23T10:01:00.000Z',
      limitsSource: 'telegram_config' as const,
    },
  };

  it('encrypts the new session, clears revoked/login state, and connects the account', async () => {
    const connected = {
      ...account,
      status: TelegramUserAccountStatus.connected,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = jest.fn().mockResolvedValue(connected);
    const finalizer = new TelegramUserAccountLoginFinalizer(
      {
        telegramUserAccountIntegration: { updateMany, findFirstOrThrow },
      } as never,
      {
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'encrypted-session',
          iv: 'session-iv',
          authTag: 'session-tag',
        }),
      } as never,
    );

    await expect(
      finalizer.finalize(account, { session: 'plain-session', profile }),
    ).resolves.toBe(connected);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: account.id,
        workspaceId: account.workspaceId,
        updatedAt: account.updatedAt,
      },
      data: expect.objectContaining({
        sessionEncrypted: 'encrypted-session',
        sessionIv: 'session-iv',
        sessionAuthTag: 'session-tag',
        telegramUserId: '42',
        status: TelegramUserAccountStatus.connected,
        lastErrorMessage: null,
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: null,
        loginTempSessionIv: null,
        loginTempSessionAuthTag: null,
        loginStartedAt: null,
        isPremium: true,
      }),
    });
    expect(JSON.stringify(updateMany.mock.calls)).not.toContain(
      'plain-session',
    );
  });

  it('rejects a stale completion before reading back an account', async () => {
    const findFirstOrThrow = jest.fn();
    const finalizer = new TelegramUserAccountLoginFinalizer(
      {
        telegramUserAccountIntegration: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findFirstOrThrow,
        },
      } as never,
      {
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'encrypted-session',
          iv: 'session-iv',
          authTag: 'session-tag',
        }),
      } as never,
    );

    await expect(
      finalizer.finalize(account, { session: 'plain-session', profile }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });
});
