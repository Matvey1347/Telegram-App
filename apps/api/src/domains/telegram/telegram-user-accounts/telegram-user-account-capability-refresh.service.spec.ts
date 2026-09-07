import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramUserAccountCapabilityRefreshService } from './telegram-user-account-capability-refresh.service';

const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const account = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  label: '@owner',
  isActive: true,
  status: TelegramUserAccountStatus.connected,
  isPremium: false,
  premiumCheckedAt: null,
  captionLengthMax: 1_024,
  messageLengthMax: 4_096,
  sessionEncrypted: 'session',
  sessionIv: 'session-iv',
  sessionAuthTag: 'session-tag',
  apiId: '1',
  apiHashEncrypted: 'hash',
  apiHashIv: 'hash-iv',
  apiHashAuthTag: 'hash-tag',
};

describe('TelegramUserAccountCapabilityRefreshService', () => {
  it('stores the current Telegram username, name, and avatar on a forced refresh', async () => {
    const profile = {
      id: 'telegram-user-42',
      username: 'current_username',
      firstName: 'Current',
      lastName: 'Name',
      photoUrl: 'data:image/jpeg;base64,current-avatar',
      nameColor: 5,
      capabilities: {
        isPremium: false,
        captionLengthMax: 1_024,
        messageLengthMax: 4_096,
        maxUploadFileSizeMb: 2_000,
        supportsCustomEmoji: false,
        checkedAt: '2026-09-07T20:00:00.000Z',
        limitsSource: 'telegram_config',
      },
    };
    const update = jest.fn().mockResolvedValue({
      ...account,
      telegramUserId: profile.id,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
    });
    const service = new TelegramUserAccountCapabilityRefreshService(
      {
        telegramUserAccountIntegration: { update },
      } as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      { getAccountProfile: jest.fn().mockResolvedValue(profile) } as never,
      { writeStructured: jest.fn() } as never,
      { wake: jest.fn() } as never,
    );

    await service.refreshOne(account, { force: true });

    const updateInput = callArgument(update) as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateInput.where).toEqual({ id: account.id });
    expect(updateInput.data).toMatchObject({
      telegramUserId: profile.id,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
      label: '@current_username',
    });
  });

  it('marks a revoked account ineligible and wakes the event-driven runtime', async () => {
    const prisma = {
      telegramUserAccountIntegration: {
        update: jest.fn().mockResolvedValue({
          ...account,
          status: TelegramUserAccountStatus.error,
        }),
      },
    };
    const runtimeNotifier = { wake: jest.fn() };
    const service = new TelegramUserAccountCapabilityRefreshService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
      {
        getAccountProfile: jest
          .fn()
          .mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED')),
      } as never,
      { writeStructured: jest.fn() } as never,
      runtimeNotifier as never,
    );

    await expect(service.refreshOne(account, { force: true })).resolves.toEqual(
      expect.objectContaining({ status: TelegramUserAccountStatus.error }),
    );
    const updateCall = callArgument(
      prisma.telegramUserAccountIntegration.update,
    );
    expect(updateCall).toMatchObject({
      where: { id: 'account-1' },
      data: { status: TelegramUserAccountStatus.error },
    });
    expect(runtimeNotifier.wake).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      reason: 'revoked',
    });
  });
});
