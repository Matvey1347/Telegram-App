const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { OperationsNotificationDeliveryPolicyService } from '../../operations/notifications/operations-notification-delivery-policy.service';
import { TelegramCrmNotificationDeliveryPolicy } from './telegram-crm-notification-delivery-policy.service';
import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';

const fact = {
  id: 'notification-current',
  type: 'CRM_MESSAGE_RECEIVED' as const,
  workspaceId: 'workspace-current',
  recipientMemberId: 'member-current',
  metadata: {
    messageId: 'message-current',
    conversationId: 'conversation-current',
    accountId: 'account-current',
    telegramMessageId: 42,
  },
};
const conversation = {
  id: 'conversation-current',
  workspaceId: 'workspace-current',
  mtprotoAccountId: 'account-current',
  telegramCrmPeerId: 'peer-current',
  contactId: 'contact-current',
  unreadCount: 1,
  lastReadInboxTelegramMessageId: 0,
};

function setup(
  recipientId = 'member-current',
  optedIn = true,
  eligible = true,
) {
  const registry = new OperationsNotificationDeliveryPolicyService();
  const snapshot = {
    contact: jest.fn().mockReturnValue({ id: 'contact-current' }),
    recipient: () => ({ id: recipientId }),
    incomingEnabled: () => optedIn,
  };
  const tx = {
    telegramCrmMessage: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'message-current',
          conversationId: 'conversation-current',
          mtprotoAccountId: 'account-current',
          telegramMessageIdNumeric: 42,
        },
      ]),
    },
    telegramCrmConversation: {
      findMany: jest.fn().mockResolvedValue(eligible ? [conversation] : []),
    },
  };
  const policy = new TelegramCrmNotificationDeliveryPolicy(
    registry,
    new TelegramCrmNotificationEligibilityService(),
    { load: jest.fn().mockResolvedValue(snapshot) } as never,
  );
  policy.onModuleInit();
  return { policy, registry, tx };
}

describe('TelegramCrmNotificationDeliveryPolicy', () => {
  it('rechecks current conversation and responsible recipient before allowing push', async () => {
    const { registry, tx } = setup();
    expect(await registry.filter(tx as never, [fact])).toEqual(
      new Set([fact.id]),
    );
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['member-other', true, true],
    ['member-current', false, true],
    ['member-current', true, false],
  ] as const)(
    'rejects reassigned, opted-out and no-longer-eligible delivery',
    async (recipient, optedIn, eligible) => {
      const { registry, tx } = setup(recipient, optedIn, eligible);
      expect(await registry.filter(tx as never, [fact])).toEqual(new Set());
    },
  );

  it('rejects an already read message and foreign-account metadata', async () => {
    const { registry, tx } = setup();
    tx.telegramCrmConversation.findMany.mockResolvedValue([
      { ...conversation, lastReadInboxTelegramMessageId: 42 },
    ]);
    expect(await registry.filter(tx as never, [fact])).toEqual(new Set());
    tx.telegramCrmConversation.findMany.mockResolvedValue([conversation]);
    expect(
      await registry.filter(tx as never, [
        {
          ...fact,
          metadata: { ...fact.metadata, accountId: 'account-foreign' },
        },
      ]),
    ).toEqual(new Set());
  });

  it('groups workspaces separately so a domain lookup cannot approve a foreign workspace row', async () => {
    const { registry, tx } = setup();
    tx.telegramCrmConversation.findMany.mockResolvedValue([]);
    await registry.filter(tx as never, [
      fact,
      { ...fact, id: 'foreign', workspaceId: 'workspace-foreign' },
    ]);
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledTimes(2);
  });
  it('denies deleted latest preview with another unread message still present', async () => {
    const { registry, tx } = setup();
    tx.telegramCrmConversation.findMany.mockResolvedValue([
      { ...conversation, unreadCount: 1 },
    ]);
    tx.telegramCrmMessage.findMany.mockResolvedValue([]);
    expect(await registry.filter(tx as never, [fact])).toEqual(new Set());
    expect(tx.telegramCrmMessage.findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          workspaceId: 'workspace-current',
          deletedAt: null,
          id: { in: ['message-current'] },
        }),
      }),
    );
  });
  it('batch-checks message ownership and denies forged identity without N+1', async () => {
    const { registry, tx } = setup();
    expect(
      await registry.filter(tx as never, [
        fact,
        {
          ...fact,
          id: 'second',
          metadata: {
            ...fact.metadata,
            conversationId: 'foreign-conversation',
          },
        },
      ]),
    ).toEqual(new Set([fact.id]));
    expect(tx.telegramCrmMessage.findMany).toHaveBeenCalledTimes(1);
  });
});
