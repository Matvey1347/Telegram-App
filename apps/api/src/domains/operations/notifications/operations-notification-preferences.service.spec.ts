import { OperationsNotificationPreferencesService } from './operations-notification-preferences.service';
import { CRM_NOTIFICATION_PREFERENCE_DEFAULTS } from '@telegram-system/shared';

function setup(current: Record<string, boolean> | null = null) {
  const prisma = {
    operationsNotificationPreference: {
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    operationsPushSubscription: { count: jest.fn().mockResolvedValue(2) },
  };
  const auth = {
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-a', memberId: 'member-a' }),
  };
  const service = new OperationsNotificationPreferencesService(
    prisma as never,
    auth as never,
    { get: () => ({ enabled: true }) } as never,
  );
  return { prisma, auth, service };
}

describe('CRM personal notification preferences', () => {
  it('does not enable new incoming alerts or previews for an older global push opt-in', async () => {
    const { service } = setup({ webPushEnabled: true });
    await expect(service.preferences('user-a')).resolves.toEqual({
      webPushEnabled: true,
      ...CRM_NOTIFICATION_PREFERENCE_DEFAULTS,
      channelRemindersPushEnabled: false,
      channelRemindersTelegramEnabled: false,
      activeSubscriptionCount: 2,
      pushConfigured: true,
    });
  });
  it('saves each reminder delivery preference independently', async () => {
    const { service, prisma } = setup();
    await service.updatePreferences('user-a', {
      channelRemindersTelegramEnabled: true,
    });
    expect(prisma.operationsNotificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channelRemindersTelegramEnabled: true,
        }),
        update: { channelRemindersTelegramEnabled: true },
      }),
    );
  });
  it('keeps default/no-op updates write-free and accepts an empty partial patch', async () => {
    const { service, prisma } = setup();
    await service.updatePreferences('user-a', {});
    await service.updatePreferences('user-a', {
      crmIncomingMessagesEnabled: false,
      crmMessagePreviewEnabled: false,
      crmFollowUpEnabled: true,
    });
    expect(
      prisma.operationsNotificationPreference.upsert,
    ).not.toHaveBeenCalled();
    expect(
      prisma.operationsNotificationPreference.update,
    ).not.toHaveBeenCalled();
  });
  it('stores only explicitly changed fields in the authorized workspace/member', async () => {
    const { service, prisma } = setup({
      webPushEnabled: true,
      crmIncomingMessagesEnabled: false,
    });
    await service.updatePreferences('user-a', {
      crmIncomingMessagesEnabled: true,
    });
    expect(prisma.operationsNotificationPreference.update).toHaveBeenCalledWith(
      {
        where: {
          workspaceId_memberId: {
            workspaceId: 'workspace-a',
            memberId: 'member-a',
          },
        },
        data: { crmIncomingMessagesEnabled: true },
      },
    );
  });
  it('creates opt-in through the existing composite key without changing global defaults', async () => {
    const { service, prisma } = setup();
    await service.updatePreferences('user-a', {
      crmIncomingMessagesEnabled: true,
    });
    expect(prisma.operationsNotificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          workspaceId: 'workspace-a',
          memberId: 'member-a',
          crmIncomingMessagesEnabled: true,
        },
        update: { crmIncomingMessagesEnabled: true },
      }),
    );
  });
});
