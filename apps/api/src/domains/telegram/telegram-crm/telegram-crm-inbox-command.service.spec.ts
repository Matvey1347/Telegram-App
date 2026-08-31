import { ConflictException } from '@nestjs/common';
import { TelegramCrmInboxCommandService } from './telegram-crm-inbox-command.service';

const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const now = new Date('2026-08-31T10:00:00.000Z');
const contact = {
  id: 'contact-1',
  workspaceId: 'workspace-1',
  displayName: 'Alice Example',
  companyName: null,
  telegramUsername: 'alice',
  phone: null,
  email: null,
  website: null,
  description: null,
  source: 'TELEGRAM_INBOX',
  stage: 'QUALIFIED',
  ownerMemberId: 'member-1',
  automatedMessagesEnabled: false,
  automatedMessagesEnabledAt: null,
  lastContactAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  lastPurchaseAt: null,
  nextContactAt: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  _count: { sales: 0 },
};

describe('TelegramCrmInboxCommandService', () => {
  const authorization = {
    require: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
    }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('promotes one canonical Peer and links all of its account Conversations with automation disabled', async () => {
    const lastMessageAt = new Date('2026-08-31T12:00:00.000Z');
    const lastInboundAt = new Date('2026-08-31T11:00:00.000Z');
    const lastOutboundAt = new Date('2026-08-31T13:00:00.000Z');
    const tx = {
      telegramCrmPeer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'peer-1',
          contactId: null,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Example',
          telegramUserId: '42',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramAdvertiser: { create: jest.fn().mockResolvedValue(contact) },
      telegramCrmConversation: {
        aggregate: jest.fn().mockResolvedValue({
          _max: { lastMessageAt, lastInboundAt, lastOutboundAt },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (value: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmInboxCommandService(
      prisma as never,
      authorization as never,
      events as never,
    );

    await expect(
      service.promote('user-1', 'peer-1', { stage: 'QUALIFIED' }),
    ).resolves.toMatchObject({
      peerId: 'peer-1',
      linkedConversationCount: 2,
      contact: {
        id: 'contact-1',
        stage: 'QUALIFIED',
        automatedMessagesEnabled: false,
      },
    });
    const createContactCall = callArgument(tx.telegramAdvertiser.create);
    expect(createContactCall).toMatchObject({
      data: {
        workspaceId: 'workspace-1',
        ownerMemberId: 'member-1',
        source: 'TELEGRAM_INBOX',
        automatedMessagesEnabled: false,
        automatedMessagesEnabledAt: null,
        lastContactAt: lastOutboundAt,
        lastInboundAt,
        lastOutboundAt,
      },
    });
    expect(tx.telegramCrmPeer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'peer-1',
        workspaceId: 'workspace-1',
        contactId: null,
      },
      data: { contactId: 'contact-1' },
    });
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramCrmPeerId: 'peer-1',
        contactId: null,
      },
      data: { contactId: 'contact-1' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contact.updated' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inbox.updated' }),
    );
  });

  it('rejects the CAS loser before linking Conversations or emitting events', async () => {
    const tx = {
      telegramCrmPeer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'peer-1',
          contactId: null,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Example',
          telegramUserId: '42',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      telegramAdvertiser: { create: jest.fn().mockResolvedValue(contact) },
      telegramCrmConversation: {
        aggregate: jest.fn().mockResolvedValue({
          _max: {
            lastMessageAt: null,
            lastInboundAt: null,
            lastOutboundAt: null,
          },
        }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmInboxCommandService(
      prisma as never,
      authorization as never,
      events as never,
    );

    await expect(
      service.promote('user-1', 'peer-1', { stage: 'LEAD' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each(['IGNORED', 'ARCHIVED'] as const)(
    'persists %s as a reversible state on every unlinked account Conversation',
    async (state) => {
      const prisma = {
        telegramCrmPeer: {
          findFirst: jest.fn().mockResolvedValue({ id: 'peer-1' }),
        },
        telegramCrmConversation: {
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      const events = { emit: jest.fn() };
      const service = new TelegramCrmInboxCommandService(
        prisma as never,
        authorization as never,
        events as never,
      );

      await expect(
        service.setState('user-1', 'peer-1', { state }),
      ).resolves.toEqual({
        peerId: 'peer-1',
        state,
        changedConversationCount: 2,
      });
      expect(prisma.telegramCrmConversation.updateMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'workspace-1',
          telegramCrmPeerId: 'peer-1',
          NOT: { state },
        },
        data: { state },
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'inbox.updated' }),
      );
    },
  );
});
