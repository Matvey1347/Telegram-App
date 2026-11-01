const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { Prisma } from '@prisma/client';
import { TelegramCrmMessageStoreService } from './telegram-crm-message-store.service';

const input = {
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  mtprotoAccountId: 'account-1',
  telegramMessageId: '42',
  direction: 'INBOUND' as const,
  origin: 'TELEGRAM_SYNC' as const,
  sentByMemberId: null,
  text: 'Historical message',
  sentAt: '2026-09-01T09:00:00.000Z',
};

const message = {
  id: 'message-1',
  ...input,
  contentMetadata: null,
  sentAt: new Date(input.sentAt),
  editedAt: null,
  readState: 'UNKNOWN',
  deliveryState: 'UNKNOWN',
  createdAt: new Date(input.sentAt),
};

describe('TelegramCrmMessageStoreService', () => {
  it('stores TELEGRAM_SYNC history with no invented Member attribution', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-1',
          contactId: 'contact-1',
          lastMessageAt: null,
          lastInboundAt: null,
          lastOutboundAt: null,
          unreadCount: 0,
        }),
        update: jest.fn(),
      },
      telegramCrmMessage: { create: jest.fn().mockResolvedValue(message) },
      workspaceMember: { findFirst: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      telegramCrmMessage: { findUnique: jest.fn() },
    };
    const service = new TelegramCrmMessageStoreService(prisma as never);

    await service.store(input);

    expect(tx.telegramCrmMessage.create).toHaveBeenCalledWith(
      containing({
        data: containing({
          origin: 'TELEGRAM_SYNC',
          sentByMemberId: null,
        }),
      }),
    );
    expect(tx.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns the existing Message after an idempotency conflict', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(conflict),
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(message) },
    };
    const service = new TelegramCrmMessageStoreService(prisma as never);

    await expect(service.store(input)).resolves.toMatchObject({
      id: 'message-1',
      telegramMessageId: '42',
    });
  });
  it('rejects a legacy store attempt after an account deletion tombstone without creating a message', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
      },
      telegramCrmDeletedMessage: {
        findUnique: jest.fn().mockResolvedValue({ telegramMessageId: 42 }),
      },
      telegramCrmMessage: { create: jest.fn() },
    };
    const service = new TelegramCrmMessageStoreService({
      $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
    } as never);
    await expect(service.store(input)).rejects.toThrow('CHAT_MESSAGE_DELETED');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmMessage.create).not.toHaveBeenCalled();
  });
});
