import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';

describe('TelegramCrmNotificationEligibilityService', () => {
  const service = new TelegramCrmNotificationEligibilityService();
  const conversation = {
    id: 'conversation-current',
    workspaceId: 'workspace-current',
    mtprotoAccountId: 'account-current',
    telegramCrmPeerId: 'peer-current',
    contactId: null,
    unreadCount: 1,
    lastReadInboxTelegramMessageId: 41,
  };

  it('checks current conversation, account and archived-contact state in one workspace-scoped batch', async () => {
    const findMany = jest.fn().mockResolvedValue([conversation]);
    expect(
      (
        await service.load(
          { telegramCrmConversation: { findMany } } as never,
          'workspace-current',
          ['conversation-current', 'conversation-current'],
        )
      ).get('conversation-current'),
    ).toEqual(conversation);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-current',
        id: { in: ['conversation-current'] },
        state: 'ACTIVE',
        unreadCount: { gt: 0 },
        mtprotoAccount: {
          workspaceId: 'workspace-current',
          isActive: true,
          status: 'connected',
          crmSyncEnabled: true,
        },
        OR: [{ contactId: null }, { contact: { archivedAt: null } }],
      },
      select: {
        id: true,
        workspaceId: true,
        mtprotoAccountId: true,
        telegramCrmPeerId: true,
        contactId: true,
        unreadCount: true,
        lastReadInboxTelegramMessageId: true,
      },
    });
  });

  it('rejects read watermarks and foreign account messages without state writes', () => {
    expect(service.unreadMessage(conversation, 'account-current', 42)).toBe(
      true,
    );
    expect(service.unreadMessage(conversation, 'account-current', 41)).toBe(
      false,
    );
    expect(service.unreadMessage(conversation, 'account-foreign', 42)).toBe(
      false,
    );
    expect(service.unreadMessage(conversation, 'account-current', null)).toBe(
      false,
    );
  });

  it('does no query when there is no event', async () => {
    expect(await service.load({} as never, 'workspace-current', [])).toEqual(
      new Map(),
    );
  });
});
