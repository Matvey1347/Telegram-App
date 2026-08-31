import {
  TelegramCrmMessageDirection,
  TelegramCrmReadState,
} from '@prisma/client';
import { TelegramCrmReadService } from './telegram-crm-read.service';

const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

describe('TelegramCrmReadService', () => {
  it('uses the highest Telegram message id, including an outbound last message, while only updating inbound read rows', async () => {
    const conversation = {
      id: 'conversation-1',
      mtprotoAccountId: 'account-fixed',
      telegramAccessHash: 'access-hash',
      contactId: null,
      unreadCount: 3,
      lastReadInboxTelegramMessageId: 80,
      peer: { id: 'peer-1', telegramUserId: '42', username: 'recipient' },
      contact: null,
      messages: [{ telegramMessageIdNumeric: 99 }],
    };
    const handle = { markRead: jest.fn().mockResolvedValue(undefined) };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspaceId: string,
          _accountId: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const transaction = {
      telegramCrmMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      telegramCrmConversation: { update: jest.fn() },
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(
        async (operation: (tx: unknown) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        requireOwnOrAny: jest.fn(),
      } as never,
      runtime as never,
      events as never,
    );

    await expect(service.markRead('user-1', 'conversation-1')).resolves.toEqual(
      {
        conversationId: 'conversation-1',
        lastReadInboxTelegramMessageId: 99,
        readMessageCount: 2,
        unreadCount: 0,
      },
    );
    expect(runtime.withAccountHandle).toHaveBeenCalledWith(
      'workspace-1',
      'account-fixed',
      'sync',
      expect.any(Function),
    );
    expect(handle.markRead).toHaveBeenCalledWith(
      expect.objectContaining({ maxTelegramMessageId: 99 }),
    );
    const updateMessagesCall = callArgument(
      transaction.telegramCrmMessage.updateMany,
    );
    expect(updateMessagesCall).toMatchObject({
      where: {
        workspaceId: 'workspace-1',
        direction: TelegramCrmMessageDirection.INBOUND,
        telegramMessageIdNumeric: { lte: 99 },
        readState: { not: TelegramCrmReadState.READ },
      },
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'readChanged', unreadCount: 0 }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation.unreadChanged',
        unreadCount: 0,
      }),
    );
  });
});
