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
      expect.objectContaining({
        data: expect.objectContaining({
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
});
