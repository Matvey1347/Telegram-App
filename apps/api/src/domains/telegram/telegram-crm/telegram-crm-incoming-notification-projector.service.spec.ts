import {
  OperationsNotificationPriority,
  TelegramCrmMessageDirection,
} from '@prisma/client';
import type { CrmMessageBatchInput } from './telegram-crm-message-batch-writer.service';
import { TelegramCrmIncomingNotificationProjector } from './telegram-crm-incoming-notification-projector.service';

const message = {
  id: 'message-1',
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  telegramMessageId: '42',
  direction: TelegramCrmMessageDirection.INBOUND,
  text: 'Hello from Telegram',
};

const input: CrmMessageBatchInput = {
  conversation: {
    id: 'conversation-1',
    telegramCrmPeerId: 'peer-1',
    contactId: 'contact-1',
  },
  message: {
    telegramMessageId: 42,
    telegramUserId: '777',
    direction: 'INBOUND',
    text: 'Hello from Telegram',
    sentAt: new Date(),
    editedAt: null,
    contentMetadata: null,
  },
};

describe('TelegramCrmIncomingNotificationProjector', () => {
  const txWithContactUnread = (unreadCount: number) => ({
    telegramCrmConversation: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ contactId: 'contact-1', _sum: { unreadCount } }]),
    },
    operationsNotification: { deleteMany: jest.fn() },
  });

  function setup(contact: unknown = null) {
    const snapshot = {
      contact: jest.fn().mockReturnValue(contact),
      recipient: jest.fn().mockReturnValue({ id: 'member-1' }),
      priority: jest.fn().mockReturnValue(OperationsNotificationPriority.HIGH),
    };
    const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
    const notifications = {
      upsertMany: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
    };
    return {
      projector: new TelegramCrmIncomingNotificationProjector(
        recipients as never,
        notifications as never,
      ),
      recipients,
      notifications,
    };
  }

  it('does not create Operations notifications for incoming Telegram messages', async () => {
    const contact = {
      id: 'contact-1',
      displayName: 'Ada',
      ownerMemberId: 'member-1',
    };
    const { projector, notifications } = setup(contact);

    const tx = txWithContactUnread(1);
    await expect(
      projector.project(
        tx as never,
        'workspace-1',
        'live',
        [input],
        [message as never],
      ),
    ).resolves.toEqual([]);
    expect(notifications.upsertMany).not.toHaveBeenCalled();
  });

  it('does not create notifications for unpromoted Telegram peers', async () => {
    const { projector, notifications } = setup(null);
    await projector.project(
      txWithContactUnread(5) as never,
      'workspace-1',
      'live',
      [{ ...input, conversation: { ...input.conversation, contactId: null } }],
      [message as never],
    );
    expect(notifications.upsertMany).not.toHaveBeenCalled();
  });

  it('does not project grouped inbound messages into notifications', async () => {
    const { projector, notifications } = setup(null);
    const withPeer = {
      ...input,
      conversation: {
        ...input.conversation,
        unreadCount: 3,
        peer: {
          telegramUserId: '777',
          username: 'ada',
          firstName: 'Ada',
          lastName: 'Lovelace',
          photoUrl: 'https://cdn.example/ada.jpg',
        },
      },
    };
    await projector.project(
      txWithContactUnread(5) as never,
      'workspace-1',
      'live',
      [
        withPeer,
        {
          ...withPeer,
          message: { ...withPeer.message, telegramMessageId: 43 },
        },
      ],
      [
        message as never,
        { ...message, id: 'message-2', telegramMessageId: '43' } as never,
      ],
    );

    expect(notifications.upsertMany).not.toHaveBeenCalled();
  });

  it('removes a read Conversation group only inside its workspace', async () => {
    const { projector } = setup(null);
    const operationsNotification = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ recipientMemberId: 'member-1' }]),
      deleteMany: jest.fn(),
    };

    await expect(
      projector.removeConversationGroup(
        { operationsNotification } as never,
        'workspace-1',
        'conversation-1',
      ),
    ).resolves.toEqual(['member-1']);
    expect(operationsNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        type: 'CRM_MESSAGE_RECEIVED',
        sourceKey: { in: ['conversation:conversation-1'] },
      },
    });
  });

  it('keeps a partially unread group and updates its remaining message count', async () => {
    const { projector } = setup(null);
    const operationsNotification = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ recipientMemberId: 'member-1' }]),
      deleteMany: jest.fn(),
    };
    const executeRaw = jest.fn().mockResolvedValue(1);

    await expect(
      projector.reconcileConversationGroups(
        { operationsNotification, $executeRaw: executeRaw } as never,
        'workspace-1',
        [
          {
            conversationId: 'conversation-1',
            contactId: null,
            unreadCount: 2,
          },
        ],
      ),
    ).resolves.toEqual(['member-1']);
    expect(operationsNotification.deleteMany).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('deletes a group after Telegram reports no unread messages', async () => {
    const { projector } = setup(null);
    const operationsNotification = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ recipientMemberId: 'member-1' }]),
      deleteMany: jest.fn(),
    };

    await projector.reconcileConversationGroups(
      { operationsNotification, $executeRaw: jest.fn() } as never,
      'workspace-1',
      [
        {
          conversationId: 'conversation-1',
          contactId: null,
          unreadCount: 0,
        },
      ],
    );

    const deleteInput = (
      operationsNotification.deleteMany.mock.calls as unknown[][]
    )[0]?.[0] as { where: Record<string, unknown> };
    expect(deleteInput.where).toMatchObject({
      workspaceId: 'workspace-1',
      sourceKey: { in: ['conversation:conversation-1'] },
    });
  });

  it.each([
    ['snapshot', input, message],
    ['history', input, message],
    ['live', { ...input, edited: true }, message],
    [
      'live',
      { ...input, message: { ...input.message, direction: 'OUTBOUND' } },
      { ...message, direction: TelegramCrmMessageDirection.OUTBOUND },
    ],
  ] as const)(
    'creates none for %s/edited/outgoing work',
    async (mode, fact, row) => {
      const { projector, notifications } = setup(null);
      await expect(
        projector.project(
          {} as never,
          'workspace-1',
          mode,
          [fact as CrmMessageBatchInput],
          [row as never],
        ),
      ).resolves.toEqual([]);
      expect(notifications.upsertMany).not.toHaveBeenCalled();
    },
  );
});
