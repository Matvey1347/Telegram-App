import { TelegramCrmNotificationGroups } from './telegram-crm-notification-groups';

describe('TelegramCrmNotificationGroups', () => {
  function setup() {
    const tx = {
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'conversation-current',
            mtprotoAccountId: 'account-current',
            contactId: 'contact-current',
          },
        ]),
      },
      operationsNotification: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ recipientMemberId: 'member-current' }]),
        deleteMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };
    return { tx, groups: new TelegramCrmNotificationGroups() };
  }

  it('removes only the exact account/conversation group and shrinking legacy keys after a read', async () => {
    const { groups, tx } = setup();
    expect(
      await groups.reconcile(tx as never, 'workspace-current', [
        {
          conversationId: 'conversation-current',
          contactId: 'contact-current',
          unreadCount: 0,
        },
      ]),
    ).toEqual(['member-current']);
    expect(tx.operationsNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-current',
        type: 'CRM_MESSAGE_RECEIVED',
        sourceKey: {
          in: [
            'conversation:conversation-current',
            'contact:contact-current',
            'account:account-current:conversation:conversation-current',
          ],
        },
      },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('updates remaining unread metadata while retiring legacy groups only on read', async () => {
    const { groups, tx } = setup();
    await groups.reconcile(tx as never, 'workspace-current', [
      {
        conversationId: 'conversation-current',
        contactId: 'contact-current',
        unreadCount: 2,
      },
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.operationsNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-current',
        type: 'CRM_MESSAGE_RECEIVED',
        sourceKey: {
          in: ['conversation:conversation-current', 'contact:contact-current'],
        },
      },
    });
  });

  it('does no query for idle and no write without matching notifications', async () => {
    const { groups, tx } = setup();
    await groups.reconcile(tx as never, 'workspace-current', []);
    expect(tx.telegramCrmConversation.findMany).not.toHaveBeenCalled();
    tx.operationsNotification.findMany.mockResolvedValue([]);
    await groups.reconcile(tx as never, 'workspace-current', [
      {
        conversationId: 'conversation-current',
        contactId: null,
        unreadCount: 0,
      },
    ]);
    expect(tx.operationsNotification.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
