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
  function setup(contact: unknown = null) {
    const snapshot = {
      contact: jest.fn().mockReturnValue(contact),
      recipient: jest.fn().mockReturnValue({ id: 'member-1' }),
      priority: jest.fn().mockReturnValue(OperationsNotificationPriority.HIGH),
    };
    const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
    const notifications = {
      insertMany: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
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

  it('creates one same-transaction notification with the canonical Contact deep link', async () => {
    const contact = {
      id: 'contact-1',
      displayName: 'Ada',
      ownerMemberId: 'member-1',
    };
    const { projector, notifications } = setup(contact);

    await expect(
      projector.project(
        {} as never,
        'workspace-1',
        'live',
        [input],
        [message as never],
      ),
    ).resolves.toEqual([{ id: 'notification-1' }]);
    expect(notifications.insertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        sourceKey: 'message:message-1',
        targetUrl:
          '/ad-sales/contacts/contact-1/conversations/conversation-1?workspaceId=workspace-1',
        visibilityMemberId: 'member-1',
        visibilityResourceKey: 'crm-contact:contact-1',
      }),
    ]);
  });

  it('uses the bounded Inbox deep link for an unpromoted peer', async () => {
    const { projector, notifications } = setup(null);
    await projector.project(
      {} as never,
      'workspace-1',
      'live',
      [{ ...input, conversation: { ...input.conversation, contactId: null } }],
      [message as never],
    );
    expect(notifications.insertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        targetUrl:
          '/ad-sales/inbox?conversationId=conversation-1&peerId=peer-1&workspaceId=workspace-1',
      }),
    ]);
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
      expect(notifications.insertMany).not.toHaveBeenCalled();
    },
  );
});
