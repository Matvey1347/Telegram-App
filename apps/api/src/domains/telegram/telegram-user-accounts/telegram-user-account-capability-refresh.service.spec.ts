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
